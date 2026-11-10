import { Employee, IEmployee } from '@/models/Employee';
import { WorkingSchedule, IWorkingSchedule } from '@/models/WorkingSchedule';
import { Holiday } from '@/models/Holiday';
import { AttendanceLog } from '@/models/AttendanceLog';
import { DailyAttendance, DailyAttendanceStatus } from '@/models/DailyAttendance';
import { Leave } from '@/models/Leave';
import { ensureAttendanceSeeded } from '@/lib/attendance-seed';

export function getDhakaDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function normalizeDhakaDate(dateStr?: string): { dateObj: Date; dateString: string } {
  const clean = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : getDhakaDateString();
  const [y, m, d] = clean.split('-').map(Number);
  return {
    dateObj: new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)),
    dateString: clean,
  };
}

export function getDhakaDayOfWeek(dateString: string): number {
  const [y, m, d] = dateString.split('-').map(Number);
  // UTC noon avoids DST/midnight edge cases; Bangladesh has no DST
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

export function parseDhakaTimeOnDate(dateString: string, hhmm: string): Date {
  const [y, m, d] = dateString.split('-').map(Number);
  const [hh, mm] = (hhmm || '09:00').split(':').map(Number);
  // Asia/Dhaka is UTC+06:00 -> UTC time = local - 6h
  return new Date(Date.UTC(y, m - 1, d, (hh || 0) - 6, mm || 0, 0, 0));
}

export async function resolveEmployeeSchedule(emp: Partial<IEmployee> & { _id?: any; department?: string; schedule_id?: any }): Promise<IWorkingSchedule> {
  await ensureAttendanceSeeded();

  if (emp.schedule_id) {
    const assigned = await WorkingSchedule.findById(emp.schedule_id).lean();
    if (assigned) return assigned as unknown as IWorkingSchedule;
  }

  if (emp.department) {
    const deptSched = await WorkingSchedule.findOne({
      department: emp.department,
      active: true,
    }).lean();
    if (deptSched) return deptSched as unknown as IWorkingSchedule;
  }

  const def = await WorkingSchedule.findOne({ is_default: true }).lean();
  if (def) return def as unknown as IWorkingSchedule;

  const anySched = await WorkingSchedule.findOne({ active: true }).lean();
  if (!anySched) throw new Error('No Working Schedule configured.');
  return anySched as unknown as IWorkingSchedule;
}

export async function recomputeDailyAttendance(
  employeeId: string,
  dateStr?: string,
  options?: {
    ignoreLock?: boolean;
    preserveManualOverride?: boolean;
    explicitStatusOverride?: DailyAttendanceStatus;
    notes?: string;
    legacyAttendanceId?: string;
  }
) {
  await ensureAttendanceSeeded();

  const emp = await Employee.findById(employeeId).lean();
  if (!emp) throw new Error('Employee not found');

  const { dateObj, dateString } = normalizeDhakaDate(dateStr);
  const existing = await DailyAttendance.findOne({ employee_id: employeeId, date: dateObj });

  if (existing?.locked && !options?.ignoreLock) {
    throw new Error(`Attendance for ${dateString} is locked because payroll has been confirmed.`);
  }

  if (existing?.is_manual_override && options?.preserveManualOverride) {
    return existing;
  }

  const schedule = await resolveEmployeeSchedule(emp);
  const dayOfWeek = getDhakaDayOfWeek(dateString);
  const isWorkingDay = (schedule.working_days || [0, 1, 2, 3, 4]).includes(dayOfWeek);

  const holiday = await Holiday.findOne({ date: dateObj, active: true }).lean();
  const approvedLeave = await Leave.findOne({
    employee_id: employeeId,
    status: 'Approved',
    start_date: { $lte: new Date(dateObj.getTime() + 24 * 60 * 60 * 1000 - 1) },
    end_date: { $gte: dateObj },
  }).lean();

  const logs = await AttendanceLog.find({
    employee_id: employeeId,
    date: dateObj,
  })
    .sort({ timestamp: 1 })
    .lean();

  let firstIn: Date | null = null;
  let lastOut: Date | null = null;

  for (const log of logs) {
    if (log.punch_type === 'IN' && !firstIn) {
      firstIn = new Date(log.timestamp);
    }
    if (log.punch_type === 'OUT') {
      lastOut = new Date(log.timestamp);
    }
  }

  // Fallback if only IN/OUT pairs or mixed punches
  if (!firstIn && logs.length > 0) {
    firstIn = new Date(logs[0].timestamp);
  }

  let workedHours = 0;
  let missingCheckout = false;

  if (firstIn && lastOut && lastOut > firstIn) {
    workedHours = Math.round(((lastOut.getTime() - firstIn.getTime()) / (1000 * 60 * 60)) * 100) / 100;
  } else if (firstIn && !lastOut) {
    missingCheckout = true;
  }

  // Late calculation against schedule start + grace_minutes
  let lateMinutes = 0;
  if (firstIn && isWorkingDay && !holiday) {
    const expectedStart = parseDhakaTimeOnDate(dateString, schedule.start_time || '09:00');
    const diffMins = Math.floor((firstIn.getTime() - expectedStart.getTime()) / (1000 * 60));
    if (diffMins > (schedule.grace_minutes || 0)) {
      lateMinutes = diffMins;
    }
  }

  // Overtime calculation
  let overtimeHours = 0;
  const otThreshold = schedule.overtime_after_hours || schedule.standard_hours || 8;
  if (workedHours > otThreshold) {
    overtimeHours = Math.round((workedHours - otThreshold) * 100) / 100;
  } else if (firstIn && lastOut && (!isWorkingDay || Boolean(holiday))) {
    // Working on Holiday/Weekend counts as overtime
    overtimeHours = workedHours;
  }

  // Conflict check: both punches AND approved leave on same day
  const hasPunch = logs.length > 0;
  const hasConflict = Boolean(hasPunch && approvedLeave);

  // Determine Daily Status
  let status: DailyAttendanceStatus = 'Absent';
  if (options?.explicitStatusOverride) {
    status = options.explicitStatusOverride;
  } else if (holiday && !hasPunch) {
    status = 'Holiday';
  } else if (!isWorkingDay && !hasPunch) {
    status = 'Weekend';
  } else if (approvedLeave && !hasPunch) {
    status = 'Leave';
  } else if (hasPunch) {
    if (
      !missingCheckout &&
      workedHours > 0 &&
      workedHours < (schedule.half_day_hours || 4)
    ) {
      status = 'Half-day';
    } else if (lateMinutes > 0) {
      status = 'Late';
    } else {
      status = 'Present';
    }
  } else {
    status = 'Absent';
  }

  const leaveIsPaid = approvedLeave
    ? (approvedLeave as any).is_paid !== undefined
      ? Boolean((approvedLeave as any).is_paid)
      : approvedLeave.leave_type !== 'Unpaid'
    : null;

  const updatePayload = {
    schedule_id: schedule._id,
    first_in: firstIn,
    last_out: lastOut,
    worked_hours: workedHours,
    late_minutes: lateMinutes,
    overtime_hours: overtimeHours,
    overtime_approved: schedule.overtime_needs_approval ? existing?.overtime_approved || false : true,
    status,
    leave_id: approvedLeave ? approvedLeave._id : null,
    leave_is_paid: leaveIsPaid,
    has_conflict: hasConflict,
    missing_checkout: missingCheckout,
    is_manual_override: Boolean(options?.explicitStatusOverride),
    notes: options?.notes !== undefined ? options.notes : existing?.notes || '',
    ...(options?.legacyAttendanceId ? { legacy_attendance_id: options.legacyAttendanceId } : {}),
  };

  const saved = await DailyAttendance.findOneAndUpdate(
    { employee_id: employeeId, date: dateObj },
    { $set: updatePayload },
    { upsert: true, new: true }
  );

  return saved;
}

export async function autoMarkAbsentForDate(dateStr?: string) {
  await ensureAttendanceSeeded();
  const { dateObj, dateString } = normalizeDhakaDate(dateStr);

  const activeEmployees = await Employee.find({ status: { $in: ['Active', 'On Leave'] } }).lean();
  let processed = 0;
  let markedAbsent = 0;
  let markedHolidayOrWeekendOrLeave = 0;

  for (const emp of activeEmployees) {
    const existing = await DailyAttendance.findOne({ employee_id: emp._id, date: dateObj }).lean();
    if (existing) {
      processed++;
      continue;
    }

    const res = await recomputeDailyAttendance(emp._id.toString(), dateString);
    processed++;
    if (res.status === 'Absent') markedAbsent++;
    else if (res.status === 'Holiday' || res.status === 'Weekend' || res.status === 'Leave') {
      markedHolidayOrWeekendOrLeave++;
    }
  }

  return {
    date: dateString,
    processed,
    markedAbsent,
    markedHolidayOrWeekendOrLeave,
  };
}

