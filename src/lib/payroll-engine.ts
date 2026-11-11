import { Employee } from '@/models/Employee';
import { EmployeeContract } from '@/models/EmployeeContract';
import { SalaryStructure } from '@/models/SalaryStructure';
import { SalaryRule, ISalaryRule } from '@/models/SalaryRule';
import { Attendance } from '@/models/Attendance';
import { DailyAttendance } from '@/models/DailyAttendance';
import { Holiday } from '@/models/Holiday';
import { resolveEmployeeSchedule } from '@/lib/attendance-engine';
import { Leave, LeaveType } from '@/models/Leave';
import { PayrollInput } from '@/models/PayrollInput';
import { Payslip } from '@/models/Payslip';
import { IPayrollRunWarning } from '@/models/PayslipBatch';
import {
  DEFAULT_PAYROLL_SETTINGS_VALUES,
  PayrollSettings,
  PayrollSettingsSnapshot,
} from '@/models/PayrollSettings';
import { getNextSequence } from '@/models/Counter';
import { formatBDT } from '@/lib/formatters';
import {
  calculatePayslipPure,
  countOverlapDays,
  evaluateSandwichAbsentDays,
} from '@/lib/payroll-calc';

export * from '@/lib/payroll-calc';

export async function generateNextPayslipNo(month: number, year: number): Promise<string> {
  const ym = `${year}${String(month).padStart(2, '0')}`;
  const seq = await getNextSequence(`payslip_${ym}`);
  return `PAY-${ym}-${String(seq).padStart(4, '0')}`;
}

/**
 * Resolve effective PayrollSettings version for (month, year), creating v1 defaults if empty.
 */
export async function resolveEffectivePayrollSettings(
  month: number,
  year: number
): Promise<{ settings: PayrollSettingsSnapshot; settingsDocId: string | null }> {
  let doc = await PayrollSettings.findOne({
    $or: [
      { effective_from_year: { $lt: year } },
      { effective_from_year: year, effective_from_month: { $lte: month } },
    ],
  })
    .sort({ effective_from_year: -1, effective_from_month: -1, version: -1 })
    .lean();

  if (!doc) {
    doc = await PayrollSettings.findOne({}).sort({ version: 1 }).lean();
  }

  if (!doc) {
    const created = await PayrollSettings.create({
      ...DEFAULT_PAYROLL_SETTINGS_VALUES,
      notes: 'Default payroll settings created automatically on first use.',
      updated_by: 'System',
    });
    doc = created.toObject() as any;
  }

  return {
    settingsDocId: doc?._id?.toString() || null,
    settings: {
      ...DEFAULT_PAYROLL_SETTINGS_VALUES,
      ...(doc as any),
    },
  };
}

export async function computeEmployeePayslipData({
  employeeId,
  month,
  year,
  settingsOverride,
}: {
  employeeId: string;
  month: number;
  year: number;
  settingsOverride?: PayrollSettingsSnapshot;
}) {
  const employee = await Employee.findById(employeeId).lean();
  if (!employee) {
    throw new Error('Employee not found');
  }

  const resolvedSettings =
    settingsOverride || (await resolveEffectivePayrollSettings(month, year)).settings;

  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const contract = await EmployeeContract.findOne({
    employee_id: employeeId,
    status: 'Active',
    start_date: { $lte: monthEnd },
    $or: [{ end_date: null }, { end_date: { $gte: monthStart } }],
  })
    .sort({ start_date: -1 })
    .lean();

  if (!contract) {
    throw new Error(
      `Employee ${employee.employee_id} (${employee.firstName} ${employee.lastName}) has no Active contract covering ${month}/${year}.`
    );
  }

  const structure = await SalaryStructure.findById(contract.structure_id).lean();
  if (!structure) {
    throw new Error('Assigned Salary Structure no longer exists.');
  }

  const rules = (await SalaryRule.find({
    structure_id: structure._id,
    active: true,
  })
    .sort({ sequence: 1 })
    .lean()) as unknown as ISalaryRule[];

  const schedule = await resolveEmployeeSchedule(employee);
  const halfDayThreshold = resolvedSettings.half_day_hours_threshold || 4;
  const graceMinutes = resolvedSettings.grace_minutes ?? 10;

  const [dailyDocs, holidayDocs] = await Promise.all([
    DailyAttendance.find({
      employee_id: employeeId,
      date: { $gte: monthStart, $lte: monthEnd },
    }).lean(),
    Holiday.find({
      date: { $gte: monthStart, $lte: monthEnd },
      active: true,
    }).lean(),
  ]);

  let presentDays = 0;
  let absentDays = 0;
  let lateDays = 0;
  let halfDays = 0;
  let attendanceOvertimeHours = 0;
  let dailyPaidLeaveDays = 0;
  let dailyUnpaidLeaveDays = 0;
  const statusByDay = new Map<number, string>();
  const paidLeaveTypeSet = new Set<string>(
    resolvedSettings.paid_leave_types || ['Casual', 'Sick', 'Earned', 'Emergency']
  );

  if (dailyDocs.length > 0) {
    for (const d of dailyDocs) {
      const dayNum = new Date(d.date).getUTCDate();
      statusByDay.set(dayNum, d.status);

      if (d.status === 'Absent') {
        absentDays++;
      } else if (
        d.status === 'Half-day' ||
        (d.worked_hours > 0 &&
          d.worked_hours < halfDayThreshold &&
          d.status !== 'Leave' &&
          d.status !== 'Holiday' &&
          d.status !== 'Weekend')
      ) {
        halfDays++;
      } else if (d.status === 'Present') {
        presentDays++;
      } else if (d.status === 'Late') {
        if (typeof d.late_minutes === 'number' && d.late_minutes > 0 && d.late_minutes <= graceMinutes) {
          presentDays++;
        } else {
          lateDays++;
        }
      } else if (d.status === 'Leave') {
        if (d.leave_is_paid === false) dailyUnpaidLeaveDays++;
        else dailyPaidLeaveDays++;
      }

      if (d.overtime_approved !== false && (d.overtime_hours || 0) > 0) {
        attendanceOvertimeHours =
          Math.round((attendanceOvertimeHours + (d.overtime_hours || 0)) * 100) / 100;
      }
    }
  } else {
    const attendanceDocs = await Attendance.find({
      employee_id: employeeId,
      date: { $gte: monthStart, $lte: monthEnd },
    }).lean();

    for (const a of attendanceDocs) {
      const dayNum = new Date(a.date).getUTCDate();
      statusByDay.set(dayNum, a.status);
      if (a.status === 'Present') presentDays++;
      else if (a.status === 'Late') lateDays++;
      else if (a.status === 'Half-Day') halfDays++;
      else if (a.status === 'Absent') absentDays++;
    }
  }

  let sandwichAbsentDays = 0;
  if (resolvedSettings.sandwich_rule_enabled) {
    const holidayDayNumbers = new Set<number>(
      holidayDocs.map((h) => new Date(h.date).getUTCDate())
    );
    sandwichAbsentDays = evaluateSandwichAbsentDays({
      month,
      year,
      workingDays: schedule.working_days || [0, 1, 2, 3, 4],
      holidayDayNumbers,
      statusByDay,
    });
  }

  const leaveDocs = await Leave.find({
    employee_id: employeeId,
    status: 'Approved',
    start_date: { $lte: monthEnd },
    end_date: { $gte: monthStart },
  }).lean();

  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  for (const lv of leaveDocs) {
    const days = countOverlapDays(new Date(lv.start_date), new Date(lv.end_date), monthStart, monthEnd);
    const isPaidType = lv.leave_type !== 'Unpaid' && paidLeaveTypeSet.has(lv.leave_type as LeaveType);
    if (!isPaidType) unpaidLeaveDays += days;
    else paidLeaveDays += days;
  }
  paidLeaveDays = Math.max(paidLeaveDays, dailyPaidLeaveDays);
  unpaidLeaveDays = Math.max(unpaidLeaveDays, dailyUnpaidLeaveDays);

  const inputDoc = await PayrollInput.findOne({
    employee_id: employeeId,
    month,
    year,
  }).lean();

  const pure = calculatePayslipPure({
    month,
    year,
    settings: resolvedSettings,
    contractBasic: contract.basic_salary || 0,
    rules,
    contractStart: new Date(contract.start_date),
    contractEnd: contract.end_date ? new Date(contract.end_date) : null,
    joiningDate: employee.joining_date ? new Date(employee.joining_date) : null,
    resignationDate: employee.resignation_date ? new Date(employee.resignation_date) : null,
    attendance: {
      presentDays,
      absentDays,
      sandwichAbsentDays,
      lateDays,
      halfDays,
      paidLeaveDays,
      unpaidLeaveDays,
      attendanceOvertimeHours,
    },
    monthlyInput: {
      bonus: inputDoc?.bonus,
      bonus_type: inputDoc?.bonus_type,
      bonus_festival: inputDoc?.bonus_festival,
      bonus_performance: inputDoc?.bonus_performance,
      bonus_other: inputDoc?.bonus_other,
      overtime_hours: inputDoc?.overtime_hours,
      overtime_rate: inputDoc?.overtime_rate,
      loan_installment: inputDoc?.loan_installment,
      advance_deduction: inputDoc?.advance_deduction,
      fine: inputDoc?.fine,
      other_adjustment: inputDoc?.other_adjustment,
      manual_deduction: inputDoc?.manual_deduction,
    },
  });

  return {
    employee,
    contract,
    structure,
    settingsUsed: resolvedSettings,
    hasAttendanceRecords: dailyDocs.length > 0,
    ...pure,
  };
}

/**
 * Evaluate anomaly warnings for a Payroll Run's payslips.
 */
export function detectRunWarnings(
  payslips: Array<{
    employee: any;
    contract: any;
    gross_pay?: number;
    total_deductions?: number;
    net_pay: number;
    inputs_snapshot: { overtime_hours: number };
  }>,
  prevPayslipByEmployeeId: Map<string, number>
): IPayrollRunWarning[] {
  const warnings: IPayrollRunWarning[] = [];

  for (const item of payslips) {
    const emp = item.employee;
    const empIdStr = emp._id.toString();
    const empName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();

    if (item.net_pay <= 0) {
      warnings.push({
        employee_id: emp._id,
        employee_code: emp.employee_id || '',
        name: empName,
        code: 'NET_ZERO_OR_NEGATIVE',
        severity: 'critical',
        message: `Net payable is ${formatBDT(item.net_pay)} (zero or negative). Review deductions or attendance before confirming.`,
        current_net: item.net_pay,
      });
    }

    const gross = item.gross_pay || 0;
    const ded = item.total_deductions || 0;
    if (gross > 0 && ded / gross > 0.3) {
      warnings.push({
        employee_id: emp._id,
        employee_code: emp.employee_id || '',
        name: empName,
        code: 'DEDUCTIONS_OVER_30_PCT',
        severity: 'warning',
        message: `Total deductions (${formatBDT(ded)}) exceed 30% of gross pay (${Math.round((ded / gross) * 100)}%).`,
        current_net: item.net_pay,
      });
    }

    const prevNet = prevPayslipByEmployeeId.get(empIdStr);
    if (prevNet && prevNet > 0) {
      const pctSwing = Math.abs((item.net_pay - prevNet) / prevNet);
      if (pctSwing > 0.3) {
        const direction = item.net_pay >= prevNet ? 'increased' : 'dropped';
        warnings.push({
          employee_id: emp._id,
          employee_code: emp.employee_id || '',
          name: empName,
          code: 'NET_SWING_30_PCT',
          severity: 'warning',
          message: `Net salary ${direction} by ${Math.round(pctSwing * 100)}% compared to last month (${formatBDT(prevNet)} → ${formatBDT(item.net_pay)}).`,
          prev_net: prevNet,
          current_net: item.net_pay,
        });
      }
    }

    const paymentMethod = emp.payment_method || 'Bank';
    const accountOrWallet = emp.bank_account_no || item.contract?.bank_account_no || '';
    if (paymentMethod !== 'Cash' && !String(accountOrWallet).trim()) {
      warnings.push({
        employee_id: emp._id,
        employee_code: emp.employee_id || '',
        name: empName,
        code: 'MISSING_PAYMENT_DETAILS',
        severity: 'warning',
        message: `Missing ${paymentMethod} account / wallet number for disbursement.`,
      });
    }

    if ((item.inputs_snapshot?.overtime_hours || 0) > 40) {
      warnings.push({
        employee_id: emp._id,
        employee_code: emp.employee_id || '',
        name: empName,
        code: 'HIGH_OVERTIME',
        severity: 'warning',
        message: `Unusually high overtime logged (${item.inputs_snapshot.overtime_hours} hours this month).`,
      });
    }
  }

  return warnings;
}

export async function onPayrollRunConfirmed(context: {
  runId: string;
  month: number;
  year: number;
  branch: string;
  totalNetPay: number;
  user?: { userId?: string; name?: string; username?: string; role?: string };
}): Promise<void> {
  const { postPayrollConfirmAccrual } = await import('@/lib/accounts/payroll');
  await postPayrollConfirmAccrual({
    runId: context.runId,
    user: context.user || { userId: 'system', name: 'Payroll System', role: 'Admin' },
  });
}

export async function assertNoDuplicatePayslip(employeeId: string, month: number, year: number) {
  const existing = await Payslip.findOne({
    employee_id: employeeId,
    month,
    year,
    is_reversal: { $ne: true },
    status: { $nin: ['Cancelled', 'Reversed'] },
  }).lean();
  if (existing) {
    throw new Error(
      `Payslip ${existing.payslip_no} already exists for this employee in ${month}/${year} (Status: ${existing.status}).`
    );
  }
}
