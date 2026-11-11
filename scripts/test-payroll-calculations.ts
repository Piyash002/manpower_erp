import {
  calculatePayslipPure,
  computePercentChange,
  detectRunWarnings,
  evaluatePayrollFormula,
  fromPaisa,
  getDaysInPeriod,
  PayrollFormulaContext,
  PureRuleInput,
  toPaisa,
} from '../src/lib/payroll-engine';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`PASS: ${name}`);
    passCount++;
  } else {
    console.error(`FAIL: ${name}${detail ? ` -- ${detail}` : ''}`);
    failCount++;
  }
}

const SAMPLE_RULES: PureRuleInput[] = [
  { name: 'Basic Salary', code: 'BASIC', category: 'BASIC', type: 'percentage_of_basic', amount_or_percentage: 100, sequence: 10, active: true },
  { name: 'House Rent', code: 'HRA', category: 'ALLOWANCE', type: 'percentage_of_basic', amount_or_percentage: 50, sequence: 20, active: true },
  { name: 'Medical', code: 'MED', category: 'ALLOWANCE', type: 'percentage_of_basic', amount_or_percentage: 10, sequence: 30, active: true },
  { name: 'Conveyance', code: 'CONV', category: 'ALLOWANCE', type: 'fixed', amount_or_percentage: 2000, sequence: 40, active: true },
];

function runUnitTests() {
  console.log('====================================================');
  console.log('DREAMS ERP - PAYROLL CALCULATION SERVICE UNIT TESTS');
  console.log('====================================================\n');

  // 1. Paisa conversion & zero-float checks
  assert(
    toPaisa(0.1) + toPaisa(0.2) === 30 && fromPaisa(toPaisa(12345.67)) === 12346,
    'Integer paisa arithmetic avoids float precision issues and rounds once at end'
  );

  // 2. Days basis: calendar vs 30
  assert(
    getDaysInPeriod(2, 2026, 'calendar') === 28 &&
      getDaysInPeriod(2, 2026, '30') === 30 &&
      getDaysInPeriod(11, 2026, 'calendar') === 30 &&
      getDaysInPeriod(1, 2026, 'calendar') === 31,
    'getDaysInPeriod respects calendar (28/30/31) vs fixed 30 days'
  );

  // 3. Per-day rate = monthly gross / days in month, unpaid absence deduction, paid leave NOT deducted
  // Basic 20000 + HRA 10000 + MED 2000 + CONV 2000 => Monthly Gross = 34000; 30-day basis => 1133.33/day
  const baseRes = calculatePayslipPure({
    month: 11,
    year: 2026,
    daysBasis: '30',
    overtimeMultiplier: 2,
    contractBasic: 20000,
    rules: SAMPLE_RULES,
    contractStart: new Date('2026-01-01T00:00:00Z'),
    attendance: {
      presentDays: 24,
      absentDays: 2,
      lateDays: 3, // 3 late = 1 penalty day
      latePenaltyDays: 1,
      halfDays: 0,
      paidLeaveDays: 2, // Must NOT be deducted
      unpaidLeaveDays: 1,
      attendanceOvertimeHours: 0,
    },
    monthlyInput: {},
  });
  const absLine = baseRes.lines.find((l) => l.code === 'ABSDED');
  const ulLine = baseRes.lines.find((l) => l.code === 'UNPAIDLEAVE');
  // 34000 / 30 = 1133.33 => 3 * 1133.33 = 3400 (attendance), 1 * 1133.33 = 1133 (leave)
  assert(
    baseRes.gross_pay === 34000 &&
      baseRes.per_day_rate === 1133 &&
      absLine?.amount === 3400 &&
      absLine?.source === 'attendance' &&
      ulLine?.amount === 1133 &&
      ulLine?.source === 'leave' &&
      baseRes.net_pay === 34000 - (3400 + 1133),
    'Per day rate = monthlyGross/days, unpaid absence & leave deduct accurately while paid leave stays 0 deduction',
    `gross=${baseRes.gross_pay}, perDay=${baseRes.per_day_rate}, abs=${absLine?.amount}, ul=${ulLine?.amount}, net=${baseRes.net_pay}`
  );

  // 4. Calendar days basis (Feb 28 days) changes per-day rate automatically
  const febRes = calculatePayslipPure({
    month: 2,
    year: 2026,
    daysBasis: 'calendar',
    overtimeMultiplier: 2,
    contractBasic: 20000,
    rules: SAMPLE_RULES,
    contractStart: new Date('2026-01-01T00:00:00Z'),
    attendance: {
      presentDays: 25,
      absentDays: 1,
      lateDays: 0,
      latePenaltyDays: 0,
      halfDays: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      attendanceOvertimeHours: 0,
    },
    monthlyInput: {},
  });
  // 34000 / 28 = 1214.29 -> 1214
  assert(
    febRes.days_in_month === 28 && febRes.lines.find((l) => l.code === 'ABSDED')?.amount === 1214,
    'Calendar days basis uses 28 days for Feb 2026 -> 34000/28 = 1214',
    `days=${febRes.days_in_month}, abs=${febRes.lines.find((l) => l.code === 'ABSDED')?.amount}`
  );

  // 5. Mid-month joiner proration (joined Nov 16 in 30-day Nov => 15/30 = 50% of contract earnings)
  const joinerRes = calculatePayslipPure({
    month: 11,
    year: 2026,
    daysBasis: 'calendar',
    overtimeMultiplier: 2,
    contractBasic: 20000,
    rules: SAMPLE_RULES,
    contractStart: new Date('2026-11-16T00:00:00Z'),
    joiningDate: new Date('2026-11-16T00:00:00Z'),
    attendance: {
      presentDays: 15,
      absentDays: 0,
      lateDays: 0,
      latePenaltyDays: 0,
      halfDays: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      attendanceOvertimeHours: 0,
    },
    monthlyInput: {},
  });
  assert(
    joinerRes.is_prorated &&
      joinerRes.prorated_days === 15 &&
      joinerRes.basic_pay === 10000 &&
      joinerRes.gross_pay === 17000 &&
      joinerRes.net_pay === 17000,
    'Mid-month joiner (Nov 16) prorates 15/30 days => Basic 10000, Gross 17000',
    `prorated=${joinerRes.prorated_days}, basic=${joinerRes.basic_pay}, gross=${joinerRes.gross_pay}`
  );

  // 6. Overtime, bonuses (festival/performance/other), advance, fine, negative net warning
  const otBonusRes = calculatePayslipPure({
    month: 11,
    year: 2026,
    daysBasis: '30',
    overtimeMultiplier: 2,
    contractBasic: 15000, // HRA 7500, MED 1500, CONV 2000 -> Contract Gross 26000
    rules: SAMPLE_RULES,
    contractStart: new Date('2026-01-01T00:00:00Z'),
    attendance: {
      presentDays: 26,
      absentDays: 0,
      lateDays: 0,
      latePenaltyDays: 0,
      halfDays: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      attendanceOvertimeHours: 5,
    },
    monthlyInput: {
      overtime_hours: 5, // total 10h OT
      overtime_rate: 150, // 10h * 150 * 2x = 3000 OT
      bonus_festival: 5000,
      bonus_performance: 2000,
      advance_deduction: 4000,
      fine: 1000,
      other_adjustment: -500,
    },
  });
  // Gross = 26000 + 3000 (OT) + 7000 (Bonuses) = 36000
  // Deductions = 4000 + 1000 + 500 = 5500 -> Net = 30500
  const otLine = otBonusRes.lines.find((l) => l.code === 'OT');
  assert(
    otLine?.amount === 3000 &&
      otBonusRes.gross_pay === 36000 &&
      otBonusRes.total_deductions === 5500 &&
      otBonusRes.net_pay === 30500,
    'OT (10h * 150 * 2x = 3000) + Bonuses (7000) - Advance (4000) - Fine (1000) - Adj (500) = 30500',
    `ot=${otLine?.amount}, gross=${otBonusRes.gross_pay}, ded=${otBonusRes.total_deductions}, net=${otBonusRes.net_pay}`
  );

  // 7. Warnings detector (>30% swing, <=0 net, missing payment info, high overtime >40h)
  const warnings = detectRunWarnings(
    [
      {
        employee: { _id: 'e1', employee_id: 'EMP-0001', firstName: 'A', lastName: 'B', payment_method: 'bKash', bank_account_no: '' },
        contract: {},
        net_pay: 0,
        inputs_snapshot: { overtime_hours: 45 },
      },
    ],
    new Map([['e1', 25000]])
  );
  const codes = new Set(warnings.map((w) => w.code));
  assert(
    codes.has('NET_ZERO_OR_NEGATIVE') &&
      codes.has('NET_SWING_30_PCT') &&
      codes.has('MISSING_PAYMENT_DETAILS') &&
      codes.has('HIGH_OVERTIME'),
    'detectRunWarnings catches zero/negative net, >30% swing, missing wallet, and >40h overtime',
    `Got codes=${Array.from(codes).join(',')}`
  );

  // 8. Inactive salary rule is ignored cleanly
  const inactiveRes = calculatePayslipPure({
    month: 11,
    year: 2026,
    daysBasis: '30',
    overtimeMultiplier: 2,
    contractBasic: 20000,
    rules: [
      { name: 'Basic Salary', code: 'BASIC', category: 'BASIC', type: 'percentage_of_basic', amount_or_percentage: 100, sequence: 10, active: true },
      { name: 'Inactive Allowance', code: 'INACT', category: 'ALLOWANCE', type: 'fixed', amount_or_percentage: 5000, sequence: 20, active: false },
    ],
    contractStart: new Date('2026-01-01T00:00:00Z'),
    attendance: { presentDays: 26, absentDays: 0, lateDays: 0, latePenaltyDays: 0, halfDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, attendanceOvertimeHours: 0 },
    monthlyInput: {},
  });
  assert(
    inactiveRes.gross_pay === 20000 && !inactiveRes.lines.some((l) => l.code === 'INACT'),
    'Inactive salary structure rules are excluded from payslip calculations'
  );

  // 9. Formula evaluator + Percent change helper
  const formulaCtx: PayrollFormulaContext = {
    BASIC: 20000,
    ALLOWANCES: 5000,
    GROSS: 25000,
    DEDUCTIONS: 0,
    NET: 0,
    PRESENT_DAYS: 25,
    ABSENT_DAYS: 0,
    LATE_DAYS: 0,
    LATE_PENALTY_DAYS: 0,
    HALF_DAYS: 0,
    PAID_LEAVE_DAYS: 0,
    UNPAID_LEAVE_DAYS: 0,
    BONUS: 0,
    OVERTIME_HOURS: 2,
    OVERTIME_RATE: 100,
    LOAN_INSTALLMENT: 0,
    MANUAL_DEDUCTION: 0,
  };
  assert(
    evaluatePayrollFormula('BASIC * 0.1 + 500', formulaCtx) === 2500 &&
      computePercentChange(22000, 20000) === 10 &&
      computePercentChange(15000, 20000) === -25,
    'evaluatePayrollFormula and computePercentChange return exact values'
  );

  console.log('\n====================================================');
  console.log(`UNIT TEST SUMMARY: ${passCount} passed, ${failCount} failed`);
  console.log('====================================================');
  process.exit(failCount > 0 ? 1 : 0);
}

runUnitTests();

