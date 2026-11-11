import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Employee } from '@/models/Employee';
import { DailyAttendance, DailyAttendanceStatus } from '@/models/DailyAttendance';
import { Holiday } from '@/models/Holiday';
import { Leave, LeaveType } from '@/models/Leave';
import {
  checkDateBlockedForAttendance,
  getDhakaDateString,
  normalizeDhakaDate,
  recomputeDailyAttendance,
  replaceManualPunchesForDate,
  resolveEmployeeSchedule,
} from '@/lib/attendance-engine';

interface BulkEntryItem {
  employee_id: string;
  date: string;
  status: DailyAttendanceStatus;
  leave_type?: LeaveType;
  check_in_time?: string;
  check_out_time?: string;
  remark?: string;
}

interface BulkPostBody {
  entries: BulkEntryItem[];
  reason: string;
  overwriteExisting?: boolean;
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    void Leave;

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date') || getDhakaDateString();
    const department = searchParams.get('department') || 'all';
    const shift = searchParams.get('shift') || 'all';

    const { dateObj, dateString } = normalizeDhakaDate(dateParam);

    const empFilter: Record<string, unknown> = {
      is_deleted: { $ne: true },
      status: { $in: ['Active', 'On Leave'] },
    };
    if (department !== 'all') empFilter.department = department;
    if (shift !== 'all') empFilter.shift = shift;

    const employees = await Employee.find(empFilter)
      .select('employee_id biometric_id shift firstName lastName department designation schedule_id')
      .sort({ department: 1, firstName: 1 })
      .lean();

    const [dailyDocs, dateBlock, activeHolidays] = await Promise.all([
        DailyAttendance.find({ date: dateObj })
          .populate('leave_id', 'leave_type is_paid status')
          .lean(),
        checkDateBlockedForAttendance(dateString),
        Holiday.find({ active: true }).sort({ date: 1 }).lean(),
      ]);

    const dailyMap = new Map<string, (typeof dailyDocs)[number]>();
    for (const d of dailyDocs) {
      dailyMap.set(d.employee_id.toString(), d);
    }

    const rows = await Promise.all(
        employees.map(async (emp) => {
          const sched = await resolveEmployeeSchedule(emp);
          const existing = dailyMap.get(emp._id.toString()) || null;
          const leaveObj = existing?.leave_id as unknown as {
            leave_type?: LeaveType;
            is_paid?: boolean;
          } | null;

          return {
            employee: { ...emp, _id: emp._id.toString() },
            schedule: {
              name: sched.name,
              start_time: sched.start_time,
              end_time: sched.end_time,
              grace_minutes: sched.grace_minutes ?? 10,
            },
            existing: existing
              ? {
                _id: existing._id.toString(),
                status: existing.status,
                source: existing.source,
                first_in: existing.first_in,
                last_out: existing.last_out,
                leave_type: leaveObj?.leave_type || null,
                leave_is_paid: existing.leave_is_paid ?? leaveObj?.is_paid ?? null,
                notes: existing.notes || '',
                locked: existing.locked,
              }
              : null,
          };
        })
    );

    return NextResponse.json({
      success: true,
      data: {
        date: dateString,
        holiday: dateBlock.holiday,
        weeklyOff: dateBlock.weeklyOff,
        blockReason: dateBlock.reason,
        activeHolidays,
        rows,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to load bulk roster';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as BulkPostBody;
    if (!Array.isArray(body.entries) || body.entries.length === 0) {
      return NextResponse.json(
        { success: false, message: 'At least one attendance entry is required.' },
        { status: 400 }
      );
    }
    if (!body.reason?.trim()) {
      return NextResponse.json(
        { success: false, message: 'A reason is required for bulk manual attendance entry.' },
        { status: 400 }
      );
    }

    await connectDB();

    const reasonText = body.reason.trim();
    const overwrite = Boolean(body.overwriteExisting);
    let savedCount = 0;
    let skippedExistingCount = 0;
    let lockedCount = 0;

    for (const item of body.entries) {
      const { dateObj, dateString } = normalizeDhakaDate(item.date);
      const empDoc = await Employee.findById(item.employee_id).lean();
      if (!empDoc) continue;

      if (item.status === 'Present' || item.status === 'Late' || item.status === 'Half-day') {
          const block = await checkDateBlockedForAttendance(dateString, empDoc);
          if (block.blocked) {
            return NextResponse.json({ success: false, message: block.reason }, { status: 400 });
          }
        }

        const existing = await DailyAttendance.findOne({
          employee_id: item.employee_id,
          date: dateObj,
        }).lean();

        if (existing?.locked) {
          lockedCount++;
          continue;
        }

        if (existing && !overwrite) {
          skippedExistingCount++;
          continue;
        }

        const needsTimes =
          item.status === 'Present' || item.status === 'Late' || item.status === 'Half-day';

        await replaceManualPunchesForDate({
          employeeId: item.employee_id,
          dateStr: dateString,
          inTime: needsTimes ? item.check_in_time : undefined,
          outTime: needsTimes ? item.check_out_time : undefined,
          clearExistingManual: true,
          reason: item.remark?.trim() || reasonText,
          recordedBy: auth.user.name,
        });

        let leaveId: string | null | undefined;
        let leaveIsPaid: boolean | null | undefined;
        let finalNote = item.remark?.trim() || reasonText;

        if (item.status === 'Leave') {
          const lType: LeaveType = item.leave_type || 'Casual';
          const isPaid = lType !== 'Unpaid';
          let leaveDoc = await Leave.findOne({
            employee_id: item.employee_id,
            status: 'Approved',
            start_date: { $lte: new Date(dateObj.getTime() + 24 * 60 * 60 * 1000 - 1) },
            end_date: { $gte: dateObj },
          });
          if (!leaveDoc) {
            leaveDoc = await Leave.create({
              employee_id: item.employee_id,
              leave_type: lType,
              is_paid: isPaid,
              start_date: dateObj,
              end_date: dateObj,
              reason: item.remark?.trim() || reasonText,
              status: 'Approved',
              reviewed_by: auth.user.name,
              reviewed_at: new Date(),
            });
          } else {
            leaveDoc.leave_type = lType;
            leaveDoc.is_paid = isPaid;
            await leaveDoc.save();
          }
          leaveId = leaveDoc._id.toString();
          leaveIsPaid = isPaid;
          finalNote = `${lType} Leave (${isPaid ? 'Paid' : 'Unpaid'}) — ${finalNote}`;
        }

        await recomputeDailyAttendance(item.employee_id, dateString, {
          explicitStatusOverride: item.status,
          preferredSource: 'Manual',
          notes: finalNote,
          leaveId,
          leaveIsPaid,
        });

        savedCount++;
      }

      await createAuditLog({
        user: auth.user,
        action: 'ATTENDANCE_BULK_MANUAL',
        entity: 'DailyAttendance',
        newValues: {
          submitted: body.entries.length,
          savedCount,
          skippedExistingCount,
          lockedCount,
          overwrite,
          reason: reasonText,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Saved ${savedCount} record(s)${skippedExistingCount ? `, skipped ${skippedExistingCount} existing` : ''
          }${lockedCount ? `, ${lockedCount} locked` : ''}.`,
        data: { savedCount, skippedExistingCount, lockedCount },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Bulk save failed';
      return NextResponse.json({ success: false, message: msg }, { status: 500 });
    }
  }
