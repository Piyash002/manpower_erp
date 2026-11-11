import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        const val = (match[2] || '').trim().replace(/^['"](.*)['"]$/, '$1');
        process.env[key] = val;
      }
    });
  }
} catch {
  // ignore
}

import { connectDB } from '../src/lib/db';
import { Employee } from '../src/models/Employee';
import { EmployeeContract } from '../src/models/EmployeeContract';
import { SalaryStructure } from '../src/models/SalaryStructure';
import { SalaryRule } from '../src/models/SalaryRule';
import { DailyAttendance } from '../src/models/DailyAttendance';
import { Leave } from '../src/models/Leave';
import { PayrollInput } from '../src/models/PayrollInput';
import { Payslip } from '../src/models/Payslip';
import { PayslipBatch } from '../src/models/PayslipBatch';
import {
  DEFAULT_PAYROLL_SETTINGS_VALUES,
  PayrollSettings,
} from '../src/models/PayrollSettings';
import { ensureDepartmentsAndDesignationsSeeded } from '../src/lib/hrm-seed';

async function seedDemo() {
  console.log('Seeding 5-employee Payroll Settings verification dataset (Basic 20,000 / Gross 30,000)...');
  await connectDB();
  await ensureDepartmentsAndDesignationsSeeded();

  // Ensure default PayrollSettings v1 exists (Gross basis, Fixed 30, Grace 10m, 3 lates = 1d, Paid leaves exempt)
  const settingsCount = await PayrollSettings.countDocuments();
  if (settingsCount === 0) {
    await PayrollSettings.create({
      ...DEFAULT_PAYROLL_SETTINGS_VALUES,
      notes: 'Seeded default payroll settings v1',
      updated_by: 'Demo Seed',
    });
  }

  // Create/reuse clean DEMO-30K structure: Basic 20,000 + HRA 40% (8,000) + Medical 2,000 = Gross 30,000
  const structure = await SalaryStructure.findOneAndUpdate(
    { code: 'DEMO-30K' },
    {
      $set: {
        name: 'Standard 30K Package (Demo)',
        description: 'Basic 20,000 + HRA 40% (8,000) + Medical Fixed (2,000) = Gross 30,000',
        active: true,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );

  const demoRules = [
    { name: 'Basic Salary', code: 'BASIC', category: 'BASIC', type: 'percentage_of_basic', amount_or_percentage: 100, sequence: 10, active: true },
    { name: 'House Rent Allowance', code: 'HRA', category: 'ALLOWANCE', type: 'percentage_of_basic', amount_or_percentage: 40, sequence: 20, active: true },
    { name: 'Medical Allowance', code: 'MED', category: 'ALLOWANCE', type: 'fixed', amount_or_percentage: 2000, sequence: 30, active: true },
  ];
  for (const r of demoRules) {
    await SalaryRule.updateOne(
      { structure_id: structure._id, code: r.code },
      { $set: { ...r, formula: '' } },
      { upsert: true }
    );
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const day11Date = new Date(Date.UTC(year, month - 1, 11, 0, 0, 0, 0));

  // Clear existing Draft/Verified run for current month so fresh generation works cleanly
  await PayslipBatch.deleteMany({
    month,
    year,
    branch: 'Main',
    status: { $in: ['Draft', 'Verified'] },
  });

  const demoSpecs = [
    {
      employee_id: 'DEMO-101',
      firstName: 'Tariqul',
      lastName: 'Islam (1 Absent)',
      phone: '01811000101',
      department: 'Visa',
      designation: 'Visa Officer',
      basic_salary: 20000,
      payment_method: 'Bank' as const,
      bank_name: 'Dutch-Bangla Bank',
      bank_branch: 'Banani',
      bank_account_no: '115.101.004422',
      joining_date: new Date(Date.UTC(year - 1, 0, 1)),
      caseKind: 'absent' as const,
    },
    {
      employee_id: 'DEMO-102',
      firstName: 'Farhana',
      lastName: 'Akter (1 Half-Day)',
      phone: '01811000102',
      department: 'Counseling',
      designation: 'Counselor',
      basic_salary: 20000,
      payment_method: 'bKash' as const,
      bank_name: 'bKash',
      bank_branch: '',
      bank_account_no: '01711223344',
      joining_date: new Date(Date.UTC(year - 1, 0, 1)),
      caseKind: 'half_day' as const,
    },
    {
      employee_id: 'DEMO-103',
      firstName: 'Rakibul',
      lastName: 'Hasan (3 Late Days)',
      phone: '01811000103',
      department: 'Training',
      designation: 'Technical Instructor',
      basic_salary: 20000,
      payment_method: 'Nagad' as const,
      bank_name: 'Nagad',
      bank_branch: '',
      bank_account_no: '01911556677',
      joining_date: new Date(Date.UTC(year - 1, 0, 1)),
      caseKind: 'three_late' as const,
    },
    {
      employee_id: 'DEMO-104',
      firstName: 'Mizanur',
      lastName: 'Rahman (Paid Leave)',
      phone: '01811000104',
      department: 'Accounts',
      designation: 'Accounts Executive',
      basic_salary: 20000,
      payment_method: 'Cash' as const,
      bank_name: '',
      bank_branch: '',
      bank_account_no: '',
      joining_date: new Date(Date.UTC(year - 1, 0, 1)),
      caseKind: 'paid_leave' as const,
    },
    {
      employee_id: 'DEMO-105',
      firstName: 'Nabila',
      lastName: 'Sultana (Day-11 Joiner)',
      phone: '01811000105',
      department: 'Administration',
      designation: 'HR Coordinator',
      basic_salary: 20000,
      payment_method: 'Bank' as const,
      bank_name: 'BRAC Bank',
      bank_branch: 'Gulshan',
      bank_account_no: '1501204455001',
      joining_date: day11Date, // Prorated to 20 days on Fixed 30!
      caseKind: 'day11_joiner' as const,
    },
  ];

  for (const spec of demoSpecs) {
    const emp = await Employee.findOneAndUpdate(
      { employee_id: spec.employee_id },
      {
        $set: {
          firstName: spec.firstName,
          lastName: spec.lastName,
          phone: spec.phone,
          department: spec.department,
          branch: 'Main',
          designation: spec.designation,
          basic_salary: spec.basic_salary,
          payment_method: spec.payment_method,
          bank_name: spec.bank_name,
          bank_branch: spec.bank_branch,
          bank_account_no: spec.bank_account_no,
          joining_date: spec.joining_date,
          status: 'Active',
          is_deleted: false,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    await Payslip.deleteMany({ employee_id: emp._id, month, year });
    await PayrollInput.deleteMany({ employee_id: emp._id, month, year });
    await Leave.deleteMany({
      employee_id: emp._id,
      start_date: { $gte: monthStart, $lte: monthEnd },
    });
    await DailyAttendance.deleteMany({
      employee_id: emp._id,
      date: { $gte: monthStart, $lte: monthEnd },
    });

    await EmployeeContract.updateOne(
      { employee_id: emp._id, status: 'Active' },
      {
        $set: {
          structure_id: structure._id,
          basic_salary: spec.basic_salary,
          start_date: spec.joining_date,
          status: 'Active',
          bank_name: spec.bank_name,
          bank_account_no: spec.bank_account_no,
        },
      },
      { upsert: true }
    );

    if (spec.caseKind === 'absent') {
      await DailyAttendance.insertMany([
        { employee_id: emp._id, date: new Date(Date.UTC(year, month - 1, 1)), status: 'Absent', source: 'Manual', worked_hours: 0 },
        { employee_id: emp._id, date: new Date(Date.UTC(year, month - 1, 2)), status: 'Present', source: 'Manual', worked_hours: 8 },
      ]);
    } else if (spec.caseKind === 'half_day') {
      await DailyAttendance.insertMany([
        { employee_id: emp._id, date: new Date(Date.UTC(year, month - 1, 1)), status: 'Half-day', source: 'Manual', worked_hours: 3 },
        { employee_id: emp._id, date: new Date(Date.UTC(year, month - 1, 2)), status: 'Present', source: 'Manual', worked_hours: 8 },
      ]);
    } else if (spec.caseKind === 'three_late') {
      await DailyAttendance.insertMany([
        { employee_id: emp._id, date: new Date(Date.UTC(year, month - 1, 1)), status: 'Late', late_minutes: 20, source: 'Biometric', worked_hours: 8 },
        { employee_id: emp._id, date: new Date(Date.UTC(year, month - 1, 2)), status: 'Late', late_minutes: 25, source: 'Biometric', worked_hours: 8 },
        { employee_id: emp._id, date: new Date(Date.UTC(year, month - 1, 3)), status: 'Late', late_minutes: 30, source: 'Biometric', worked_hours: 8 },
      ]);
    } else if (spec.caseKind === 'paid_leave') {
      const lv = await Leave.create({
        employee_id: emp._id,
        leave_type: 'Casual',
        is_paid: true,
        start_date: new Date(Date.UTC(year, month - 1, 2)),
        end_date: new Date(Date.UTC(year, month - 1, 2)),
        reason: 'Paid casual leave verification case',
        status: 'Approved',
      });
      await DailyAttendance.insertMany([
        { employee_id: emp._id, date: new Date(Date.UTC(year, month - 1, 1)), status: 'Present', source: 'Manual', worked_hours: 8 },
        { employee_id: emp._id, date: new Date(Date.UTC(year, month - 1, 2)), status: 'Leave', leave_id: lv._id, leave_is_paid: true, source: 'Manual', worked_hours: 0 },
      ]);
    } else if (spec.caseKind === 'day11_joiner') {
      await DailyAttendance.insertMany([
        { employee_id: emp._id, date: day11Date, status: 'Present', source: 'Manual', worked_hours: 8 },
      ]);
    }
  }

  console.log(`Seeded 5 hand-verifiable cases for ${month}/${year} (Main):`);
  console.log('  - DEMO-101: 1 Absent day      -> Net = 29,000 (Cut: 1,000)');
  console.log('  - DEMO-102: 1 Half day        -> Net = 29,500 (Cut: 500)');
  console.log('  - DEMO-103: 3 Late days       -> Net = 29,000 (Cut: 1,000)');
  console.log('  - DEMO-104: 1 Paid Leave day  -> Net = 30,000 (Cut: 0)');
  console.log('  - DEMO-105: Joiner Day 11     -> Net = 20,000 (Prorated 20/30)');
  await mongoose.disconnect();
}

seedDemo().catch((err) => {
  console.error('Demo seed failed:', err);
  process.exit(1);
});
