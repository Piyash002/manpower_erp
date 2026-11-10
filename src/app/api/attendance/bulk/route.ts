import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Employee } from '@/models/Employee';
import { DailyAttendance, DailyAttendanceStatus } from '@/models/DailyAttendance';
import {
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
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date') || getDhakaDateString();
    const department = searchParams.get('department') || 'all';
    const shift = searchParams.get('shift') || 'all';

    const { dateObj, dateString } = normalizeDhakaDate(dateParam);

    const empFilter: Record<string, any> = { status: { $in: ['Active', 'On Leave'] } };
    if (department !== 'all') empFilter.department = department;
    if (shift !== 'all') empFilter.shift = shift;

    const employees = await Employee.find(empFilter)
      .select('employee_id biometric_id shift firstName lastName department designation schedule_id')
      .sort({ department: 1, firstName: 1 })
      .lean();

    const dailyDocs = await DailyAttendance.find({ date: dateObj }).lean();
    const dailyMap = new Map<string, any>();
    for (const d of dailyDocs) {
      dailyMap.set(d.employee_id.toString(), d);
    }

    const rows = await Promise.all(
      employees.map(async (emp: any) => {
        const sched = await resolveEmployeeSchedule(emp);
        const existing = dailyMap.get(emp._id.toString()) || null;
        return {
          employee: { ...emp, _id: emp._id.toString() },
          schedule: {
            name: sched.name,
            start_time: sched.start_time,
            end_time: sched.end_time,
          },
          existing: existing
            ? {
                _id: existing._id.toString(),
                status: existing.status,
                source: existing.source,
                first_in: existing.first_in,
                last_out: existing.last_out,
                notes: existing.notes || '',
                locked: existing.locked,
              }
            : null,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: { date: dateString, rows },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load bulk roster' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
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

      await recomputeDailyAttendance(item.employee_id, dateString, {
        explicitStatusOverride: item.status,
        preferredSource: 'Manual',
        notes: item.remark?.trim() || reasonText,
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
      message: `Saved ${savedCount} record(s)${
        skippedExistingCount ? `, skipped ${skippedExistingCount} existing` : ''
      }${lockedCount ? `, ${lockedCount} locked` : ''}.`,
      data: { savedCount, skippedExistingCount, lockedCount },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Bulk save failed' },
      { status: 500 }
    );
  }
}

