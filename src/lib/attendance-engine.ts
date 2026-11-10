import { Employee, IEmployee } from '@/models/Employee';
import { WorkingSchedule, IWorkingSchedule } from '@/models/WorkingSchedule';
import { Holiday } from '@/models/Holiday';
import { AttendanceLog } from '@/models/AttendanceLog';
import {
  DailyAttendance,
  DailyAttendanceStatus,
  AttendanceSource,
} from '@/models/DailyAttendance';
import { Leave } from '@/models/Leave';
import { ensureAttendanceSeeded } from '@/lib/attendance-seed';

export function normalizeAttendanceSource(raw?: string): AttendanceSource {
  switch (raw) {
    case 'hr':
    case 'Manual':
      return 'Manual';
    case 'biometric':
    case 'Biometric':
      return 'Biometric';
    case 'csv':
    case 'Import':
      return 'Import';
    case 'web':
    case 'Self Check-in':
    default:
      return 'Self Check-in';
  }
}

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
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

export function parseDhakaTimeOnDate(dateString: string, hhmm: string): Date {
  const [y, m, d] = dateString.split('-').map(Number);
  const [hh, mm] = (hhmm || '09:00').split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, (hh || 0) - 6, mm || 0, 0, 0));
}

export interface RawPunchLite {
  timestamp: Date | string;
  punch_type: 'IN' | 'OUT';
  source: string;
}

/**
 * Pure helper: Ignore duplicate punches of the same punch_type within `windowMinutes`.
 */
export function deduplicatePunches<T extends RawPunchLite>(
  punches: T[],
  windowMinutes = 5
): T[] {
  const sorted = [...punches].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  if (windowMinutes <= 0) return sorted;

  const result: T[] = [];
  const windowMs = windowMinutes * 60 * 1000;

  for (const p of sorted) {
    const tMs = new Date(p.timestamp).getTime();
    const prevSameType = [...result]
      .reverse()
      .find((prev) => prev.punch_type === p.punch_type);

    if (prevSameType && tMs - new Date(prevSameType.timestamp).getTime() < windowMs) {
      continue;
    }
    result.push(p);
  }
  return result;
}

export function extractFirstInLastOut(punches: RawPunchLite[]): {
  firstIn: Date | null;
  lastOut: Date | null;
} {
  if (punches.length === 0) return { firstIn: null, lastOut: null };
  let firstIn: Date | null = null;
  let lastOut: Date | null = null;

  for (const p of punches) {
    const ts = new Date(p.timestamp);
    if (p.punch_type === 'IN' && !firstIn) firstIn = ts;
    if (p.punch_type === 'OUT') lastOut = ts;
  }

  // Fallback for devices that send generic punches without IN/OUT direction
  if (!firstIn && punches.length > 0) {
    firstIn = new Date(punches[0].timestamp);
  }
  if (!lastOut && punches.length > 1) {
    const tail = new Date(punches[punches.length - 1].timestamp);
    if (firstIn && tail > firstIn) {
      lastOut = tail;
    }
  }

  return { firstIn, lastOut };
}

export async function resolveEmployeeSchedule(
  emp: Partial<IEmployee> & { _id?: any; department?: string; shift?: string; schedule_id?: any }
): Promise<IWorkingSchedule> {
  await ensureAttendanceSeeded();

  if (emp.schedule_id) {
    const assigned = await WorkingSchedule.findById(emp.schedule_id).lean();
    if (assigned) return assigned as unknown as IWorkingSchedule;
  }

  if (emp.shift && emp.department) {
    const shiftDeptSched = await WorkingSchedule.findOne({
      department: emp.department,
      shift: emp.shift,
      active: true,
    }).lean();
    if (shiftDeptSched) return shiftDeptSched as unknown as IWorkingSchedule;
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
    explicitStatusOverride?: DailyAttendanceStatus;
    notes?: string;
    legacyAttendanceId?: string;
    preferredSource?: AttendanceSource;
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

  // Fetch raw logs (supporting night shift cross-midnight window if enabled)
  let rawLogs: any[];
  if (schedule.is_night_shift) {
    const shiftStartWindow = parseDhakaTimeOnDate(dateString, '12:00');
    const shiftEndWindow = new Date(shiftStartWindow.getTime() + 24 * 60 * 60 * 1000);
    rawLogs = await AttendanceLog.find({
      employee_id: employeeId,
      matched: true,
      timestamp: { $gte: shiftStartWindow, $lt: shiftEndWindow },
    })
      .sort({ timestamp: 1 })
      .lean();
  } else {
    rawLogs = await AttendanceLog.find({
      employee_id: employeeId,
      matched: true,
      date: dateObj,
    })
      .sort({ timestamp: 1 })
      .lean();
  }

  const dedupWindow = schedule.duplicate_punch_window_minutes ?? 5;
  const dedupedLogs = deduplicatePunches(rawLogs, dedupWindow);

  // Partition by canonical source
  const manualLogs = dedupedLogs.filter((l) => normalizeAttendanceSource(l.source) === 'Manual');
  const biometricLogs = dedupedLogs.filter(
    (l) => normalizeAttendanceSource(l.source) === 'Biometric'
  );
  const importLogs = dedupedLogs.filter((l) => normalizeAttendanceSource(l.source) === 'Import');
  const selfLogs = dedupedLogs.filter(
    (l) => normalizeAttendanceSource(l.source) === 'Self Check-in'
  );

  const manualPair = extractFirstInLastOut(manualLogs);
  const bioPair = extractFirstInLastOut(biometricLogs);

  const hasManual = manualLogs.length > 0;
  const hasBiometric = biometricLogs.length > 0;
  const hasManualBioConflict = hasManual && hasBiometric;

  let conflictDetails = '';
  if (hasManualBioConflict) {
    const fmt = (d: Date | null) =>
      d
        ? d.toLocaleTimeString('en-US', {
            timeZone: 'Asia/Dhaka',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '—';
    conflictDetails = `Manual (${fmt(manualPair.firstIn)}–${fmt(manualPair.lastOut)}) vs Biometric (${fmt(bioPair.firstIn)}–${fmt(bioPair.lastOut)})`;
  }

  // Apply configurable priority rule (default: Manual priority over Biometric)
  const manualWins = schedule.manual_priority_over_biometric !== false;
  let activeLogs = dedupedLogs;
  let resolvedSource: AttendanceSource = options?.preferredSource || 'Manual';

  if (hasManual && hasBiometric) {
    activeLogs = manualWins ? manualLogs : biometricLogs;
    resolvedSource = manualWins ? 'Manual' : 'Biometric';
  } else if (hasManual) {
    activeLogs = manualLogs;
    resolvedSource = 'Manual';
  } else if (hasBiometric) {
    activeLogs = biometricLogs;
    resolvedSource = 'Biometric';
  } else if (importLogs.length > 0) {
    activeLogs = importLogs;
    resolvedSource = 'Import';
  } else if (selfLogs.length > 0) {
    activeLogs = selfLogs;
    resolvedSource = 'Self Check-in';
  }

  const { firstIn, lastOut } = extractFirstInLastOut(activeLogs);

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
    overtimeHours = workedHours;
  }

  const hasPunch = activeLogs.length > 0;
  const hasLeaveConflict = Boolean(hasPunch && approvedLeave);

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
    if (!missingCheckout && workedHours > 0 && workedHours < (schedule.half_day_hours || 4)) {
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
    source: resolvedSource,
    first_in: firstIn,
    last_out: lastOut,
    biometric_first_in: bioPair.firstIn,
    biometric_last_out: bioPair.lastOut,
    manual_first_in: manualPair.firstIn,
    manual_last_out: manualPair.lastOut,
    worked_hours: workedHours,
    late_minutes: lateMinutes,
    overtime_hours: overtimeHours,
    overtime_approved: schedule.overtime_needs_approval ? existing?.overtime_approved || false : true,
    status,
    leave_id: approvedLeave ? approvedLeave._id : null,
    leave_is_paid: leaveIsPaid,
    has_conflict: hasLeaveConflict || hasManualBioConflict,
    has_manual_biometric_conflict: hasManualBioConflict,
    conflict_details: conflictDetails,
    missing_checkout: missingCheckout,
    is_manual_override: Boolean(options?.explicitStatusOverride) || (hasManual && manualWins),
    notes: options?.notes !== undefined ? options.notes : existing?.notes || '',
    ...(options?.legacyAttendanceId ? { legacy_attendance_id: options.legacyAttendanceId } : {}),
  };

  const saved = await DailyAttendance.findOneAndUpdate(
    { employee_id: employeeId, date: dateObj },
    { $set: updatePayload },
    { upsert: true, returnDocument: 'after' }
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

    const res = await recomputeDailyAttendance(emp._id.toString(), dateString, {
      preferredSource: 'Manual',
      notes: 'Auto-marked on schedule check',
    });
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
