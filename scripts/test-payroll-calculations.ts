import {
  calculatePayslipPure,
  computePercentChange,
  detectRunWarnings,
  evaluatePayrollFormula,
  evaluateSandwichAbsentDays,
  fromPaisa,
  getDaysInPeriod,
  PayrollFormulaContext,
  PureRuleInput,
  toPaisa,
} from '../src/lib/payroll-engine';
import {
  DEFAULT_PAYROLL_SETTINGS_VALUES,
  PayrollSettingsSnapshot,
} from '../src/models/PayrollSettings';

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

// Basic 20,000 + HRA 8,000 + MED 2,000 = Gross 30,000
const TEST_RULES_30K: PureRuleInput[] = [
  { name: 'Basic Salary', code: 'BASIC', category: 'BASIC', type: 'percentage_of_basic', amount_or_percentage: 100, sequence: 10, active: true },
  { name: 'House Rent', code: 'HRA', category: 'ALLOWANCE', type: 'percentage_of_basic', amount_or_percentage: 40, sequence: 20, active: true },
  { name: 'Medical', code: 'MED', category: 'ALLOWANCE', type: 'fixed', amount_or_percentage: 2000, sequence: 30, active: true },
];

function makeSettings(overrides: Partial<PayrollSettingsSnapshot> = {}): PayrollSettingsSnapshot {
  return { ...DEFAULT_PAYROLL_SETTINGS_VALUES, ...overrides };
}

function runUnitTests() {
  console.log('====================================================');
  console.log('DREAMS ERP - PAYROLL SETTINGS & CALCULATION TESTS');
  console.log('====================================================\n');

  // 1. Paisa precision
  assert(
    toPaisa(0.1) + toPaisa(0.2) === 30 && fromPaisa(toPaisa(12345.67), 'nearest_taka') === 12346,
    'Integer paisa arithmetic avoids float drift and rounds cleanly to nearest taka'
  );

  // 2. Days basis (Fixed 30, Calendar 28/30/31, Working 26)
  assert(
    getDaysInPeriod(1, 2026, 'fixed_30') === 30 &&
      getDaysInPeriod(1, 2026, 'calendar') === 31 &&
      getDaysInPeriod(2, 2026, 'calendar') === 28 &&
      getDaysInPeriod(1, 2026, 'working_days', 26) === 26,
    'getDaysInPeriod supports Fixed 30, Calendar (31/28), and Working days (26)'
  );

  const zeroAtt = {
    presentDays: 25,
    absentDays: 0,
    lateDays: 0,
    halfDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    attendanceOvertimeHours: 0,
  };

  // 3. Required Case A: Basic 20,000, Gross 30,000, Fixed 30 -> 1 absent day
  const absGross = calculatePayslipPure({
    month: 11,
    year: 2026,
    settings: makeSettings({ absence_deduction_basis: 'gross', days_basis: 'fixed_30' }),
    contractBasic: 20000,
    rules: TEST_RULES_30K,
    contractStart: new Date('2026-01-01T00:00:00Z'),
    attendance: { ...zeroAtt, absentDays: 1 },
    monthlyInput: {},
  });
  const absBasic = calculatePayslipPure({
    month: 11,
    year: 2026,
    settings: makeSettings({ absence_deduction_basis: 'basic', days_basis: 'fixed_30' }),
    contractBasic: 20000,
    rules: TEST_RULES_30K,
    contractStart: new Date('2026-01-01T00:00:00Z'),
    attendance: { ...zeroAtt, absentDays: 1 },
    monthlyInput: {},
  });
  assert(
    absGross.lines.find((l) => l.code === 'ABSDED')?.amount === 1000 &&
      absBasic.lines.find((l) => l.code === 'ABSDED')?.amount === 667 &&
      Boolean(absGross.lines.find((l) => l.code === 'ABSDED')?.calculation_note?.includes('30,000 / 30')),
    '1 absent day (Basic 20,000 / Gross 30,000 / Fixed 30): Gross=1,000, Basic=667 with formula note',
    `grossDed=${absGross.lines.find((l) => l.code === 'ABSDED')?.amount}, basicDed=${absBasic.lines.find((l) => l.code === 'ABSDED')?.amount}`
  );

  // 4. Required Case B: 1 half day -> Gross=500, Basic=333
  const halfGross = calculatePayslipPure({
    month: 11,
    year: 2026,
    settings: makeSettings({ absence_deduction_basis: 'gross', days_basis: 'fixed_30' }),
    contractBasic: 20000,
    rules: TEST_RULES_30K,
    contractStart: new Date('2026-01-01T00:00:00Z'),
    attendance: { ...zeroAtt, halfDays: 1 },
    monthlyInput: {},
  });
  const halfBasic = calculatePayslipPure({
    month: 11,
    year: 2026,
    settings: makeSettings({ absence_deduction_basis: 'basic', days_basis: 'fixed_30' }),
    contractBasic: 20000,
    rules: TEST_RULES_30K,
    contractStart: new Date('2026-01-01T00:00:00Z'),
    attendance: { ...zeroAtt, halfDays: 1 },
    monthlyInput: {},
  });
  assert(
    halfGross.lines.find((l) => l.code === 'HALFDED')?.amount === 500 &&
      halfBasic.lines.find((l) => l.code === 'HALFDED')?.amount === 333,
    '1 half day (Basic 20,000 / Gross 30,000 / Fixed 30): Gross=500, Basic=333',
    `grossHalf=${halfGross.lines.find((l) => l.code === 'HALFDED')?.amount}, basicHalf=${halfBasic.lines.find((l) => l.code === 'HALFDED')?.amount}`
  );

  // 5. Required Case C: 3 late days with rule 3 = 1 day -> Gross=1,000, Basic=667
  const lateGross = calculatePayslipPure({
    month: 11,
    year: 2026,
    settings: makeSettings({ absence_deduction_basis: 'gross', days_basis: 'fixed_30', late_count_per_absent: 3 }),
    contractBasic: 20000,
    rules: TEST_RULES_30K,
    contractStart: new Date('2026-01-01T00:00:00Z'),
    attendance: { ...zeroAtt, lateDays: 3 },
    monthlyInput: {},
  });
  const lateBasic = calculatePayslipPure({
    month: 11,
    year: 2026,
    settings: makeSettings({ absence_deduction_basis: 'basic', days_basis: 'fixed_30', late_count_per_absent: 3 }),
    contractBasic: 20000,
    rules: TEST_RULES_30K,
    contractStart: new Date('2026-01-01T00:00:00Z'),
    attendance: { ...zeroAtt, lateDays: 3 },
    monthlyInput: {},
  });
  assert(
    lateGross.lines.find((l) => l.code === 'LATEDED')?.amount === 1000 &&
      lateBasic.lines.find((l) => l.code === 'LATEDED')?.amount === 667,
    '3 late days (3=1 day): Gross=1,000, Basic=667',
    `grossLate=${lateGross.lines.find((l) => l.code === 'LATEDED')?.amount}, basicLate=${lateBasic.lines.find((l) => l.code === 'LATEDED')?.amount}`
  );

  // 6. Required Case D: Paid leave day -> 0 deduction
  const paidLeaveRes = calculatePayslipPure({
    month: 11,
    year: 2026,
    settings: makeSettings({ absence_deduction_basis: 'gross', days_basis: 'fixed_30' }),
    contractBasic: 20000,
    rules: TEST_RULES_30K,
    contractStart: new Date('2026-01-01T00:00:00Z'),
    attendance: { ...zeroAtt, paidLeaveDays: 2, unpaidLeaveDays: 0 },
    monthlyInput: {},
  });
  assert(
    paidLeaveRes.total_deductions === 0 && paidLeaveRes.net_pay === 30000,
    'Paid leave day results in 0 deduction and full 30,000 net pay'
  );

  // 7. Required Case E: Joiner on day 11 of a 30-day month with Fixed 30 -> prorated to 20 days (Gross 20,000, Basic 13,333)
  const day11Joiner = calculatePayslipPure({
    month: 11,
    year: 2026,
    settings: makeSettings({ days_basis: 'fixed_30', prorate_mid_month: true }),
    contractBasic: 20000,
    rules: TEST_RULES_30K,
    contractStart: new Date('2026-11-11T00:00:00Z'),
    joiningDate: new Date('2026-11-11T00:00:00Z'),
    attendance: zeroAtt,
    monthlyInput: {},
  });
  assert(
    day11Joiner.prorated_days === 20 &&
      day11Joiner.basic_pay === 13333 &&
      day11Joiner.gross_pay === 20000,
    'Joiner on day 11 of 30-day month with Fixed 30 prorates to 20 days (Basic 13,333, Gross 20,000)',
    `proratedDays=${day11Joiner.prorated_days}, basic=${day11Joiner.basic_pay}, gross=${day11Joiner.gross_pay}`
  );

  // 8. Calendar days basis on 31-day month (Jan 2026 -> 30,000 / 31 = 968)
  const jan31Res = calculatePayslipPure({
    month: 1,
    year: 2026,
    settings: makeSettings({ absence_deduction_basis: 'gross', days_basis: 'calendar' }),
    contractBasic: 20000,
    rules: TEST_RULES_30K,
    contractStart: new Date('2026-01-01T00:00:00Z'),
    attendance: { ...zeroAtt, absentDays: 1 },
    monthlyInput: {},
  });
  assert(
    jan31Res.days_in_month === 31 &&
      jan31Res.lines.find((l) => l.code === 'ABSDED')?.amount === 968,
    'Calendar days basis on 31-day month (Jan): 30,000 / 31 = 968',
    `days=${jan31Res.days_in_month}, abs=${jan31Res.lines.find((l) => l.code === 'ABSDED')?.amount}`
  );

  // 9. Sandwich rule ON vs OFF (Jan 2026: Jan 1 Thu=Absent, Jan 2 Fri=Off, Jan 3 Sat=Off, Jan 4 Sun=Absent => +2 sandwich days!)
  const janStatus = new Map<number, string>([
    [1, 'Absent'],
    [4, 'Absent'],
  ]);
  const sandwichDaysCount = evaluateSandwichAbsentDays({
    month: 1,
    year: 2026,
    workingDays: [0, 1, 2, 3, 4], // Sun-Thu working, Fri-Sat off
    holidayDayNumbers: new Set(),
    statusByDay: janStatus,
  });
  const sandwichOff = calculatePayslipPure({
    month: 1,
    year: 2026,
    settings: makeSettings({ sandwich_rule_enabled: false, days_basis: 'fixed_30' }),
    contractBasic: 20000,
    rules: TEST_RULES_30K,
    contractStart: new Date('2026-01-01T00:00:00Z'),
    attendance: { ...zeroAtt, absentDays: 2, sandwichAbsentDays: sandwichDaysCount },
    monthlyInput: {},
  });
  const sandwichOn = calculatePayslipPure({
    month: 1,
    year: 2026,
    settings: makeSettings({ sandwich_rule_enabled: true, days_basis: 'fixed_30' }),
    contractBasic: 20000,
    rules: TEST_RULES_30K,
    contractStart: new Date('2026-01-01T00:00:00Z'),
    attendance: { ...zeroAtt, absentDays: 2, sandwichAbsentDays: sandwichDaysCount },
    monthlyInput: {},
  });
  assert(
    sandwichDaysCount === 2 &&
      sandwichOff.lines.find((l) => l.code === 'ABSDED')?.amount === 2000 &&
      sandwichOn.lines.find((l) => l.code === 'ABSDED')?.amount === 4000,
    'Sandwich rule OFF ignores Fri/Sat off days (2,000); ON counts Fri/Sat between absences (4,000)',
    `sandwichDays=${sandwichDaysCount}, off=${sandwichOff.lines.find((l) => l.code === 'ABSDED')?.amount}, on=${sandwichOn.lines.find((l) => l.code === 'ABSDED')?.amount}`
  );

  // 10. Grace period check: late inside grace (<= 10m) must NOT count
  const graceRes = calculatePayslipPure({
    month: 11,
    year: 2026,
    settings: makeSettings({ grace_minutes: 10, late_count_per_absent: 3 }),
    contractBasic: 20000,
    rules: TEST_RULES_30K,
    contractStart: new Date('2026-01-01T00:00:00Z'),
    attendance: {
      ...zeroAtt,
      lateDays: 5,
      lateMinutesList: [5, 10, 10, 15, 22], // Only 2 are >10m => 0 absent penalty days!
    },
    monthlyInput: {},
  });
  assert(
    graceRes.attendance_summary.lateDays === 2 &&
      graceRes.attendance_summary.latePenaltyDays === 0 &&
      !graceRes.lines.some((l) => l.code === 'LATEDED'),
    'Grace period excludes late days <= 10m (only 2 qualify out of 5 -> 0 deduction)',
    `qualifying=${graceRes.attendance_summary.lateDays}, penalty=${graceRes.attendance_summary.latePenaltyDays}`
  );

  // 11. Selected components basis + Overtime + >30% Deductions Warning
  const selectedRes = calculatePayslipPure({
    month: 11,
    year: 2026,
    settings: makeSettings({
      absence_deduction_basis: 'selected_components',
      selected_component_codes: ['BASIC', 'HRA'], // 28,000 / 30 = 933
      days_basis: 'fixed_30',
      overtime_basis: 'basic',
      overtime_multiplier: 2,
      overtime_hours_per_day: 8,
    }),
    contractBasic: 20000,
    rules: TEST_RULES_30K,
    contractStart: new Date('2026-01-01T00:00:00Z'),
    attendance: { ...zeroAtt, absentDays: 1 },
    monthlyInput: {
      overtime_hours: 6, // Basic 20000/30/8 = 83.3333 * 2 * 6 = 1000 OT
      advance_deduction: 10000, // pushes deductions > 30% of gross
    },
  });
  const warnings = detectRunWarnings(
    [
      {
        employee: { _id: 'e1', employee_id: 'EMP-1', firstName: 'A', lastName: 'B', payment_method: 'Bank', bank_account_no: '123' },
        contract: {},
        gross_pay: selectedRes.gross_pay,
        total_deductions: selectedRes.total_deductions,
        net_pay: selectedRes.net_pay,
        inputs_snapshot: selectedRes.inputs_snapshot,
      },
    ],
    new Map()
  );
  assert(
    selectedRes.lines.find((l) => l.code === 'ABSDED')?.amount === 933 &&
      selectedRes.lines.find((l) => l.code === 'OT')?.amount === 1000 &&
      warnings.some((w) => w.code === 'DEDUCTIONS_OVER_30_PCT'),
    'Selected components basis (28,000/30=933), OT from Basic (20,000/30/8*2*6=1,000), and >30% deduction warning trigger accurately',
    `abs=${selectedRes.lines.find((l) => l.code === 'ABSDED')?.amount}, ot=${selectedRes.lines.find((l) => l.code === 'OT')?.amount}`
  );

  // 12. Formula & Delta helper
  const formulaCtx: PayrollFormulaContext = {
    BASIC: 20000, ALLOWANCES: 10000, GROSS: 30000, DEDUCTIONS: 0, NET: 0,
    PRESENT_DAYS: 25, ABSENT_DAYS: 0, LATE_DAYS: 0, LATE_PENALTY_DAYS: 0, HALF_DAYS: 0,
    PAID_LEAVE_DAYS: 0, UNPAID_LEAVE_DAYS: 0, BONUS: 0, OVERTIME_HOURS: 0, OVERTIME_RATE: 0,
    LOAN_INSTALLMENT: 0, MANUAL_DEDUCTION: 0,
  };
  assert(
    evaluatePayrollFormula('BASIC * 0.1', formulaCtx) === 2000 &&
      computePercentChange(33000, 30000) === 10,
    'evaluatePayrollFormula and computePercentChange pass'
  );

  console.log('\n====================================================');
  console.log(`UNIT TEST SUMMARY: ${passCount} passed, ${failCount} failed`);
  console.log('====================================================');
  process.exit(failCount > 0 ? 1 : 0);
}

runUnitTests();
