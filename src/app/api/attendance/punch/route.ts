import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Employee } from '@/models/Employee';
import { AttendanceLog, PunchType } from '@/models/AttendanceLog';
import { DailyAttendance, DailyAttendanceStatus } from '@/models/DailyAttendance';
import {
  checkDateBlockedForAttendance,
  getDhakaDateString,
  normalizeDhakaDate,
  recomputeDailyAttendance,
  replaceManualPunchesForDate,
  resolveEmployeeSchedule,
  getDhakaDayOfWeek,
} from '@/lib/attendance-engine';
import { Leave, LeaveType } from '@/models/Leave';

interface PunchBody {
  mode: 'self' | 'hr_manual' | 'hr_bulk_present';
  punch_type?: PunchType;
  location?: string;
  // HR manual edit fields
  employee_id?: string;
  date?: string; // YYYY-MM-DD
  check_in_time?: string; // HH:mm
  check_out_time?: string; // HH:mm
  status_override?: DailyAttendanceStatus | '';
  quick_status?: DailyAttendanceStatus;
  leave_type?: LeaveType;
  reason?: string;
}

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as PunchBody;
    await connectDB();

    const ipAddress = getClientIp(req);

    // 1. Employee Self Check-In / Check-Out
    if (body.mode === 'self') {
      const emp = await Employee.findOne({ userId: auth.user.userId });
      if (!emp) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Your ERP user is not linked to an Employee profile. Ask Admin to link your user in Employees & Agents.',
          },
          { status: 404 }
        );
      }

      const todayStr = getDhakaDateString();
      const { dateObj } = normalizeDhakaDate(todayStr);
      const existingDaily = await DailyAttendance.findOne({
        employee_id: emp._id,
        date: dateObj,
      }).lean();

      if (existingDaily?.locked) {
        return NextResponse.json(
          { success: false, message: 'Attendance for this month is locked.' },
          { status: 400 }
        );
      }

      const todayBlock = await checkDateBlockedForAttendance(todayStr, emp);
      if (todayBlock.blocked) {
        return NextResponse.json(
          {
            success: false,
            message: `${todayBlock.reason} Self check-in is closed on this day.`,
          },
          { status: 400 }
        );
      }

      const punchType: PunchType = body.punch_type === 'OUT' ? 'OUT' : 'IN';
      const now = new Date();

      const log = await AttendanceLog.create({
        employee_id: emp._id,
        date: dateObj,
        timestamp: now,
        punch_type: punchType,
        source: 'Self Check-in',
        ip_address: ipAddress,
        location: body.location?.trim() || '',
        reason: 'Self web check-in/out',
        recorded_by: auth.user.name,
      });

      const summary = await recomputeDailyAttendance(emp._id.toString(), todayStr, {
        preferredSource: 'Self Check-in',
      });

      await createAuditLog({
        user: auth.user,
        action: `ATTENDANCE_SELF_${punchType}`,
        entity: 'AttendanceLog',
        entityId: log._id.toString(),
        ipAddress,
        newValues: {
          employee_id: emp.employee_id,
          punch_type: punchType,
          timestamp: now,
          daily_status: summary.status,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Checked ${punchType} recorded successfully (${summary.status}).`,
        data: { log, summary },
      });
    }

    // 2. HR / Admin Bulk Mark Unmarked Active Employees Present
    if (body.mode === 'hr_bulk_present') {
      if (auth.user.role !== 'Admin') {
        return NextResponse.json(
          { success: false, message: 'Only Admin/HR can bulk mark attendance.' },
          { status: 403 }
        );
      }

      const { dateObj, dateString } = normalizeDhakaDate(body.date);
      const dateBlock = await checkDateBlockedForAttendance(dateString);
      if (dateBlock.blocked) {
        return NextResponse.json(
          { success: false, message: dateBlock.reason },
          { status: 400 }
        );
      }

      const employees = await Employee.find({ status: { $in: ['Active', 'On Leave'] } }).lean();
      let markedCount = 0;

      for (const emp of employees) {
        const existing = await DailyAttendance.findOne({ employee_id: emp._id, date: dateObj }).lean();
        if (existing) continue;

        const schedule = await resolveEmployeeSchedule(emp as any);
        const dow = getDhakaDayOfWeek(dateString);
        if (!(schedule.working_days || [0, 1, 2, 3, 4]).includes(dow)) continue;

        const onLeave = await Leave.exists({
          employee_id: emp._id,
          status: 'Approved',
          start_date: { $lte: new Date(dateObj.getTime() + 24 * 60 * 60 * 1000 - 1) },
          end_date: { $gte: dateObj },
        });
        if (onLeave) continue;

        await replaceManualPunchesForDate({
          employeeId: emp._id.toString(),
          dateStr: dateString,
          inTime: schedule.start_time || '09:00',
          outTime: schedule.end_time || '18:00',
          clearExistingManual: true,
          reason: 'Bulk manual HR Present marking',
          recordedBy: auth.user.name,
          ipAddress,
        });

        await recomputeDailyAttendance(emp._id.toString(), dateString, {
          notes: 'Bulk manual HR attendance',
        });
        markedCount++;
      }

      await createAuditLog({
        user: auth.user,
        action: 'ATTENDANCE_BULK_MANUAL_PRESENT',
        entity: 'DailyAttendance',
        newValues: { date: dateString, markedCount },
      });

      return NextResponse.json({
        success: true,
        message: `Marked ${markedCount} unmarked employee(s) Present on ${dateString}.`,
        data: { date: dateString, markedCount },
      });
    }

    // 3. HR / Admin Manual Entry & Edit (with Reason & AuditLog)
    if (auth.user.role !== 'Admin') {
      return NextResponse.json(
        { success: false, message: 'Only Admin/HR can manually record or edit attendance.' },
        { status: 403 }
      );
    }

    if (!body.employee_id || !body.date) {
      return NextResponse.json(
        { success: false, message: 'employee_id and date are required for HR manual entry.' },
        { status: 400 }
      );
    }

    const reasonText = body.reason?.trim() || 'Manual HR attendance entry';

    const emp = await Employee.findById(body.employee_id);
    if (!emp) {
      return NextResponse.json({ success: false, message: 'Employee not found' }, { status: 404 });
    }

    const { dateObj, dateString } = normalizeDhakaDate(body.date);
    const oldDaily = await DailyAttendance.findOne({ employee_id: emp._id, date: dateObj }).lean();
    if (oldDaily?.locked) {
      return NextResponse.json(
        { success: false, message: `Attendance for ${dateString} is locked. Unlock the month first.` },
        { status: 400 }
      );
    }

    const targetStatus = body.quick_status || body.status_override || 'Present';
    const isAttendanceMark =
      targetStatus === 'Present' || targetStatus === 'Late' || targetStatus === 'Half-day';
    if (isAttendanceMark) {
      const dateBlock = await checkDateBlockedForAttendance(dateString, emp);
      if (dateBlock.blocked) {
        return NextResponse.json(
          {
            success: false,
            message: `${dateBlock.reason} Cannot mark ${targetStatus}.`,
          },
          { status: 400 }
        );
      }
    }

    // Quick status marking from roster row (Present, Late, Half-day, Absent)
    if (body.quick_status) {
      let inTime: string | undefined;
      let outTime: string | undefined;

      if (body.quick_status !== 'Absent') {
        const schedule = await resolveEmployeeSchedule(emp as any);
        inTime = schedule.start_time || '09:00';
        outTime = schedule.end_time || '18:00';

        if (body.quick_status === 'Late') {
          const [hh, mm] = inTime.split(':').map(Number);
          const totalMin = hh * 60 + mm + (schedule.grace_minutes || 10) + 15;
          inTime = `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
        } else if (body.quick_status === 'Half-day') {
          const [hh, mm] = inTime.split(':').map(Number);
          const halfMins = Math.round(((schedule.half_day_hours || 4) - 0.5) * 60);
          const totalMin = hh * 60 + mm + Math.max(120, halfMins);
          outTime = `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
        }
      }

      await replaceManualPunchesForDate({
        employeeId: emp._id.toString(),
        dateStr: dateString,
        inTime,
        outTime,
        clearExistingManual: true,
        reason: reasonText,
        recordedBy: auth.user.name,
        ipAddress,
      });

      const updatedDaily = await recomputeDailyAttendance(emp._id.toString(), dateString, {
        explicitStatusOverride: body.quick_status,
        preferredSource: 'Manual',
        notes: reasonText,
      });

      await createAuditLog({
        user: auth.user,
        action: 'ATTENDANCE_HR_QUICK_MARK',
        entity: 'DailyAttendance',
        entityId: updatedDaily._id.toString(),
        ipAddress,
        oldValues: oldDaily ? { status: oldDaily.status } : undefined,
        newValues: {
          employee_id: emp.employee_id,
          date: dateString,
          status: updatedDaily.status,
          reason: reasonText,
        },
      });

      return NextResponse.json({
        success: true,
        message: `${emp.firstName} ${emp.lastName} marked ${updatedDaily.status} for ${dateString}.`,
        data: updatedDaily,
      });
    }

    // Replace existing manual HR punches on this date (preserving biometric logs!) if check_in/out times are supplied
    if (body.check_in_time || body.check_out_time) {
      await replaceManualPunchesForDate({
        employeeId: emp._id.toString(),
        dateStr: dateString,
        inTime: body.check_in_time,
        outTime: body.check_out_time,
        clearExistingManual: true,
        reason: reasonText,
        recordedBy: auth.user.name,
        ipAddress,
      });
    }

    let leaveId: string | undefined;
    let leaveIsPaid: boolean | undefined;
    if (body.status_override === 'Leave') {
      const resolvedLeaveType: LeaveType = body.leave_type || 'Casual';
      leaveIsPaid = resolvedLeaveType !== 'Unpaid';
      let leaveDoc = await Leave.findOne({
        employee_id: emp._id,
        status: 'Approved',
        start_date: { $lte: dateObj },
        end_date: { $gte: dateObj },
      });
      if (!leaveDoc) {
        leaveDoc = await Leave.create({
          employee_id: emp._id,
          leave_type: resolvedLeaveType,
          is_paid: leaveIsPaid,
          start_date: dateObj,
          end_date: dateObj,
          reason: reasonText || `Manual ${resolvedLeaveType} leave`,
          status: 'Approved',
          reviewed_by: auth.user.name,
          reviewed_at: new Date(),
        });
      } else if (body.leave_type) {
        leaveDoc.leave_type = resolvedLeaveType;
        leaveDoc.is_paid = leaveIsPaid;
        await leaveDoc.save();
      }
      leaveId = leaveDoc._id.toString();
      leaveIsPaid = leaveDoc.is_paid ?? leaveDoc.leave_type !== 'Unpaid';
    }

    const updatedDaily = await recomputeDailyAttendance(emp._id.toString(), dateString, {
      explicitStatusOverride: body.status_override ? body.status_override : undefined,
      preferredSource: 'Manual',
      notes: reasonText,
      leaveId,
      leaveIsPaid,
    });

    await createAuditLog({
      user: auth.user,
      action: 'ATTENDANCE_HR_MANUAL_EDIT',
      entity: 'DailyAttendance',
      entityId: updatedDaily._id.toString(),
      ipAddress,
      oldValues: oldDaily
        ? {
            status: oldDaily.status,
            first_in: oldDaily.first_in,
            last_out: oldDaily.last_out,
            worked_hours: oldDaily.worked_hours,
          }
        : undefined,
      newValues: {
        employee_id: emp.employee_id,
        date: dateString,
        status: updatedDaily.status,
        first_in: updatedDaily.first_in,
        last_out: updatedDaily.last_out,
        worked_hours: updatedDaily.worked_hours,
        reason: reasonText,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Attendance updated for ${emp.firstName} ${emp.lastName} on ${dateString}.`,
      data: updatedDaily,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to record attendance punch' },
      { status: 500 }
    );
  }
}

