import { Employee } from '@/models/Employee';
import { EmployeeContract } from '@/models/EmployeeContract';
import { SalaryStructure } from '@/models/SalaryStructure';
import { SalaryRule, ISalaryRule, SalaryRuleCategory, SalaryRuleType } from '@/models/SalaryRule';
import { Attendance } from '@/models/Attendance';
import { DailyAttendance } from '@/models/DailyAttendance';
import { resolveEmployeeSchedule } from '@/lib/attendance-engine';
import { Leave } from '@/models/Leave';
import { PayrollInput, BonusType } from '@/models/PayrollInput';
import { Payslip, IPayslipLine, PayslipLineSource } from '@/models/Payslip';
import { DaysBasis, IPayrollRunWarning } from '@/models/PayslipBatch';
import { getNextSequence } from '@/models/Counter';
import { amountInWords, formatBDT } from '@/lib/formatters';

export interface PayrollFormulaContext {
  BASIC: number;
  ALLOWANCES: number;
  GROSS: number;
  DEDUCTIONS: number;
  NET: number;
  PRESENT_DAYS: number;
  ABSENT_DAYS: number;
  LATE_DAYS: number;
  LATE_PENALTY_DAYS: number;
  HALF_DAYS: number;
  PAID_LEAVE_DAYS: number;
  UNPAID_LEAVE_DAYS: number;
  BONUS: number;
  OVERTIME_HOURS: number;
  OVERTIME_RATE: number;
  OVERTIME_MULTIPLIER?: number;
  DAYS_IN_MONTH?: number;
  PER_DAY_RATE?: number;
  LOAN_INSTALLMENT: number;
  MANUAL_DEDUCTION: number;
  [key: string]: number | undefined;
}

export function toPaisa(taka: number | null | undefined): number {
  const n = Number(taka || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/**
 * Convert integer paisa back to rounded integer Taka once at the end.
 */
export function fromPaisa(paisa: number): number {
  if (!Number.isFinite(paisa)) return 0;
  return Math.round(paisa / 100);
}

export function getDaysInPeriod(month: number, year: number, daysBasis: DaysBasis = 'calendar'): number {
  if (daysBasis === '30') return 30;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function computePercentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

type Token =
  | { kind: 'num'; val: number }
  | { kind: 'id'; val: string }
  | { kind: 'op'; val: string }
  | { kind: 'paren'; val: '(' | ')' }
  | { kind: 'q' }
  | { kind: 'colon' }
  | { kind: 'comma' };

function tokenizeFormula(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        numStr += expr[i++];
      }
      const parsed = Number(numStr);
      tokens.push({ kind: 'num', val: isNaN(parsed) ? 0 : parsed });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let id = '';
      while (i < expr.length && /[A-Za-z0-9_]/.test(expr[i])) {
        id += expr[i++];
      }
      tokens.push({ kind: 'id', val: id.toUpperCase() });
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ kind: 'paren', val: ch });
      i++;
      continue;
    }
    if (ch === '?') {
      tokens.push({ kind: 'q' });
      i++;
      continue;
    }
    if (ch === ':') {
      tokens.push({ kind: 'colon' });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma' });
      i++;
      continue;
    }
    const two = expr.slice(i, i + 2);
    if (['>=', '<=', '==', '!='].includes(two)) {
      tokens.push({ kind: 'op', val: two });
      i += 2;
      continue;
    }
    if (['+', '-', '*', '/', '%', '>', '<'].includes(ch)) {
      tokens.push({ kind: 'op', val: ch });
      i++;
      continue;
    }
    throw new Error(`Unsupported character "${ch}" in salary rule formula`);
  }
  return tokens;
}

/**
 * Safe recursive-descent formula evaluator (supports arithmetic, comparisons, ternary ? :, MIN/MAX/ROUND)
 */
export function evaluatePayrollFormula(expr: string, ctx: PayrollFormulaContext): number {
  const trimmed = (expr || '').trim();
  if (!trimmed) return 0;

  const tokens = tokenizeFormula(trimmed);
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parseTernary(): number {
    const cond = parseComparison();
    if (peek()?.kind === 'q') {
      consume();
      const truthy = parseTernary();
      if (peek()?.kind !== 'colon') {
        throw new Error('Expected ":" in ternary formula expression');
      }
      consume();
      const falsy = parseTernary();
      return cond ? truthy : falsy;
    }
    return cond;
  }

  function parseComparison(): number {
    let left = parseAdditive();
    while (peek()?.kind === 'op' && ['>', '<', '>=', '<=', '==', '!='].includes((peek() as any).val)) {
      const op = (consume() as any).val;
      const right = parseAdditive();
      if (op === '>') left = left > right ? 1 : 0;
      else if (op === '<') left = left < right ? 1 : 0;
      else if (op === '>=') left = left >= right ? 1 : 0;
      else if (op === '<=') left = left <= right ? 1 : 0;
      else if (op === '==') left = left === right ? 1 : 0;
      else if (op === '!=') left = left !== right ? 1 : 0;
    }
    return left;
  }

  function parseAdditive(): number {
    let left = parseMultiplicative();
    while (peek()?.kind === 'op' && ['+', '-'].includes((peek() as any).val)) {
      const op = (consume() as any).val;
      const right = parseMultiplicative();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseMultiplicative(): number {
    let left = parseUnary();
    while (peek()?.kind === 'op' && ['*', '/', '%'].includes((peek() as any).val)) {
      const op = (consume() as any).val;
      const right = parseUnary();
      if (op === '*') left = left * right;
      else if (op === '/') left = right === 0 ? 0 : left / right;
      else left = right === 0 ? 0 : left % right;
    }
    return left;
  }

  function parseUnary(): number {
    if (peek()?.kind === 'op' && (peek() as any).val === '-') {
      consume();
      return -parseUnary();
    }
    if (peek()?.kind === 'op' && (peek() as any).val === '+') {
      consume();
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const t = peek();
    if (!t) return 0;

    if (t.kind === 'num') {
      consume();
      return t.val;
    }

    if (t.kind === 'paren' && t.val === '(') {
      consume();
      const val = parseTernary();
      if (peek()?.kind === 'paren' && (peek() as any).val === ')') {
        consume();
      }
      return val;
    }

    if (t.kind === 'id') {
      consume();
      if (peek()?.kind === 'paren' && (peek() as any).val === '(') {
        consume();
        const args: number[] = [];
        if (!(peek()?.kind === 'paren' && (peek() as any).val === ')')) {
          args.push(parseTernary());
          while (peek()?.kind === 'comma') {
            consume();
            args.push(parseTernary());
          }
        }
        if (peek()?.kind === 'paren' && (peek() as any).val === ')') {
          consume();
        }
        if (t.val === 'MIN') return args.length ? Math.min(...args) : 0;
        if (t.val === 'MAX') return args.length ? Math.max(...args) : 0;
        if (t.val === 'ROUND') return args.length ? Math.round(args[0]) : 0;
        return 0;
      }
      return Number(ctx[t.val] ?? 0);
    }

    throw new Error('Unexpected token in formula');
  }

  const result = parseTernary();
  return isFinite(result) ? result : 0;
}

export async function generateNextPayslipNo(month: number, year: number): Promise<string> {
  const ym = `${year}${String(month).padStart(2, '0')}`;
  const seq = await getNextSequence(`payslip_${ym}`);
  return `PAY-${ym}-${String(seq).padStart(4, '0')}`;
}

function countOverlapDays(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const s = new Date(Math.max(aStart.getTime(), bStart.getTime()));
  const e = new Date(Math.min(aEnd.getTime(), bEnd.getTime()));
  s.setUTCHours(0, 0, 0, 0);
  e.setUTCHours(0, 0, 0, 0);
  if (e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export interface PureRuleInput {
  _id?: any;
  name: string;
  code: string;
  category: SalaryRuleCategory;
  type: SalaryRuleType;
  amount_or_percentage: number;
  formula?: string;
  sequence: number;
  active?: boolean;
}

export interface PureCalculationInput {
  month: number;
  year: number;
  daysBasis: DaysBasis;
  overtimeMultiplier: number;
  contractBasic: number;
  rules: PureRuleInput[];
  contractStart: Date;
  contractEnd?: Date | null;
  joiningDate?: Date | null;
  resignationDate?: Date | null;
  attendance: {
    presentDays: number;
    absentDays: number;
    lateDays: number;
    latePenaltyDays: number;
    halfDays: number;
    paidLeaveDays: number;
    unpaidLeaveDays: number;
    attendanceOvertimeHours: number;
  };
  monthlyInput: {
    bonus?: number;
    bonus_type?: BonusType;
    bonus_festival?: number;
    bonus_performance?: number;
    bonus_other?: number;
    overtime_hours?: number;
    overtime_rate?: number;
    loan_installment?: number;
    advance_deduction?: number;
    fine?: number;
    other_adjustment?: number;
    manual_deduction?: number;
  };
}

export interface PureCalculationResult {
  days_basis: DaysBasis;
  days_in_month: number;
  calendar_days_in_month: number;
  prorated_days: number;
  is_prorated: boolean;
  per_day_rate: number;
  overtime_multiplier: number;
  attendance_summary: {
    presentDays: number;
    absentDays: number;
    lateDays: number;
    latePenaltyDays: number;
    halfDays: number;
    paidLeaveDays: number;
    unpaidLeaveDays: number;
  };
  inputs_snapshot: {
    bonus: number;
    bonus_type: BonusType;
    bonus_festival: number;
    bonus_performance: number;
    bonus_other: number;
    overtime_hours: number;
    overtime_rate: number;
    loan_installment: number;
    advance_deduction: number;
    fine: number;
    other_adjustment: number;
    manual_deduction: number;
  };
  lines: IPayslipLine[];
  basic_pay: number;
  total_allowances: number;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  amount_in_words: string;
}

const RESERVED_ENGINE_CODES = new Set([
  'OT',
  'BONUS',
  'PF',
  'TDS',
  'LOAN',
  'ABSDED',
  'MANDED',
  'GROSS',
  'NET',
]);

/**
 * Pure integer-paisa Payroll Calculation Engine (single rounding at the end).
 */
export function calculatePayslipPure(input: PureCalculationInput): PureCalculationResult {
  const { month, year, daysBasis, attendance, monthlyInput } = input;
  const overtimeMultiplier = Number(input.overtimeMultiplier) > 0 ? Number(input.overtimeMultiplier) : 2;
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const calendarDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const daysInMonth = getDaysInPeriod(month, year, daysBasis);

  // Proration window (mid-month joiner / leaver)
  const effectiveStart = new Date(
    Math.max(
      monthStart.getTime(),
      new Date(input.contractStart).getTime(),
      input.joiningDate ? new Date(input.joiningDate).getTime() : monthStart.getTime()
    )
  );
  const effectiveEnd = new Date(
    Math.min(
      monthEnd.getTime(),
      input.contractEnd ? new Date(input.contractEnd).getTime() : monthEnd.getTime(),
      input.resignationDate ? new Date(input.resignationDate).getTime() : monthEnd.getTime()
    )
  );

  const workedCalendarDays = countOverlapDays(effectiveStart, effectiveEnd, monthStart, monthEnd);
  const isProrated = workedCalendarDays < calendarDays;
  const proratedDays = isProrated ? workedCalendarDays : daysInMonth;

  const contractBasicPaisa = Math.max(0, toPaisa(input.contractBasic));
  const activeRules = (input.rules || [])
    .filter((r) => r.active !== false)
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

  const scaleProrated = (paisa: number): number => {
    if (!isProrated) return paisa;
    if (workedCalendarDays <= 0) return 0;
    return Math.round((paisa * workedCalendarDays) / calendarDays);
  };

  // 1. Evaluate Contract Earnings (BASIC + ALLOWANCE rules except reserved variable codes)
  let fullContractBasicPaisa = 0;
  let fullContractAllowancesPaisa = 0;

  interface ComputedRulePaisa {
    rule: PureRuleInput;
    fullPaisa: number;
    proratedPaisa: number;
    note: string;
    source: PayslipLineSource;
  }

  const earningRuleItems: ComputedRulePaisa[] = [];
  const customDeductionItems: ComputedRulePaisa[] = [];
  const evalCtx: Record<string, number> = { BASIC: input.contractBasic };

  for (const rule of activeRules) {
    const code = (rule.code || '').toUpperCase();
    if (RESERVED_ENGINE_CODES.has(code)) continue;

    if (rule.category === 'BASIC' || rule.category === 'ALLOWANCE') {
      let fullPaisa = 0;
      let note = '';
      if (rule.type === 'fixed') {
        fullPaisa = Math.max(0, toPaisa(rule.amount_or_percentage));
        note = `Fixed contract component (${formatBDT(fromPaisa(fullPaisa))})`;
      } else if (rule.type === 'percentage_of_basic') {
        const pct = Number(rule.amount_or_percentage || 0);
        fullPaisa = Math.max(0, Math.round((contractBasicPaisa * pct) / 100));
        note = `${pct}% of Contract Basic (${formatBDT(input.contractBasic)})`;
      } else if (rule.type === 'formula') {
        const val = evaluatePayrollFormula(rule.formula || '0', evalCtx as PayrollFormulaContext);
        fullPaisa = Math.max(0, toPaisa(val));
        note = `Structure formula: ${rule.formula || '0'}`;
      }

      const proratedPaisa = scaleProrated(fullPaisa);
      if (isProrated) {
        note += ` · Prorated ${workedCalendarDays}/${calendarDays} days`;
      }
      evalCtx[code] = fromPaisa(fullPaisa);

      if (rule.category === 'BASIC') {
        fullContractBasicPaisa += fullPaisa;
      } else {
        fullContractAllowancesPaisa += fullPaisa;
      }
      earningRuleItems.push({ rule, fullPaisa, proratedPaisa, note, source: 'contract' });
    } else if (rule.category === 'DEDUCTION') {
      let fullPaisa = 0;
      let note = '';
      if (rule.type === 'fixed') {
        fullPaisa = Math.max(0, toPaisa(rule.amount_or_percentage));
        note = `Fixed contract deduction (${formatBDT(fromPaisa(fullPaisa))})`;
      } else if (rule.type === 'percentage_of_basic') {
        const pct = Number(rule.amount_or_percentage || 0);
        fullPaisa = Math.max(0, Math.round((contractBasicPaisa * pct) / 100));
        note = `${pct}% of Contract Basic (${formatBDT(input.contractBasic)})`;
      } else if (rule.type === 'formula') {
        const val = evaluatePayrollFormula(rule.formula || '0', evalCtx as PayrollFormulaContext);
        fullPaisa = Math.max(0, toPaisa(val));
        note = `Structure formula: ${rule.formula || '0'}`;
      }
      const proratedPaisa = scaleProrated(fullPaisa);
      if (fullPaisa > 0) {
        customDeductionItems.push({ rule, fullPaisa, proratedPaisa, note, source: 'contract' });
      }
    }
  }

  // Fallback if structure had no BASIC line
  if (fullContractBasicPaisa === 0) {
    fullContractBasicPaisa = contractBasicPaisa;
    earningRuleItems.unshift({
      rule: {
        name: 'Basic Salary',
        code: 'BASIC',
        category: 'BASIC',
        type: 'fixed',
        amount_or_percentage: input.contractBasic,
        sequence: 10,
      },
      fullPaisa: contractBasicPaisa,
      proratedPaisa: scaleProrated(contractBasicPaisa),
      note: isProrated
        ? `Contract Basic (${formatBDT(input.contractBasic)}) · Prorated ${workedCalendarDays}/${calendarDays} days`
        : `Contract Basic (${formatBDT(input.contractBasic)})`,
      source: 'contract',
    });
  }

  // 2. Per day rate = monthly gross / days in month
  const fullMonthlyContractGrossPaisa = fullContractBasicPaisa + fullContractAllowancesPaisa;
  const perDayRatePaisa = Math.round(fullMonthlyContractGrossPaisa / daysInMonth);
  const perDayRateBdt = fromPaisa(perDayRatePaisa);

  // 3. Overtime = overtime hours x hourly rate x overtime multiplier (default 2)
  const inputOtHours = Math.max(0, Number(monthlyInput.overtime_hours || 0));
  const attendanceOtHours = Math.max(0, Number(attendance.attendanceOvertimeHours || 0));
  const totalOtHours = Math.round((inputOtHours + attendanceOtHours) * 100) / 100;
  const explicitHourlyRatePaisa = Math.max(0, toPaisa(monthlyInput.overtime_rate || 0));
  const derivedHourlyRatePaisa = Math.round(perDayRatePaisa / 8);
  const hourlyRatePaisa = explicitHourlyRatePaisa > 0 ? explicitHourlyRatePaisa : derivedHourlyRatePaisa;
  const overtimePaisa =
    totalOtHours > 0 ? Math.round(totalOtHours * hourlyRatePaisa * overtimeMultiplier) : 0;

  // 4. Bonuses breakdown (Festival / Performance / Other)
  const bonusType: BonusType = monthlyInput.bonus_type || 'festival';
  let bonusFestivalPaisa = Math.max(0, toPaisa(monthlyInput.bonus_festival || 0));
  let bonusPerformancePaisa = Math.max(0, toPaisa(monthlyInput.bonus_performance || 0));
  let bonusOtherPaisa = Math.max(0, toPaisa(monthlyInput.bonus_other || 0));
  const legacyBonusPaisa = Math.max(0, toPaisa(monthlyInput.bonus || 0));

  if (
    bonusFestivalPaisa === 0 &&
    bonusPerformancePaisa === 0 &&
    bonusOtherPaisa === 0 &&
    legacyBonusPaisa > 0
  ) {
    if (bonusType === 'performance') bonusPerformancePaisa = legacyBonusPaisa;
    else if (bonusType === 'other') bonusOtherPaisa = legacyBonusPaisa;
    else bonusFestivalPaisa = legacyBonusPaisa;
  }
  const totalBonusPaisa = bonusFestivalPaisa + bonusPerformancePaisa + bonusOtherPaisa;

  const otherAdjustmentPaisa = toPaisa(monthlyInput.other_adjustment || 0);
  const positiveAdjustmentPaisa = otherAdjustmentPaisa > 0 ? otherAdjustmentPaisa : 0;
  const negativeAdjustmentPaisa = otherAdjustmentPaisa < 0 ? Math.abs(otherAdjustmentPaisa) : 0;

  const advancePaisa = Math.max(
    0,
    toPaisa(monthlyInput.advance_deduction ?? monthlyInput.loan_installment ?? 0)
  );
  const finePaisa = Math.max(0, toPaisa(monthlyInput.fine ?? monthlyInput.manual_deduction ?? 0));

  // 5. Unpaid Absence & Unpaid Leave deductions (Paid leave is NOT deducted)
  const unpaidAbsenceUnits =
    Math.max(0, attendance.absentDays) +
    Math.max(0, attendance.latePenaltyDays) +
    Math.max(0, attendance.halfDays) * 0.5;
  const unpaidAbsencePaisa = Math.round(perDayRatePaisa * unpaidAbsenceUnits);
  const unpaidLeavePaisa = Math.round(perDayRatePaisa * Math.max(0, attendance.unpaidLeaveDays));

  // 6. Round once per line cleanly in BDT so line items always reconcile to exact Totals
  const lines: IPayslipLine[] = [];
  let basicPayBdt = 0;
  let totalAllowancesBdt = 0;

  for (const item of earningRuleItems) {
    const amt = fromPaisa(item.proratedPaisa);
    if (item.rule.category === 'BASIC') {
      basicPayBdt += amt;
    } else {
      totalAllowancesBdt += amt;
    }
    lines.push({
      rule_id: item.rule._id || null,
      name: item.rule.name,
      code: item.rule.code,
      category: item.rule.category,
      sequence: item.rule.sequence,
      amount: amt,
      source: item.source,
      calculation_note: item.note,
    });
  }

  if (overtimePaisa > 0) {
    const otBdt = fromPaisa(overtimePaisa);
    totalAllowancesBdt += otBdt;
    lines.push({
      name: 'Overtime Pay',
      code: 'OT',
      category: 'ALLOWANCE',
      sequence: 55,
      amount: otBdt,
      source: attendanceOtHours > 0 && inputOtHours === 0 ? 'attendance' : 'monthly_input',
      calculation_note: `${totalOtHours}h × ${(hourlyRatePaisa / 100).toFixed(2)} BDT/hr × ${overtimeMultiplier}x multiplier`,
    });
  }

  const bonusEntries: Array<{ code: string; name: string; paisa: number; seq: number }> = [
    { code: 'BONUS_FEST', name: 'Festival Bonus', paisa: bonusFestivalPaisa, seq: 61 },
    { code: 'BONUS_PERF', name: 'Performance Bonus', paisa: bonusPerformancePaisa, seq: 62 },
    { code: 'BONUS_OTH', name: 'Other Bonus', paisa: bonusOtherPaisa, seq: 63 },
  ];
  for (const b of bonusEntries) {
    if (b.paisa > 0) {
      const bBdt = fromPaisa(b.paisa);
      totalAllowancesBdt += bBdt;
      lines.push({
        name: b.name,
        code: b.code,
        category: 'ALLOWANCE',
        sequence: b.seq,
        amount: bBdt,
        source: 'monthly_input',
        calculation_note: `Monthly input (${b.name})`,
      });
    }
  }

  if (positiveAdjustmentPaisa > 0) {
    const adjBdt = fromPaisa(positiveAdjustmentPaisa);
    totalAllowancesBdt += adjBdt;
    lines.push({
      name: 'Other Adjustment (+)',
      code: 'ADJ_PLUS',
      category: 'ALLOWANCE',
      sequence: 65,
      amount: adjBdt,
      source: 'monthly_input',
      calculation_note: 'Positive monthly adjustment',
    });
  }

  const grossPayBdt = basicPayBdt + totalAllowancesBdt;
  lines.push({
    name: 'Gross Earnings',
    code: 'GROSS',
    category: 'GROSS',
    sequence: 70,
    amount: grossPayBdt,
    source: 'formula',
    calculation_note: `Earnings + Overtime + Bonuses (${daysInMonth} ${daysBasis} days/month, Per Day: ${formatBDT(perDayRateBdt)})`,
  });

  // Deductions
  let totalDeductionsBdt = 0;

  for (const dItem of customDeductionItems) {
    const amt = fromPaisa(dItem.proratedPaisa);
    if (amt > 0) {
      totalDeductionsBdt += amt;
      lines.push({
        rule_id: dItem.rule._id || null,
        name: dItem.rule.name,
        code: dItem.rule.code,
        category: 'DEDUCTION',
        sequence: dItem.rule.sequence,
        amount: amt,
        source: dItem.source,
        calculation_note: dItem.note,
      });
    }
  }

  if (unpaidAbsencePaisa > 0) {
    const absBdt = fromPaisa(unpaidAbsencePaisa);
    totalDeductionsBdt += absBdt;
    lines.push({
      name: 'Unpaid Absence & Late Deduction',
      code: 'ABSDED',
      category: 'DEDUCTION',
      sequence: 105,
      amount: absBdt,
      source: 'attendance',
      calculation_note: `${attendance.absentDays} absent + ${attendance.latePenaltyDays} late penalty (${attendance.lateDays} late) + ${attendance.halfDays}×0.5 half = ${unpaidAbsenceUnits}d × ${(perDayRatePaisa / 100).toFixed(2)}`,
    });
  }

  if (unpaidLeavePaisa > 0) {
    const ulBdt = fromPaisa(unpaidLeavePaisa);
    totalDeductionsBdt += ulBdt;
    lines.push({
      name: 'Unpaid Leave Deduction',
      code: 'UNPAIDLEAVE',
      category: 'DEDUCTION',
      sequence: 108,
      amount: ulBdt,
      source: 'leave',
      calculation_note: `${attendance.unpaidLeaveDays} unpaid leave day(s) × ${(perDayRatePaisa / 100).toFixed(2)} (${attendance.paidLeaveDays} paid leave not deducted)`,
    });
  }

  if (advancePaisa > 0) {
    const advBdt = fromPaisa(advancePaisa);
    totalDeductionsBdt += advBdt;
    lines.push({
      name: 'Advance Deduction',
      code: 'ADVANCE',
      category: 'DEDUCTION',
      sequence: 112,
      amount: advBdt,
      source: 'monthly_input',
      calculation_note: 'Monthly advance recovery',
    });
  }

  if (finePaisa > 0) {
    const fineBdt = fromPaisa(finePaisa);
    totalDeductionsBdt += fineBdt;
    lines.push({
      name: 'Fine / Penalty',
      code: 'FINE',
      category: 'DEDUCTION',
      sequence: 115,
      amount: fineBdt,
      source: 'monthly_input',
      calculation_note: 'Monthly fine / penalty',
    });
  }

  if (negativeAdjustmentPaisa > 0) {
    const negBdt = fromPaisa(negativeAdjustmentPaisa);
    totalDeductionsBdt += negBdt;
    lines.push({
      name: 'Other Adjustment (-)',
      code: 'ADJ_MINUS',
      category: 'DEDUCTION',
      sequence: 118,
      amount: negBdt,
      source: 'monthly_input',
      calculation_note: 'Negative monthly adjustment',
    });
  }

  const netPayBdt = grossPayBdt - totalDeductionsBdt;
  lines.push({
    name: 'Net Payable',
    code: 'NET',
    category: 'NET',
    sequence: 130,
    amount: netPayBdt,
    source: 'formula',
    calculation_note: 'Gross - Deductions - Advances - Fines',
  });

  return {
    days_basis: daysBasis,
    days_in_month: daysInMonth,
    calendar_days_in_month: calendarDays,
    prorated_days: proratedDays,
    is_prorated: isProrated,
    per_day_rate: perDayRateBdt,
    overtime_multiplier: overtimeMultiplier,
    attendance_summary: {
      presentDays: attendance.presentDays,
      absentDays: attendance.absentDays,
      lateDays: attendance.lateDays,
      latePenaltyDays: attendance.latePenaltyDays,
      halfDays: attendance.halfDays,
      paidLeaveDays: attendance.paidLeaveDays,
      unpaidLeaveDays: attendance.unpaidLeaveDays,
    },
    inputs_snapshot: {
      bonus: fromPaisa(totalBonusPaisa),
      bonus_type: bonusType,
      bonus_festival: fromPaisa(bonusFestivalPaisa),
      bonus_performance: fromPaisa(bonusPerformancePaisa),
      bonus_other: fromPaisa(bonusOtherPaisa),
      overtime_hours: totalOtHours,
      overtime_rate: Math.round(hourlyRatePaisa / 100),
      loan_installment: fromPaisa(advancePaisa),
      advance_deduction: fromPaisa(advancePaisa),
      fine: fromPaisa(finePaisa),
      other_adjustment: fromPaisa(otherAdjustmentPaisa),
      manual_deduction: fromPaisa(finePaisa),
    },
    lines,
    basic_pay: basicPayBdt,
    total_allowances: totalAllowancesBdt,
    gross_pay: grossPayBdt,
    total_deductions: totalDeductionsBdt,
    net_pay: netPayBdt,
    amount_in_words: amountInWords(netPayBdt),
  };
}

export async function computeEmployeePayslipData({
  employeeId,
  month,
  year,
  daysBasis = 'calendar',
  overtimeMultiplier = 2,
}: {
  employeeId: string;
  month: number;
  year: number;
  daysBasis?: DaysBasis;
  overtimeMultiplier?: number;
}) {
  const employee = await Employee.findById(employeeId).lean();
  if (!employee) {
    throw new Error('Employee not found');
  }

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

  const dailyDocs = await DailyAttendance.find({
    employee_id: employeeId,
    date: { $gte: monthStart, $lte: monthEnd },
  }).lean();

  let presentDays = 0;
  let absentDays = 0;
  let lateDays = 0;
  let halfDays = 0;
  let attendanceOvertimeHours = 0;
  let dailyPaidLeaveDays = 0;
  let dailyUnpaidLeaveDays = 0;

  if (dailyDocs.length > 0) {
    for (const d of dailyDocs) {
      if (d.status === 'Present') presentDays++;
      else if (d.status === 'Late') lateDays++;
      else if (d.status === 'Half-day') halfDays++;
      else if (d.status === 'Absent') absentDays++;
      else if (d.status === 'Leave') {
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
      if (a.status === 'Present') presentDays++;
      else if (a.status === 'Late') lateDays++;
      else if (a.status === 'Half-Day') halfDays++;
      else if (a.status === 'Absent') absentDays++;
    }
  }

  const latePerDed = schedule.late_days_per_deduction || 3;
  const latePenaltyDays =
    schedule.late_rule_enabled && latePerDed > 0 ? Math.floor(lateDays / latePerDed) : 0;

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
    const isPaid = lv.is_paid !== undefined ? Boolean(lv.is_paid) : lv.leave_type !== 'Unpaid';
    if (!isPaid) unpaidLeaveDays += days;
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
    daysBasis,
    overtimeMultiplier,
    contractBasic: contract.basic_salary || 0,
    rules,
    contractStart: new Date(contract.start_date),
    contractEnd: contract.end_date ? new Date(contract.end_date) : null,
    joiningDate: employee.joining_date ? new Date(employee.joining_date) : null,
    resignationDate: employee.resignation_date ? new Date(employee.resignation_date) : null,
    attendance: {
      presentDays,
      absentDays,
      lateDays,
      latePenaltyDays,
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

/**
 * Extensible hook called when a Payroll Run becomes Confirmed.
 * Reserved for future Accounting Journal posting, Income Tax (TDS), and Provident Fund automation.
 */
export async function onPayrollRunConfirmed(_context: {
  runId: string;
  month: number;
  year: number;
  branch: string;
  totalNetPay: number;
}): Promise<void> {
  // Intentionally a no-op stub per Phase 2 ("Do not build Accounting/Tax/PF now").
  void _context;
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
