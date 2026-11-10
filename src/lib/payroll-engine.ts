import { Employee } from '@/models/Employee';
import { EmployeeContract } from '@/models/EmployeeContract';
import { SalaryStructure } from '@/models/SalaryStructure';
import { SalaryRule, ISalaryRule } from '@/models/SalaryRule';
import { Attendance } from '@/models/Attendance';
import { Leave } from '@/models/Leave';
import { PayrollInput } from '@/models/PayrollInput';
import { Payslip, IPayslipLine } from '@/models/Payslip';
import { getNextSequence } from '@/models/Counter';

export interface PayrollFormulaContext {
  BASIC: number;
  ALLOWANCES: number;
  GROSS: number;
  DEDUCTIONS: number;
  NET: number;
  PRESENT_DAYS: number;
  ABSENT_DAYS: number;
  LATE_DAYS: number;
  HALF_DAYS: number;
  PAID_LEAVE_DAYS: number;
  UNPAID_LEAVE_DAYS: number;
  BONUS: number;
  OVERTIME_HOURS: number;
  OVERTIME_RATE: number;
  LOAN_INSTALLMENT: number;
  MANUAL_DEDUCTION: number;
  [key: string]: number;
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

export async function computeEmployeePayslipData({
  employeeId,
  month,
  year,
}: {
  employeeId: string;
  month: number;
  year: number;
}) {
  const employee = await Employee.findById(employeeId).lean();
  if (!employee) {
    throw new Error('Employee not found');
  }

  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  // Find Active Contract covering the target month
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

  // Attendance records for the month
  const attendanceDocs = await Attendance.find({
    employee_id: employeeId,
    date: { $gte: monthStart, $lte: monthEnd },
  }).lean();

  let presentDays = 0;
  let absentDays = 0;
  let lateDays = 0;
  let halfDays = 0;
  for (const a of attendanceDocs) {
    if (a.status === 'Present') presentDays++;
    else if (a.status === 'Late') lateDays++;
    else if (a.status === 'Half-Day') halfDays++;
    else if (a.status === 'Absent') absentDays++;
  }

  // Approved leaves overlapping the month
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
    if (lv.leave_type === 'Unpaid') {
      unpaidLeaveDays += days;
    } else {
      paidLeaveDays += days;
    }
  }

  // Monthly variable inputs
  const inputDoc = await PayrollInput.findOne({
    employee_id: employeeId,
    month,
    year,
  }).lean();

  const inputsSnapshot = {
    bonus: Math.max(0, Math.round(inputDoc?.bonus || 0)),
    overtime_hours: Math.max(0, Number(inputDoc?.overtime_hours || 0)),
    overtime_rate: Math.max(0, Math.round(inputDoc?.overtime_rate || 0)),
    loan_installment: Math.max(0, Math.round(inputDoc?.loan_installment || 0)),
    manual_deduction: Math.max(0, Math.round(inputDoc?.manual_deduction || 0)),
  };

  const contractBasic = Math.max(0, Math.round(contract.basic_salary || 0));

  const ctx: PayrollFormulaContext = {
    BASIC: contractBasic,
    ALLOWANCES: 0,
    GROSS: contractBasic,
    DEDUCTIONS: 0,
    NET: 0,
    PRESENT_DAYS: presentDays,
    ABSENT_DAYS: absentDays,
    LATE_DAYS: lateDays,
    HALF_DAYS: halfDays,
    PAID_LEAVE_DAYS: paidLeaveDays,
    UNPAID_LEAVE_DAYS: unpaidLeaveDays,
    BONUS: inputsSnapshot.bonus,
    OVERTIME_HOURS: inputsSnapshot.overtime_hours,
    OVERTIME_RATE: inputsSnapshot.overtime_rate,
    LOAN_INSTALLMENT: inputsSnapshot.loan_installment,
    MANUAL_DEDUCTION: inputsSnapshot.manual_deduction,
  };

  let basicPay = 0;
  let totalAllowances = 0;
  let totalDeductions = 0;
  const lines: IPayslipLine[] = [];

  for (const rule of rules) {
    let amount = 0;

    if (rule.type === 'fixed') {
      amount = rule.amount_or_percentage || 0;
    } else if (rule.type === 'percentage_of_basic') {
      amount = (contractBasic * (rule.amount_or_percentage || 0)) / 100;
    } else if (rule.type === 'formula') {
      amount = evaluatePayrollFormula(rule.formula || '0', ctx);
    }

    const rounded = Math.max(0, Math.round(amount));

    // Store rule code into context so subsequent formulas can reference earlier codes (e.g. HRA)
    ctx[rule.code.toUpperCase()] = rounded;

    if (rule.category === 'BASIC') {
      basicPay += rounded;
      ctx.BASIC = basicPay;
      ctx.GROSS = basicPay + totalAllowances;
    } else if (rule.category === 'ALLOWANCE') {
      totalAllowances += rounded;
      ctx.ALLOWANCES = totalAllowances;
      ctx.GROSS = basicPay + totalAllowances;
    } else if (rule.category === 'GROSS') {
      const grossVal = basicPay + totalAllowances;
      ctx.GROSS = grossVal;
      lines.push({
        rule_id: rule._id,
        name: rule.name,
        code: rule.code,
        category: rule.category,
        sequence: rule.sequence,
        amount: grossVal,
      });
      continue;
    } else if (rule.category === 'DEDUCTION') {
      totalDeductions += rounded;
      ctx.DEDUCTIONS = totalDeductions;
    } else if (rule.category === 'NET') {
      const netVal = Math.max(0, basicPay + totalAllowances - totalDeductions);
      ctx.NET = netVal;
      lines.push({
        rule_id: rule._id,
        name: rule.name,
        code: rule.code,
        category: rule.category,
        sequence: rule.sequence,
        amount: netVal,
      });
      continue;
    }

    lines.push({
      rule_id: rule._id,
      name: rule.name,
      code: rule.code,
      category: rule.category,
      sequence: rule.sequence,
      amount: rounded,
    });
  }

  // Fallback if structure had no explicit BASIC rule line
  if (basicPay === 0 && !rules.some((r) => r.category === 'BASIC')) {
    basicPay = contractBasic;
  }

  const grossPay = basicPay + totalAllowances;
  const netPay = Math.max(0, grossPay - totalDeductions);

  return {
    employee,
    contract,
    structure,
    attendance_summary: {
      presentDays,
      absentDays,
      lateDays,
      halfDays,
      paidLeaveDays,
      unpaidLeaveDays,
    },
    inputs_snapshot: inputsSnapshot,
    lines,
    basic_pay: basicPay,
    total_allowances: totalAllowances,
    gross_pay: grossPay,
    total_deductions: totalDeductions,
    net_pay: netPay,
  };
}

export async function assertNoDuplicatePayslip(employeeId: string, month: number, year: number) {
  const existing = await Payslip.findOne({
    employee_id: employeeId,
    month,
    year,
    status: { $ne: 'Cancelled' },
  }).lean();
  if (existing) {
    throw new Error(
      `Payslip ${existing.payslip_no} already exists for this employee in ${month}/${year} (Status: ${existing.status}).`
    );
  }
}

