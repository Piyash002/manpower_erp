import type { SalaryRuleCategory, SalaryRuleType } from '@/models/SalaryRule';
import type { BonusType } from '@/models/PayrollInput';
import type { IPayslipLine, PayslipLineSource } from '@/models/Payslip';
import type { DaysBasis } from '@/models/PayslipBatch';
import type { PayrollSettingsSnapshot, RoundingMode } from '@/models/PayrollSettings';
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
 * Convert integer paisa to Taka according to configured rounding_mode.
 */
export function fromPaisa(paisa: number, roundingMode: RoundingMode = 'nearest_taka'): number {
  if (!Number.isFinite(paisa)) return 0;
  if (roundingMode === 'exact_paisa') {
    return Math.round(paisa) / 100;
  }
  return Math.round(paisa / 100);
}

function formatNumComma(n: number): string {
  const rounded = Math.round(n);
  const abs = Math.abs(rounded).toString();
  let last3 = abs.slice(-3);
  const rest = abs.slice(0, -3);
  if (rest) last3 = ',' + last3;
  return `${rounded < 0 ? '-' : ''}${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')}${last3}`;
}

export function getDaysInPeriod(
  month: number,
  year: number,
  daysBasis: DaysBasis = 'fixed_30',
  workingDaysPerMonth = 26
): number {
  if (daysBasis === 'fixed_30' || daysBasis === '30') return 30;
  if (daysBasis === 'working_days') {
    const w = Number(workingDaysPerMonth);
    return Number.isFinite(w) && w >= 20 && w <= 31 ? Math.round(w) : 26;
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function getDaysBasisLabel(daysBasis: DaysBasis, daysCount: number): string {
  if (daysBasis === 'fixed_30' || daysBasis === '30') return 'Fixed 30 days';
  if (daysBasis === 'working_days') return `Working ${daysCount} days`;
  return `Calendar ${daysCount} days`;
}

export function computePercentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export function countOverlapDays(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const s = new Date(Math.max(aStart.getTime(), bStart.getTime()));
  const e = new Date(Math.min(aEnd.getTime(), bEnd.getTime()));
  s.setUTCHours(0, 0, 0, 0);
  e.setUTCHours(0, 0, 0, 0);
  if (e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
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

/**
 * Pure Sandwich Rule evaluator:
 * Any contiguous block of Weekly Off / Holiday days bounded immediately before AND after
 * by an Absent day counts as Sandwich Absent days.
 */
export function evaluateSandwichAbsentDays(params: {
  month: number;
  year: number;
  workingDays: number[];
  holidayDayNumbers: Set<number>;
  statusByDay: Map<number, string>;
}): number {
  const daysInCal = new Date(Date.UTC(params.year, params.month, 0)).getUTCDate();
  const offDays = new Set<number>();

  for (let d = 1; d <= daysInCal; d++) {
    const dow = new Date(Date.UTC(params.year, params.month - 1, d)).getUTCDay();
    const isOff = !params.workingDays.includes(dow) || params.holidayDayNumbers.has(d);
    const st = params.statusByDay.get(d);
    if (isOff && (!st || st === 'Holiday')) {
      offDays.add(d);
    }
  }

  let sandwichAbsent = 0;
  let d = 1;
  while (d <= daysInCal) {
    if (!offDays.has(d)) {
      d++;
      continue;
    }
    const blockStart = d;
    while (d <= daysInCal && offDays.has(d)) d++;
    const blockEnd = d - 1;

    const prevStatus = blockStart > 1 ? params.statusByDay.get(blockStart - 1) : undefined;
    const nextStatus = blockEnd < daysInCal ? params.statusByDay.get(blockEnd + 1) : undefined;
    if (prevStatus === 'Absent' && nextStatus === 'Absent') {
      sandwichAbsent += blockEnd - blockStart + 1;
    }
  }

  return sandwichAbsent;
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
  settings: PayrollSettingsSnapshot;
  contractBasic: number;
  rules: PureRuleInput[];
  contractStart: Date;
  contractEnd?: Date | null;
  joiningDate?: Date | null;
  resignationDate?: Date | null;
  attendance: {
    presentDays: number;
    absentDays: number;
    sandwichAbsentDays?: number;
    lateDays: number;
    lateMinutesList?: number[];
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
  settings_version: number;
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
  'HALFDED',
  'LATEDED',
  'UNPAIDLEAVE',
  'MANDED',
  'GROSS',
  'NET',
]);

/**
 * Single Settings-Driven Integer-Paisa Payroll Calculation Engine (100% browser-safe).
 */
export function calculatePayslipPure(input: PureCalculationInput): PureCalculationResult {
  const { month, year, settings, attendance, monthlyInput } = input;
  const roundingMode: RoundingMode = settings.rounding_mode || 'nearest_taka';
  const overtimeMultiplier =
    Number(settings.overtime_multiplier) > 0 ? Number(settings.overtime_multiplier) : 2;
  const hoursPerDay =
    Number(settings.overtime_hours_per_day) > 0 ? Number(settings.overtime_hours_per_day) : 8;

  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const calendarDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const daysBasisCount = getDaysInPeriod(
    month,
    year,
    settings.days_basis || 'fixed_30',
    settings.working_days_per_month || 26
  );
  const daysLabel = getDaysBasisLabel(settings.days_basis || 'fixed_30', daysBasisCount);

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
  const isMidMonthWindow = workedCalendarDays < calendarDays;
  const isProrated = Boolean(settings.prorate_mid_month !== false && isMidMonthWindow);

  let proratedDays = daysBasisCount;
  if (isProrated) {
    if (workedCalendarDays <= 0) {
      proratedDays = 0;
    } else if (settings.days_basis === 'fixed_30' || settings.days_basis === '30') {
      const startDay = effectiveStart.getUTCDate();
      const endDay = Math.min(30, effectiveEnd.getUTCDate());
      proratedDays =
        effectiveEnd.getUTCDate() === calendarDays
          ? Math.max(0, 30 - startDay + 1)
          : Math.max(0, endDay - startDay + 1);
    } else {
      proratedDays = Math.min(daysBasisCount, workedCalendarDays);
    }
  }

  const contractBasicPaisa = Math.max(0, toPaisa(input.contractBasic));
  const activeRules = (input.rules || [])
    .filter((r) => r.active !== false)
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

  const scaleProrated = (paisa: number): number => {
    if (!isProrated) return paisa;
    if (proratedDays <= 0 || daysBasisCount <= 0) return 0;
    return Math.round((paisa * proratedDays) / daysBasisCount);
  };

  let fullContractBasicPaisa = 0;
  let fullContractAllowancesPaisa = 0;
  const fullAmountByRuleCodePaisa = new Map<string, number>();

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
        note = `Fixed contract component (${formatBDT(fromPaisa(fullPaisa, roundingMode))})`;
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
        note += ` · Prorated ${proratedDays}/${daysBasisCount} days`;
      }
      fullAmountByRuleCodePaisa.set(code, fullPaisa);
      evalCtx[code] = fromPaisa(fullPaisa, roundingMode);

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
        note = `Fixed contract deduction (${formatBDT(fromPaisa(fullPaisa, roundingMode))})`;
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

  if (fullContractBasicPaisa === 0) {
    fullContractBasicPaisa = contractBasicPaisa;
    fullAmountByRuleCodePaisa.set('BASIC', contractBasicPaisa);
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
        ? `Contract Basic (${formatBDT(input.contractBasic)}) · Prorated ${proratedDays}/${daysBasisCount} days`
        : `Contract Basic (${formatBDT(input.contractBasic)})`,
      source: 'contract',
    });
  }

  const fullContractGrossPaisa = fullContractBasicPaisa + fullContractAllowancesPaisa;
  let deductionBasisPaisa = fullContractGrossPaisa;
  let basisLabel = 'Gross basis';

  if (settings.absence_deduction_basis === 'basic') {
    deductionBasisPaisa = fullContractBasicPaisa;
    basisLabel = 'Basic basis';
  } else if (settings.absence_deduction_basis === 'selected_components') {
    const selectedCodes = (settings.selected_component_codes || []).map((c) => c.toUpperCase());
    deductionBasisPaisa = selectedCodes.reduce(
      (sum, code) => sum + (fullAmountByRuleCodePaisa.get(code) || 0),
      0
    );
    basisLabel = `Selected (${selectedCodes.join(' + ') || 'None'}) basis`;
  }

  const dailyRatePaisa = Math.round(deductionBasisPaisa / daysBasisCount);
  const basisBdt = fromPaisa(deductionBasisPaisa, roundingMode);
  const dailyRateBdt = fromPaisa(dailyRatePaisa, roundingMode);

  const inputOtHours = Math.max(0, Number(monthlyInput.overtime_hours || 0));
  const attendanceOtHours = Math.max(0, Number(attendance.attendanceOvertimeHours || 0));
  const totalOtHours = Math.round((inputOtHours + attendanceOtHours) * 100) / 100;
  const otBasisPaisa =
    settings.overtime_basis === 'gross' ? fullContractGrossPaisa : fullContractBasicPaisa;
  const otBasisLabel = settings.overtime_basis === 'gross' ? 'Gross' : 'Basic';
  const explicitHourlyRatePaisa = Math.max(0, toPaisa(monthlyInput.overtime_rate || 0));
  const derivedHourlyRatePaisa = Math.round(otBasisPaisa / daysBasisCount / hoursPerDay);
  const hourlyRatePaisa = explicitHourlyRatePaisa > 0 ? explicitHourlyRatePaisa : derivedHourlyRatePaisa;
  const overtimePaisa =
    totalOtHours > 0 ? Math.round(totalOtHours * hourlyRatePaisa * overtimeMultiplier) : 0;

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

  const sandwichAbsent = settings.sandwich_rule_enabled
    ? Math.max(0, attendance.sandwichAbsentDays || 0)
    : 0;
  const absentTotalDays = Math.max(0, attendance.absentDays) + sandwichAbsent;
  const halfDaysCount = Math.max(0, attendance.halfDays);

  let qualifyingLateDays = Math.max(0, attendance.lateDays);
  if (Array.isArray(attendance.lateMinutesList) && attendance.lateMinutesList.length > 0) {
    const grace = Math.max(0, settings.grace_minutes || 0);
    qualifyingLateDays = attendance.lateMinutesList.filter((m) => m > grace).length;
  }

  const lateCountReq = Math.max(1, settings.late_count_per_absent || 3);
  const latePenaltyDays = settings.late_rule_enabled
    ? Math.floor(qualifyingLateDays / lateCountReq)
    : 0;
  const extraLateDays = settings.late_rule_enabled
    ? Math.max(0, qualifyingLateDays - latePenaltyDays * lateCountReq)
    : qualifyingLateDays;
  const extraLateFinePaisa =
    settings.late_rule_enabled && Number(settings.extra_late_fixed_fine || 0) > 0
      ? Math.round(extraLateDays * toPaisa(settings.extra_late_fixed_fine))
      : 0;

  const absenceDeductionPaisa = Math.round((deductionBasisPaisa * absentTotalDays) / daysBasisCount);
  const halfDayDeductionPaisa = Math.round((deductionBasisPaisa * 0.5 * halfDaysCount) / daysBasisCount);
  const lateAbsentPartPaisa = Math.round((deductionBasisPaisa * latePenaltyDays) / daysBasisCount);
  const lateDeductionPaisa = lateAbsentPartPaisa + extraLateFinePaisa;
  const unpaidLeavePaisa = Math.round(
    (deductionBasisPaisa * Math.max(0, attendance.unpaidLeaveDays)) / daysBasisCount
  );

  const lines: IPayslipLine[] = [];
  let basicPayBdt = 0;
  let totalAllowancesBdt = 0;

  const earningAmountsBdt = earningRuleItems.map((item) => fromPaisa(item.proratedPaisa, roundingMode));
  if (isProrated && roundingMode === 'nearest_taka' && earningAmountsBdt.length > 1) {
    const targetContractTotal = fromPaisa(scaleProrated(fullContractGrossPaisa), 'nearest_taka');
    const sumRounded = earningAmountsBdt.reduce((s, a) => s + a, 0);
    const diff = targetContractTotal - sumRounded;
    if (diff !== 0) {
      earningAmountsBdt[earningAmountsBdt.length - 1] += diff;
    }
  }

  for (let i = 0; i < earningRuleItems.length; i++) {
    const item = earningRuleItems[i];
    const amt = earningAmountsBdt[i];
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
    const otBdt = fromPaisa(overtimePaisa, roundingMode);
    totalAllowancesBdt += otBdt;
    lines.push({
      name: 'Overtime Pay',
      code: 'OT',
      category: 'ALLOWANCE',
      sequence: 55,
      amount: otBdt,
      source: attendanceOtHours > 0 && inputOtHours === 0 ? 'attendance' : 'monthly_input',
      calculation_note:
        explicitHourlyRatePaisa > 0
          ? `Overtime ${totalOtHours}h: ${formatNumComma(explicitHourlyRatePaisa / 100)} × ${overtimeMultiplier}x × ${totalOtHours} = ${formatNumComma(otBdt)}`
          : `Overtime ${totalOtHours}h: ${formatNumComma(fromPaisa(otBasisPaisa, roundingMode))} (${otBasisLabel}) / ${daysBasisCount} / ${hoursPerDay}h × ${overtimeMultiplier}x × ${totalOtHours} = ${formatNumComma(otBdt)}`,
    });
  }

  const bonusEntries: Array<{ code: string; name: string; paisa: number; seq: number }> = [
    { code: 'BONUS_FEST', name: 'Festival Bonus', paisa: bonusFestivalPaisa, seq: 61 },
    { code: 'BONUS_PERF', name: 'Performance Bonus', paisa: bonusPerformancePaisa, seq: 62 },
    { code: 'BONUS_OTH', name: 'Other Bonus', paisa: bonusOtherPaisa, seq: 63 },
  ];
  for (const b of bonusEntries) {
    if (b.paisa > 0) {
      const bBdt = fromPaisa(b.paisa, roundingMode);
      totalAllowancesBdt += bBdt;
      lines.push({
        name: b.name,
        code: b.code,
        category: 'ALLOWANCE',
        sequence: b.seq,
        amount: bBdt,
        source: 'monthly_input',
        calculation_note: `Monthly input (${b.name}: ${formatNumComma(bBdt)})`,
      });
    }
  }

  if (positiveAdjustmentPaisa > 0) {
    const adjBdt = fromPaisa(positiveAdjustmentPaisa, roundingMode);
    totalAllowancesBdt += adjBdt;
    lines.push({
      name: 'Other Adjustment (+)',
      code: 'ADJ_PLUS',
      category: 'ALLOWANCE',
      sequence: 65,
      amount: adjBdt,
      source: 'monthly_input',
      calculation_note: `Positive monthly adjustment: +${formatNumComma(adjBdt)}`,
    });
  }

  const grossPayBdt = Math.round((basicPayBdt + totalAllowancesBdt) * 100) / 100;
  lines.push({
    name: 'Gross Earnings',
    code: 'GROSS',
    category: 'GROSS',
    sequence: 70,
    amount: grossPayBdt,
    source: 'formula',
    calculation_note: `Earnings + Overtime + Bonuses (${daysLabel}, Daily Rate: ${formatNumComma(dailyRateBdt)})`,
  });

  let totalDeductionsBdt = 0;

  for (const dItem of customDeductionItems) {
    const amt = fromPaisa(dItem.proratedPaisa, roundingMode);
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

  if (absenceDeductionPaisa > 0) {
    const absBdt = fromPaisa(absenceDeductionPaisa, roundingMode);
    totalDeductionsBdt += absBdt;
    lines.push({
      name: 'Absence Deduction',
      code: 'ABSDED',
      category: 'DEDUCTION',
      sequence: 102,
      amount: absBdt,
      source: 'attendance',
      calculation_note: `Absent ${absentTotalDays} day${absentTotalDays === 1 ? '' : 's'}${
        sandwichAbsent > 0 ? ` (incl. ${sandwichAbsent} sandwich)` : ''
      }: ${formatNumComma(basisBdt)} / ${daysBasisCount} × ${absentTotalDays} = ${formatNumComma(
        absBdt
      )} (${basisLabel}, ${daysLabel})`,
    });
  }

  if (halfDayDeductionPaisa > 0) {
    const halfBdt = fromPaisa(halfDayDeductionPaisa, roundingMode);
    totalDeductionsBdt += halfBdt;
    lines.push({
      name: 'Half-Day Deduction',
      code: 'HALFDED',
      category: 'DEDUCTION',
      sequence: 104,
      amount: halfBdt,
      source: 'attendance',
      calculation_note: `Half day ${halfDaysCount} day${halfDaysCount === 1 ? '' : 's'}: ${formatNumComma(
        basisBdt
      )} / ${daysBasisCount} × 0.5 × ${halfDaysCount} = ${formatNumComma(
        halfBdt
      )} (${basisLabel}, ${daysLabel})`,
    });
  }

  if (lateDeductionPaisa > 0) {
    const lateBdt = fromPaisa(lateDeductionPaisa, roundingMode);
    totalDeductionsBdt += lateBdt;
    lines.push({
      name: 'Late Deduction',
      code: 'LATEDED',
      category: 'DEDUCTION',
      sequence: 106,
      amount: lateBdt,
      source: 'attendance',
      calculation_note: `Late ${qualifyingLateDays} day${
        qualifyingLateDays === 1 ? '' : 's'
      } (${lateCountReq} = 1 day → ${latePenaltyDays}d): ${formatNumComma(
        basisBdt
      )} / ${daysBasisCount} × ${latePenaltyDays}${
        extraLateFinePaisa > 0 ? ` + ${formatNumComma(fromPaisa(extraLateFinePaisa, roundingMode))} fine` : ''
      } = ${formatNumComma(lateBdt)} (${basisLabel}, ${daysLabel})`,
    });
  }

  if (unpaidLeavePaisa > 0) {
    const ulBdt = fromPaisa(unpaidLeavePaisa, roundingMode);
    totalDeductionsBdt += ulBdt;
    lines.push({
      name: 'Unpaid Leave Deduction',
      code: 'UNPAIDLEAVE',
      category: 'DEDUCTION',
      sequence: 108,
      amount: ulBdt,
      source: 'leave',
      calculation_note: `Unpaid leave ${attendance.unpaidLeaveDays} day${
        attendance.unpaidLeaveDays === 1 ? '' : 's'
      }: ${formatNumComma(basisBdt)} / ${daysBasisCount} × ${attendance.unpaidLeaveDays} = ${formatNumComma(
        ulBdt
      )} (${basisLabel}, ${daysLabel}; ${attendance.paidLeaveDays} paid leave exempt)`,
    });
  }

  if (advancePaisa > 0) {
    const advBdt = fromPaisa(advancePaisa, roundingMode);
    totalDeductionsBdt += advBdt;
    lines.push({
      name: 'Advance Deduction',
      code: 'ADVANCE',
      category: 'DEDUCTION',
      sequence: 112,
      amount: advBdt,
      source: 'monthly_input',
      calculation_note: `Monthly advance recovery: ${formatNumComma(advBdt)}`,
    });
  }

  if (finePaisa > 0) {
    const fBdt = fromPaisa(finePaisa, roundingMode);
    totalDeductionsBdt += fBdt;
    lines.push({
      name: 'Fine / Penalty',
      code: 'FINE',
      category: 'DEDUCTION',
      sequence: 115,
      amount: fBdt,
      source: 'monthly_input',
      calculation_note: `Monthly fine / penalty: ${formatNumComma(fBdt)}`,
    });
  }

  if (negativeAdjustmentPaisa > 0) {
    const negBdt = fromPaisa(negativeAdjustmentPaisa, roundingMode);
    totalDeductionsBdt += negBdt;
    lines.push({
      name: 'Other Adjustment (-)',
      code: 'ADJ_MINUS',
      category: 'DEDUCTION',
      sequence: 118,
      amount: negBdt,
      source: 'monthly_input',
      calculation_note: `Negative monthly adjustment: ${formatNumComma(negBdt)}`,
    });
  }

  totalDeductionsBdt = Math.round(totalDeductionsBdt * 100) / 100;
  const netPayBdt = Math.round((grossPayBdt - totalDeductionsBdt) * 100) / 100;
  lines.push({
    name: 'Net Payable',
    code: 'NET',
    category: 'NET',
    sequence: 130,
    amount: netPayBdt,
    source: 'formula',
    calculation_note: 'Gross - Absence - Half day - Late - Unpaid Leave - Advances - Fines',
  });

  return {
    settings_version: settings.version || 1,
    days_basis: settings.days_basis || 'fixed_30',
    days_in_month: daysBasisCount,
    calendar_days_in_month: calendarDays,
    prorated_days: proratedDays,
    is_prorated: isProrated,
    per_day_rate: dailyRateBdt,
    overtime_multiplier: overtimeMultiplier,
    attendance_summary: {
      presentDays: attendance.presentDays,
      absentDays: absentTotalDays,
      lateDays: qualifyingLateDays,
      latePenaltyDays,
      halfDays: halfDaysCount,
      paidLeaveDays: attendance.paidLeaveDays,
      unpaidLeaveDays: attendance.unpaidLeaveDays,
    },
    inputs_snapshot: {
      bonus: fromPaisa(totalBonusPaisa, roundingMode),
      bonus_type: bonusType,
      bonus_festival: fromPaisa(bonusFestivalPaisa, roundingMode),
      bonus_performance: fromPaisa(bonusPerformancePaisa, roundingMode),
      bonus_other: fromPaisa(bonusOtherPaisa, roundingMode),
      overtime_hours: totalOtHours,
      overtime_rate: fromPaisa(hourlyRatePaisa, roundingMode),
      loan_installment: fromPaisa(advancePaisa, roundingMode),
      advance_deduction: fromPaisa(advancePaisa, roundingMode),
      fine: fromPaisa(finePaisa, roundingMode),
      other_adjustment: fromPaisa(otherAdjustmentPaisa, roundingMode),
      manual_deduction: fromPaisa(finePaisa, roundingMode),
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

