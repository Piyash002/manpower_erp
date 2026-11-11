import { connectDB } from '@/lib/db';
import { SalaryStructure } from '@/models/SalaryStructure';
import { SalaryRule, SalaryRuleCategory, SalaryRuleType } from '@/models/SalaryRule';
import { Employee } from '@/models/Employee';
import { EmployeeContract } from '@/models/EmployeeContract';
import { PayrollInput } from '@/models/PayrollInput';
import {
  DEFAULT_PAYROLL_SETTINGS_VALUES,
  PayrollSettings,
} from '@/models/PayrollSettings';

export interface DefaultRuleSeed {
  name: string;
  code: string;
  category: SalaryRuleCategory;
  type: SalaryRuleType;
  amount_or_percentage: number;
  formula: string;
  sequence: number;
  active?: boolean;
}

export const DEFAULT_REGULAR_RULES: DefaultRuleSeed[] = [
  {
    name: 'Basic Salary',
    code: 'BASIC',
    category: 'BASIC',
    type: 'percentage_of_basic',
    amount_or_percentage: 100,
    formula: '',
    sequence: 10,
  },
  {
    name: 'House Rent Allowance',
    code: 'HRA',
    category: 'ALLOWANCE',
    type: 'percentage_of_basic',
    amount_or_percentage: 50,
    formula: '',
    sequence: 20,
  },
  {
    name: 'Medical Allowance',
    code: 'MED',
    category: 'ALLOWANCE',
    type: 'percentage_of_basic',
    amount_or_percentage: 10,
    formula: '',
    sequence: 30,
  },
  {
    name: 'Conveyance Allowance',
    code: 'CONV',
    category: 'ALLOWANCE',
    type: 'fixed',
    amount_or_percentage: 2000,
    formula: '',
    sequence: 40,
  },
];

let seededStructuresOnce = false;

export async function seedDefaultRulesForStructure(structureId: any) {
  for (const r of DEFAULT_REGULAR_RULES) {
    await SalaryRule.updateOne(
      { structure_id: structureId, code: r.code },
      {
        $setOnInsert: {
          structure_id: structureId,
          name: r.name,
          code: r.code,
          category: r.category,
          type: r.type,
          amount_or_percentage: r.amount_or_percentage,
          formula: r.formula,
          sequence: r.sequence,
          active: r.active !== undefined ? r.active : true,
        },
      },
      { upsert: true }
    );
  }
}

export async function ensureDefaultPayrollSettings() {
  await connectDB();
  const count = await PayrollSettings.countDocuments();
  if (count === 0) {
    await PayrollSettings.create({
      ...DEFAULT_PAYROLL_SETTINGS_VALUES,
      notes: 'Default payroll settings created automatically on first use.',
      updated_by: 'System',
    });
  }
}

export async function ensurePayrollSeeded() {
  if (seededStructuresOnce) return;
  await connectDB();
  await ensureDefaultPayrollSettings();

  let regular = await SalaryStructure.findOne({ code: 'REG-EMP' });
  if (!regular) {
    const count = await SalaryStructure.countDocuments();
    if (count === 0) {
      regular = await SalaryStructure.create({
        name: 'Regular Employee',
        code: 'REG-EMP',
        description:
          'Standard monthly salary structure with Basic Salary, House Rent, Medical & Conveyance allowances. Attendance, leave, and overtime deductions are governed by versioned Payroll Settings.',
        active: true,
      });
    }
  }

  if (regular) {
    const ruleCount = await SalaryRule.countDocuments({ structure_id: regular._id });
    if (ruleCount === 0) {
      await seedDefaultRulesForStructure(regular._id);
    }
  }

  seededStructuresOnce = true;
}

export async function seedSamplePayrollData() {
  await connectDB();
  seededStructuresOnce = false;
  await ensurePayrollSeeded();

  const regular = await SalaryStructure.findOne({ code: 'REG-EMP' });
  if (!regular) return { structureCreated: false, contractsCreated: 0 };

  const activeEmployees = await Employee.find({ status: 'Active' });
  let contractsCreated = 0;

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  for (const emp of activeEmployees) {
    const existingContract = await EmployeeContract.findOne({
      employee_id: emp._id,
      status: 'Active',
    });
    if (!existingContract) {
      await EmployeeContract.create({
        employee_id: emp._id,
        structure_id: regular._id,
        basic_salary: emp.basic_salary > 0 ? emp.basic_salary : 20000,
        start_date: emp.joining_date || startOfMonth,
        status: 'Active',
        notes: 'Seeded default Regular Employee salary contract',
      });
      contractsCreated++;
    }
  }

  if (activeEmployees.length > 0) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const first = activeEmployees[0];
    const hasInput = await PayrollInput.findOne({ employee_id: first._id, month, year });
    if (!hasInput) {
      await PayrollInput.create({
        employee_id: first._id,
        month,
        year,
        bonus: 2000,
        bonus_type: 'festival',
        bonus_festival: 2000,
        overtime_hours: 4,
        overtime_rate: 0,
        loan_installment: 0,
        advance_deduction: 0,
        fine: 0,
        other_adjustment: 0,
        manual_deduction: 0,
        notes: 'Sample monthly variable input',
        updated_by: 'System Seed',
      });
    }
  }

  return { structureCreated: true, contractsCreated };
}
