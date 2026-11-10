import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Employee } from '@/models/Employee';
import { Attendance, AttendanceStatus } from '@/models/Attendance';

interface AttendancePostBody {
  action?: 'check_in' | 'check_out';
  employee_id?: string;
  date?: string;
  status?: AttendanceStatus;
  check_in?: string | null;
  check_out?: string | null;
  notes?: string;
}

function getDhakaDateString(d = new Date()): string {
  // Format YYYY-MM-DD in Asia/Dhaka (UTC+6)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function normalizeDateUTC(dateStr?: string): { dateObj: Date; dateString: string } {
  const clean = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : getDhakaDateString();
  const [y, m, d] = clean.split('-').map(Number);
  return {
    dateObj: new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)),
    dateString: clean,
  };
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const { dateObj, dateString } = normalizeDateUTC(searchParams.get('date') || undefined);
    const { dateObj: todayDateObj, dateString: todayString } = normalizeDateUTC();

    const [employees, attendanceDocs, myEmployee] = await Promise.all([
      Employee.find({ status: { $in: ['Active', 'On Leave'] } })
        .sort({ department: 1, firstName: 1 })
        .lean(),
      Attendance.find({ date: dateObj }).lean(),
      Employee.findOne({ userId: auth.user.userId }).lean(),
    ]);

    const attMap = new Map<string, any>();
    for (const a of attendanceDocs) {
      attMap.set(a.employee_id.toString(), a);
    }

    let present = 0;
    let late = 0;
    let halfDay = 0;
    let absent = 0;
    let unmarked = 0;

    const roster = employees.map((emp: any) => {
      const rec = attMap.get(emp._id.toString()) || null;
      if (rec) {
        if (rec.status === 'Present') present++;
        else if (rec.status === 'Late') late++;
        else if (rec.status === 'Half-Day') halfDay++;
        else if (rec.status === 'Absent') absent++;
      } else {
        unmarked++;
      }

      return {
        employee: {
          _id: emp._id.toString(),
          employee_id: emp.employee_id,
          firstName: emp.firstName,
          lastName: emp.lastName,
          phone: emp.phone,
          department: emp.department,
          designation: emp.designation,
          status: emp.status,
        },
        attendance: rec
          ? {
              _id: rec._id.toString(),
              date: rec.date,
              check_in: rec.check_in,
              check_out: rec.check_out,
              status: rec.status,
              notes: rec.notes || '',
            }
          : null,
      };
    });

    let myTodayRecord = null;
    if (myEmployee) {
      myTodayRecord = await Attendance.findOne({
        employee_id: myEmployee._id,
        date: todayDateObj,
      }).lean();
    }

    return NextResponse.json({
      success: true,
      data: {
        date: dateString,
        today: todayString,
        roster,
        myEmployee,
        myTodayRecord,
        summary: {
          total: employees.length,
          present,
          late,
          halfDay,
          absent,
          unmarked,
        },
      },
    });
  } catch (error: any) {
    console.error('GET /api/hrm/attendance error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load attendance' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as AttendancePostBody;
    await connectDB();

    // 1. Staff Self Check-In / Check-Out (or Admin quick check-in for an employee)
    if (body.action === 'check_in' || body.action === 'check_out') {
      const targetEmployee =
        body.employee_id && auth.user.role === 'Admin'
          ? await Employee.findById(body.employee_id)
          : await Employee.findOne({ userId: auth.user.userId });

      if (!targetEmployee) {
        return NextResponse.json(
          {
            success: false,
            message:
              'No Employee profile is linked to your ERP user account. Ask an Administrator to link your user in Employees & Agents.',
          },
          { status: 404 }
        );
      }

      const { dateObj } = normalizeDateUTC(body.date);
      const now = new Date();

      let record = await Attendance.findOne({
        employee_id: targetEmployee._id,
        date: dateObj,
      });

      if (body.action === 'check_in') {
        if (record && record.check_in) {
          return NextResponse.json(
            { success: false, message: 'Already checked in for today.' },
            { status: 400 }
          );
        }

        // Check Dhaka time: after 10:15 AM marks as Late automatically
        const dhakaHourMin = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Dhaka',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(now);
        const [hh, mm] = dhakaHourMin.split(':').map(Number);
        const autoStatus: AttendanceStatus =
          hh > 10 || (hh === 10 && mm > 15) ? 'Late' : 'Present';

        if (!record) {
          record = await Attendance.create({
            employee_id: targetEmployee._id,
            date: dateObj,
            check_in: now,
            status: autoStatus,
            notes: body.notes || '',
            marked_by: auth.user.name,
          });
        } else {
          record.check_in = now;
          record.status = autoStatus;
          await record.save();
        }

        await createAuditLog({
          user: auth.user,
          action: 'ATTENDANCE_CHECK_IN',
          entity: 'Attendance',
          entityId: record._id.toString(),
          newValues: {
            employee_id: targetEmployee.employee_id,
            status: record.status,
            check_in: record.check_in,
          },
        });

        return NextResponse.json({
          success: true,
          message: `Checked in at ${dhakaHourMin} (${record.status})`,
          data: record,
        });
      }

      // action === 'check_out'
      if (!record || !record.check_in) {
        return NextResponse.json(
          { success: false, message: 'You need to Check In first before Checking Out.' },
          { status: 400 }
        );
      }
      if (record.check_out) {
        return NextResponse.json(
          { success: false, message: 'Already checked out for today.' },
          { status: 400 }
        );
      }

      record.check_out = now;
      await record.save();

      await createAuditLog({
        user: auth.user,
        action: 'ATTENDANCE_CHECK_OUT',
        entity: 'Attendance',
        entityId: record._id.toString(),
        newValues: {
          employee_id: targetEmployee.employee_id,
          check_out: record.check_out,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Checked out successfully for today.',
        data: record,
      });
    }

    // 2. Admin Roster Marking Mode
    if (auth.user.role !== 'Admin') {
      return NextResponse.json(
        { success: false, message: 'Only Administrators can mark attendance for other staff.' },
        { status: 403 }
      );
    }

    if (!body.employee_id || !body.status) {
      return NextResponse.json(
        { success: false, message: 'employee_id and status are required.' },
        { status: 400 }
      );
    }

    const emp = await Employee.findById(body.employee_id);
    if (!emp) {
      return NextResponse.json({ success: false, message: 'Employee not found' }, { status: 404 });
    }

    const { dateObj, dateString } = normalizeDateUTC(body.date);

    const existing = await Attendance.findOne({ employee_id: emp._id, date: dateObj });
    let savedRecord;
    if (existing) {
      existing.status = body.status;
      if (body.check_in !== undefined) {
        existing.check_in = body.check_in ? new Date(body.check_in) : null;
      }
      if (body.check_out !== undefined) {
        existing.check_out = body.check_out ? new Date(body.check_out) : null;
      }
      if (body.notes !== undefined) existing.notes = body.notes.trim();
      existing.marked_by = auth.user.name;
      savedRecord = await existing.save();
    } else {
      const defaultIn =
        body.status !== 'Absent' ? (body.check_in ? new Date(body.check_in) : new Date()) : null;
      savedRecord = await Attendance.create({
        employee_id: emp._id,
        date: dateObj,
        check_in: defaultIn,
        check_out: body.check_out ? new Date(body.check_out) : null,
        status: body.status,
        notes: body.notes?.trim() || '',
        marked_by: auth.user.name,
      });
    }

    await createAuditLog({
      user: auth.user,
      action: 'ATTENDANCE_MARKED',
      entity: 'Attendance',
      entityId: savedRecord._id.toString(),
      newValues: {
        employee_id: emp.employee_id,
        date: dateString,
        status: savedRecord.status,
      },
    });

    return NextResponse.json({
      success: true,
      message: `${emp.firstName} ${emp.lastName} marked ${savedRecord.status} for ${dateString}.`,
      data: savedRecord,
    });
  } catch (error: any) {
    console.error('POST /api/hrm/attendance error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to record attendance' },
      { status: 500 }
    );
  }
}

