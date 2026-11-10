import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Employee } from '@/models/Employee';
import { AttendanceLog, PunchType } from '@/models/AttendanceLog';
import { DailyAttendance, DailyAttendanceStatus } from '@/models/DailyAttendance';
import {
  getDhakaDateString,
  normalizeDhakaDate,
  parseDhakaTimeOnDate,
  recomputeDailyAttendance,
} from '@/lib/attendance-engine';

interface PunchBody {
  mode: 'self' | 'hr_manual';
  punch_type?: PunchType;
  location?: string;
  // HR manual edit fields
  employee_id?: string;
  date?: string; // YYYY-MM-DD
  check_in_time?: string; // HH:mm
  check_out_time?: string; // HH:mm
  status_override?: DailyAttendanceStatus | '';
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

      const punchType: PunchType = body.punch_type === 'OUT' ? 'OUT' : 'IN';
      const now = new Date();

      const log = await AttendanceLog.create({
        employee_id: emp._id,
        date: dateObj,
        timestamp: now,
        punch_type: punchType,
        source: 'web',
        ip_address: ipAddress,
        location: body.location?.trim() || '',
        reason: 'Self web check-in/out',
        recorded_by: auth.user.name,
      });

      const summary = await recomputeDailyAttendance(emp._id.toString(), todayStr);

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

    // 2. HR / Admin Manual Entry & Edit (with mandatory Reason & AuditLog)
    if (auth.user.role !== 'Admin') {
      return NextResponse.json(
        { success: false, message: 'Only Admin/HR can manually record or edit attendance.' },
        { status: 403 }
      );
    }

    if (!body.employee_id || !body.date || !body.reason?.trim()) {
      return NextResponse.json(
        { success: false, message: 'employee_id, date, and reason are required for HR manual entry.' },
        { status: 400 }
      );
    }

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

    // Replace existing manual HR punches on this date if check_in/out times are supplied
    if (body.check_in_time || body.check_out_time) {
      await AttendanceLog.deleteMany({ employee_id: emp._id, date: dateObj });

      if (body.check_in_time) {
        await AttendanceLog.create({
          employee_id: emp._id,
          date: dateObj,
          timestamp: parseDhakaTimeOnDate(dateString, body.check_in_time),
          punch_type: 'IN',
          source: 'hr',
          ip_address: ipAddress,
          reason: body.reason.trim(),
          recorded_by: auth.user.name,
        });
      }

      if (body.check_out_time) {
        await AttendanceLog.create({
          employee_id: emp._id,
          date: dateObj,
          timestamp: parseDhakaTimeOnDate(dateString, body.check_out_time),
          punch_type: 'OUT',
          source: 'hr',
          ip_address: ipAddress,
          reason: body.reason.trim(),
          recorded_by: auth.user.name,
        });
      }
    }

    const updatedDaily = await recomputeDailyAttendance(emp._id.toString(), dateString, {
      explicitStatusOverride: body.status_override ? body.status_override : undefined,
      notes: body.reason.trim(),
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
        reason: body.reason.trim(),
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

