import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Employee } from '@/models/Employee';
import { DailyAttendance } from '@/models/DailyAttendance';
import { AttendanceLog } from '@/models/AttendanceLog';
import { Holiday } from '@/models/Holiday';
import { ensureAttendanceSeeded } from '@/lib/attendance-seed';
import {
  autoMarkAbsentForDate,
  getDhakaDateString,
  normalizeDhakaDate,
  resolveEmployeeSchedule,
} from '@/lib/attendance-engine';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensureAttendanceSeeded();

    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'my';
    const isAdmin = auth.user.role === 'Admin';

    const myEmployee = await Employee.findOne({ userId: auth.user.userId })
      .populate('schedule_id', 'name start_time end_time grace_minutes working_days')
      .lean();

    const todayStr = getDhakaDateString();
    const { dateObj: todayObj } = normalizeDhakaDate(todayStr);

    // 1. Employee Self Calendar & Monthly Summary Mode
    if (mode === 'my' || !isAdmin) {
      const now = new Date();
      const month = parseInt(searchParams.get('month') || String(now.getMonth() + 1), 10);
      const year = parseInt(searchParams.get('year') || String(now.getFullYear()), 10);

      if (!myEmployee) {
        return NextResponse.json({
          success: true,
          data: {
            myEmployee: null,
            todayStr,
            todayRecord: null,
            todayLogs: [],
            days: [],
            holidays: [],
            schedule: null,
            summary: {
              present: 0,
              late: 0,
              halfDay: 0,
              absent: 0,
              leave: 0,
              holiday: 0,
              weekend: 0,
              overtimeHours: 0,
              workedHours: 0,
            },
          },
        });
      }

      const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

      const [days, todayRecord, todayLogs, holidays, schedule] = await Promise.all([
        DailyAttendance.find({
          employee_id: myEmployee._id,
          date: { $gte: monthStart, $lte: monthEnd },
        })
          .sort({ date: 1 })
          .lean(),
        DailyAttendance.findOne({ employee_id: myEmployee._id, date: todayObj }).lean(),
        AttendanceLog.find({ employee_id: myEmployee._id, date: todayObj })
          .sort({ timestamp: 1 })
          .lean(),
        Holiday.find({ date: { $gte: monthStart, $lte: monthEnd }, active: true }).lean(),
        resolveEmployeeSchedule(myEmployee as any),
      ]);

      const summary = days.reduce(
        (acc, d: any) => {
          if (d.status === 'Present') acc.present++;
          else if (d.status === 'Late') acc.late++;
          else if (d.status === 'Half-day') acc.halfDay++;
          else if (d.status === 'Absent') acc.absent++;
          else if (d.status === 'Leave') acc.leave++;
          else if (d.status === 'Holiday') acc.holiday++;
          else if (d.status === 'Weekend') acc.weekend++;
          acc.overtimeHours = Math.round((acc.overtimeHours + (d.overtime_hours || 0)) * 100) / 100;
          acc.workedHours = Math.round((acc.workedHours + (d.worked_hours || 0)) * 100) / 100;
          return acc;
        },
        {
          present: 0,
          late: 0,
          halfDay: 0,
          absent: 0,
          leave: 0,
          holiday: 0,
          weekend: 0,
          overtimeHours: 0,
          workedHours: 0,
        }
      );

      return NextResponse.json({
        success: true,
        data: {
          myEmployee,
          todayStr,
          todayRecord,
          todayLogs,
          days,
          holidays,
          schedule,
          month,
          year,
          summary,
        },
      });
    }

    // 2. Manager / HR Roster & Date-Range Mode
    const dateParam = searchParams.get('date') || todayStr;
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const department = searchParams.get('department') || 'all';
    const statusFilter = searchParams.get('status') || 'all';
    const sourceFilter = searchParams.get('source') || 'all';

    const empFilter: Record<string, any> = { status: { $in: ['Active', 'On Leave'] } };
    if (department !== 'all') empFilter.department = department;

    const employees = await Employee.find(empFilter)
      .select('employee_id biometric_id shift firstName lastName phone department designation schedule_id')
      .sort({ department: 1, firstName: 1 })
      .lean();

    // Date Range report
    if (startDateParam && endDateParam) {
      const { dateObj: rangeStart } = normalizeDhakaDate(startDateParam);
      const { dateObj: rangeEnd } = normalizeDhakaDate(endDateParam);
      const empIds = employees.map((e) => e._id);

      const query: Record<string, any> = {
        employee_id: { $in: empIds },
        date: { $gte: rangeStart, $lte: rangeEnd },
      };
      if (statusFilter !== 'all') query.status = statusFilter;
      if (sourceFilter !== 'all') query.source = sourceFilter;

      const records = await DailyAttendance.find(query)
        .populate('employee_id', 'employee_id firstName lastName department designation')
        .sort({ date: -1 })
        .lean();

      return NextResponse.json({
        success: true,
        data: {
          mode: 'range',
          startDate: startDateParam,
          endDate: endDateParam,
          records,
        },
      });
    }

    // Single day Live Roster
    const { dateObj, dateString } = normalizeDhakaDate(dateParam);
    const dailyDocs = await DailyAttendance.find({ date: dateObj })
      .populate('schedule_id', 'name start_time end_time')
      .lean();

    const docMap = new Map<string, any>();
    for (const d of dailyDocs) {
      docMap.set(d.employee_id.toString(), d);
    }

    let present = 0;
    let late = 0;
    let halfDay = 0;
    let absent = 0;
    let onLeave = 0;
    let holidayOrWeekend = 0;
    let unmarked = 0;

    let roster = employees.map((emp: any) => {
      const rec = docMap.get(emp._id.toString()) || null;
      if (rec) {
        if (rec.status === 'Present') present++;
        else if (rec.status === 'Late') late++;
        else if (rec.status === 'Half-day') halfDay++;
        else if (rec.status === 'Absent') absent++;
        else if (rec.status === 'Leave') onLeave++;
        else if (rec.status === 'Holiday' || rec.status === 'Weekend') holidayOrWeekend++;
      } else {
        unmarked++;
      }
      return {
        employee: { ...emp, _id: emp._id.toString() },
        daily: rec,
      };
    });

    if (statusFilter !== 'all') {
      roster = roster.filter((r) => (r.daily?.status || 'Unmarked') === statusFilter);
    }
    if (sourceFilter !== 'all') {
      roster = roster.filter((r) => r.daily?.source === sourceFilter);
    }

    return NextResponse.json({
      success: true,
      data: {
        mode: 'roster',
        date: dateString,
        todayStr,
        roster,
        summary: {
          total: employees.length,
          present,
          late,
          halfDay,
          absent,
          onLeave,
          holidayOrWeekend,
          unmarked,
        },
      },
    });
  } catch (error: any) {
    console.error('GET /api/attendance/daily error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch daily attendance' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    await connectDB();

    if (body.action === 'auto_mark_absent') {
      const result = await autoMarkAbsentForDate(body.date);
      await createAuditLog({
        user: auth.user,
        action: 'ATTENDANCE_AUTO_ABSENT_RUN',
        entity: 'DailyAttendance',
        newValues: result,
      });

      return NextResponse.json({
        success: true,
        message: `Auto-marked ${result.markedAbsent} absent, ${result.markedHolidayOrWeekendOrLeave} holiday/weekend/leave across ${result.processed} employee(s) for ${result.date}.`,
        data: result,
      });
    }

    if (body.action === 'approve_overtime' && body.daily_id) {
      const daily = await DailyAttendance.findByIdAndUpdate(
        body.daily_id,
        { $set: { overtime_approved: Boolean(body.approved) } },
        { returnDocument: 'after' }
      );
      if (!daily) {
        return NextResponse.json({ success: false, message: 'Daily record not found' }, { status: 404 });
      }
      await createAuditLog({
        user: auth.user,
        action: 'OVERTIME_APPROVAL_UPDATED',
        entity: 'DailyAttendance',
        entityId: daily._id.toString(),
        newValues: { overtime_approved: daily.overtime_approved, overtime_hours: daily.overtime_hours },
      });
      return NextResponse.json({
        success: true,
        message: `Overtime ${daily.overtime_approved ? 'approved' : 'unapproved'}.`,
        data: daily,
      });
    }

    return NextResponse.json({ success: false, message: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Attendance job failed' },
      { status: 500 }
    );
  }
}

