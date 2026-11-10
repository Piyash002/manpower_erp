import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { WorkingSchedule } from '@/models/WorkingSchedule';
import { Holiday } from '@/models/Holiday';
import { Employee } from '@/models/Employee';
import { ensureAttendanceSeeded } from '@/lib/attendance-seed';
import { normalizeDhakaDate } from '@/lib/attendance-engine';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensureAttendanceSeeded();

    const [schedules, holidays, employees] = await Promise.all([
      WorkingSchedule.find({}).sort({ is_default: -1, createdAt: 1 }).lean(),
      Holiday.find({}).sort({ date: 1 }).lean(),
      Employee.find({ status: { $in: ['Active', 'On Leave'] } })
        .select('employee_id firstName lastName department schedule_id manager_id')
        .sort({ firstName: 1 })
        .lean(),
    ]);

    return NextResponse.json({
      success: true,
      data: { schedules, holidays, employees },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load attendance settings' },
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

    if (body.kind === 'holiday') {
      if (!body.title?.trim() || !body.date) {
        return NextResponse.json(
          { success: false, message: 'Holiday title and date are required.' },
          { status: 400 }
        );
      }
      const { dateObj } = normalizeDhakaDate(body.date);
      const holiday = await Holiday.create({
        title: body.title.trim(),
        date: dateObj,
        type: body.type || 'Government',
        description: body.description?.trim() || '',
        active: true,
      });

      await createAuditLog({
        user: auth.user,
        action: 'HOLIDAY_CREATED',
        entity: 'Holiday',
        entityId: holiday._id.toString(),
        newValues: { title: holiday.title, date: body.date, type: holiday.type },
      });

      return NextResponse.json(
        { success: true, message: `Holiday "${holiday.title}" added.`, data: holiday },
        { status: 201 }
      );
    }

    if (body.kind === 'assign_schedule') {
      const { employee_id, schedule_id } = body;
      if (!employee_id) {
        return NextResponse.json(
          { success: false, message: 'employee_id is required.' },
          { status: 400 }
        );
      }
      const emp = await Employee.findByIdAndUpdate(
        employee_id,
        { $set: { schedule_id: schedule_id || null } },
        { new: true }
      );
      if (!emp) {
        return NextResponse.json({ success: false, message: 'Employee not found.' }, { status: 404 });
      }
      await createAuditLog({
        user: auth.user,
        action: 'EMPLOYEE_SCHEDULE_ASSIGNED',
        entity: 'Employee',
        entityId: emp._id.toString(),
        newValues: { employee_id: emp.employee_id, schedule_id: schedule_id || null },
      });
      return NextResponse.json({
        success: true,
        message: `Schedule updated for ${emp.firstName} ${emp.lastName}.`,
        data: emp,
      });
    }

    // Create Working Schedule
    if (!body.name?.trim() || !body.code?.trim()) {
      return NextResponse.json(
        { success: false, message: 'Schedule name and code are required.' },
        { status: 400 }
      );
    }

    const cleanCode = body.code.trim().toUpperCase();
    const exists = await WorkingSchedule.findOne({ code: cleanCode });
    if (exists) {
      return NextResponse.json(
        { success: false, message: `Schedule code "${cleanCode}" already exists.` },
        { status: 409 }
      );
    }

    if (body.is_default) {
      await WorkingSchedule.updateMany({}, { $set: { is_default: false } });
    }

    const schedule = await WorkingSchedule.create({
      name: body.name.trim(),
      code: cleanCode,
      department: body.department?.trim() || '',
      working_days: Array.isArray(body.working_days) ? body.working_days : [0, 1, 2, 3, 4],
      start_time: body.start_time || '09:00',
      end_time: body.end_time || '18:00',
      grace_minutes: Number(body.grace_minutes ?? 10),
      standard_hours: Number(body.standard_hours ?? 8),
      half_day_hours: Number(body.half_day_hours ?? 4),
      overtime_after_hours: Number(body.overtime_after_hours ?? 8),
      overtime_multiplier: Number(body.overtime_multiplier ?? 1.5),
      overtime_needs_approval: Boolean(body.overtime_needs_approval),
      late_rule_enabled: body.late_rule_enabled !== false,
      late_days_per_deduction: Number(body.late_days_per_deduction ?? 3),
      is_default: Boolean(body.is_default),
      active: true,
    });

    await createAuditLog({
      user: auth.user,
      action: 'WORKING_SCHEDULE_CREATED',
      entity: 'WorkingSchedule',
      entityId: schedule._id.toString(),
      newValues: { code: schedule.code, name: schedule.name },
    });

    return NextResponse.json(
      { success: true, message: `Schedule "${schedule.name}" created.`, data: schedule },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to save attendance setting' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    if (!body._id) {
      return NextResponse.json({ success: false, message: '_id is required.' }, { status: 400 });
    }
    await connectDB();

    if (body.is_default) {
      await WorkingSchedule.updateMany({ _id: { $ne: body._id } }, { $set: { is_default: false } });
    }

    const sched = await WorkingSchedule.findByIdAndUpdate(
      body._id,
      {
        $set: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.department !== undefined ? { department: body.department.trim() } : {}),
          ...(body.working_days !== undefined ? { working_days: body.working_days } : {}),
          ...(body.start_time !== undefined ? { start_time: body.start_time } : {}),
          ...(body.end_time !== undefined ? { end_time: body.end_time } : {}),
          ...(body.grace_minutes !== undefined ? { grace_minutes: Number(body.grace_minutes) } : {}),
          ...(body.standard_hours !== undefined ? { standard_hours: Number(body.standard_hours) } : {}),
          ...(body.half_day_hours !== undefined ? { half_day_hours: Number(body.half_day_hours) } : {}),
          ...(body.overtime_after_hours !== undefined
            ? { overtime_after_hours: Number(body.overtime_after_hours) }
            : {}),
          ...(body.overtime_multiplier !== undefined
            ? { overtime_multiplier: Number(body.overtime_multiplier) }
            : {}),
          ...(body.overtime_needs_approval !== undefined
            ? { overtime_needs_approval: Boolean(body.overtime_needs_approval) }
            : {}),
          ...(body.late_rule_enabled !== undefined
            ? { late_rule_enabled: Boolean(body.late_rule_enabled) }
            : {}),
          ...(body.late_days_per_deduction !== undefined
            ? { late_days_per_deduction: Number(body.late_days_per_deduction) }
            : {}),
          ...(body.is_default !== undefined ? { is_default: Boolean(body.is_default) } : {}),
          ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
        },
      },
      { new: true }
    );

    if (!sched) {
      return NextResponse.json({ success: false, message: 'Schedule not found.' }, { status: 404 });
    }

    await createAuditLog({
      user: auth.user,
      action: 'WORKING_SCHEDULE_UPDATED',
      entity: 'WorkingSchedule',
      entityId: sched._id.toString(),
      newValues: { code: sched.code, start_time: sched.start_time, end_time: sched.end_time },
    });

    return NextResponse.json({
      success: true,
      message: `Schedule "${sched.name}" updated.`,
      data: sched,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update schedule' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get('kind');
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });
    }
    await connectDB();

    if (kind === 'holiday') {
      await Holiday.findByIdAndDelete(id);
      await createAuditLog({
        user: auth.user,
        action: 'HOLIDAY_DELETED',
        entity: 'Holiday',
        entityId: id,
      });
      return NextResponse.json({ success: true, message: 'Holiday deleted.', data: { _id: id } });
    }

    return NextResponse.json({ success: false, message: 'Unsupported delete target' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete item' },
      { status: 500 }
    );
  }
}

