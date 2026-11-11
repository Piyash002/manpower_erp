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
import { DailyAttendance } from '../src/models/DailyAttendance';
import { Leave } from '../src/models/Leave';
import { PayrollInput } from '../src/models/PayrollInput';
import { Payslip } from '../src/models/Payslip';
import { PayslipBatch } from '../src/models/PayslipBatch';
import { ensurePayrollSeeded } from '../src/lib/payroll-seed';
import { ensureDepartmentsAndDesignationsSeeded } from '../src/lib/hrm-seed';

async function seedDemo() {
  console.log('Seeding 5-employee Payroll Run demo dataset...');
  await connectDB();
  await ensureDepartmentsAndDesignationsSeeded();
  await ensurePayrollSeeded();

  const structure =
    (await SalaryStructure.findOne({ code: 'REG-EMP', active: true })) ||
    (await SalaryStructure.findOne({ active: true }));
  if (!structure) {
    throw new Error('No active SalaryStructure found.');
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const midMonthDate = new Date(Date.UTC(year, month - 1, 16, 0, 0, 0, 0));
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  // Remove any active Draft/Verified run for current month so user can test fresh Generate!
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
      lastName: 'Islam',
      phone: '01811000101',
      department: 'Visa',
      designation: 'Visa Officer',
      basic_salary: 25000,
      payment_method: 'Bank' as const,
      bank_name: 'Dutch-Bangla Bank',
      bank_branch: 'Banani',
      bank_account_no: '115.101.004422',
      joining_date: new Date(Date.UTC(year - 1, 0, 1)),
      hasContract: true,
    },
    {
      employee_id: 'DEMO-102',
      firstName: 'Farhana',
      lastName: 'Akter',
      phone: '01811000102',
      department: 'Counseling',
      designation: 'Counselor',
      basic_salary: 20000,
      payment_method: 'bKash' as const,
      bank_name: 'bKash',
      bank_branch: '',
      bank_account_no: '01711223344',
      joining_date: midMonthDate, // Mid-month joiner (prorated!)
      hasContract: true,
    },
    {
      employee_id: 'DEMO-103',
      firstName: 'Rakibul',
      lastName: 'Hasan',
      phone: '01811000103',
      department: 'Training',
      designation: 'Technical Instructor',
      basic_salary: 22000,
      payment_method: 'Nagad' as const,
      bank_name: 'Nagad',
      bank_branch: '',
      bank_account_no: '', // Triggers MISSING_PAYMENT_DETAILS + HIGH_OVERTIME (>40h)
      joining_date: new Date(Date.UTC(year - 1, 2, 1)),
      hasContract: true,
    },
    {
      employee_id: 'DEMO-104',
      firstName: 'Mizanur',
      lastName: 'Rahman',
      phone: '01811000104',
      department: 'Accounts',
      designation: 'Accounts Executive',
      basic_salary: 12000,
      payment_method: 'Cash' as const,
      bank_name: '',
      bank_branch: '',
      bank_account_no: '', // Net goes negative with advance+absent -> triggers NET_ZERO_OR_NEGATIVE
      joining_date: new Date(Date.UTC(year - 1, 5, 1)),
      hasContract: true,
    },
    {
      employee_id: 'DEMO-105',
      firstName: 'Nabila',
      lastName: 'Sultana',
      phone: '01811000105',
      department: 'Administration',
      designation: 'HR Coordinator',
      basic_salary: 18000,
      payment_method: 'Bank' as const,
      bank_name: 'BRAC Bank',
      bank_branch: 'Gulshan',
      bank_account_no: '1501204455001',
      joining_date: new Date(Date.UTC(year, 0, 1)),
      hasContract: false, // Intentionally skipped ("no_contract")
    },
  ];

  const createdEmps: any[] = [];
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
    createdEmps.push({ spec, emp });

    // Clean current-month Payslip for demo employee so Generate Payroll Run always succeeds fresh
    await Payslip.deleteMany({ employee_id: emp._id, month, year });

    if (spec.hasContract) {
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
    } else {
      await EmployeeContract.deleteMany({ employee_id: emp._id });
    }
  }

  // Attendance & Leave & Inputs for the 4 contracted employees
  for (const { spec, emp } of createdEmps) {
    if (!spec.hasContract) continue;

    await DailyAttendance.deleteMany({
      employee_id: emp._id,
      date: { $gte: monthStart, $lte: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)) },
    });

    const attRecords: any[] = [];
    if (spec.employee_id === 'DEMO-101') {
      for (let d = 1; d <= 5; d++) {
        attRecords.push({
          employee_id: emp._id,
          date: new Date(Date.UTC(year, month - 1, d)),
          status: 'Present',
          source: 'Manual',
          worked_hours: 8,
          overtime_hours: 0,
        });
      }
    } else if (spec.employee_id === 'DEMO-102') {
      // Mid-month joiner + 2 Paid Casual Leave days (not deducted!)
      attRecords.push(
        { employee_id: emp._id, date: new Date(Date.UTC(year, month - 1, 16)), status: 'Present', source: 'Manual', worked_hours: 8 },
        { employee_id: emp._id, date: new Date(Date.UTC(year, month - 1, 17)), status: 'Leave', leave_is_paid: true, source: 'Manual', worked_hours: 0 },
        { employee_id: emp._id, date: new Date(Date.UTC(year, month - 1, 18)), status: 'Leave', leave_is_paid: true, source: 'Manual', worked_hours: 0 }
      );
      await Leave.updateOne(
        { employee_id: emp._id, start_date: new Date(Date.UTC(year, month - 1, 17)) },
        {
          $set: {
            leave_type: 'Casual',
            is_paid: true,
            end_date: new Date(Date.UTC(year, month - 1, 18)),
            reason: 'Demo paid casual leave',
            status: 'Approved',
          },
        },
        { upsert: true }
      );
    } else if (spec.employee_id === 'DEMO-103') {
      for (let d = 1; d <= 5; d++) {
        attRecords.push({
          employee_id: emp._id,
          date: new Date(Date.UTC(year, month - 1, d)),
          status: 'Present',
          source: 'Biometric',
          worked_hours: 8,
        });
      }
    } else if (spec.employee_id === 'DEMO-104') {
      // 8 Absent days + 25,000 advance -> negative/zero net!
      for (let d = 1; d <= 8; d++) {
        attRecords.push({
          employee_id: emp._id,
          date: new Date(Date.UTC(year, month - 1, d)),
          status: 'Absent',
          source: 'Manual',
          worked_hours: 0,
        });
      }
    }
    if (attRecords.length > 0) {
      await DailyAttendance.insertMany(attRecords);
    }
  }

  const emp101 = createdEmps[0].emp;
  const emp103 = createdEmps[2].emp;
  const emp104 = createdEmps[3].emp;

  // Monthly inputs for warnings & calculations
  await PayrollInput.updateOne(
    { employee_id: emp101._id, month, year },
    {
      $set: {
        bonus_type: 'festival',
        bonus_festival: 18000, // pushes net >30% over prior month 25,000!
        bonus: 18000,
        overtime_hours: 8,
        overtime_rate: 0,
        advance_deduction: 0,
        fine: 0,
        other_adjustment: 0,
        notes: 'Demo festival bonus + 8h OT',
      },
    },
    { upsert: true }
  );

  await PayrollInput.updateOne(
    { employee_id: emp103._id, month, year },
    {
      $set: {
        bonus_type: 'performance',
        bonus_performance: 2000,
        bonus: 2000,
        overtime_hours: 45, // triggers HIGH_OVERTIME (>40h)
        overtime_rate: 120,
        advance_deduction: 0,
        fine: 500,
        other_adjustment: 0,
        notes: 'Demo 45h OT (triggers high overtime warning)',
      },
    },
    { upsert: true }
  );

  await PayrollInput.updateOne(
    { employee_id: emp104._id, month, year },
    {
      $set: {
        bonus_type: 'other',
        bonus_other: 0,
        bonus: 0,
        overtime_hours: 0,
        advance_deduction: 25000, // triggers NET_ZERO_OR_NEGATIVE
        loan_installment: 25000,
        fine: 1000,
        manual_deduction: 1000,
        other_adjustment: 0,
        notes: 'Demo heavy advance recovery',
      },
    },
    { upsert: true }
  );

  // Seed a prior-month Paid Payslip for DEMO-101 (net 28,000) to exercise >30% swing + % delta cards
  const contract101 = await EmployeeContract.findOne({ employee_id: emp101._id, status: 'Active' }).lean();
  if (contract101) {
    await Payslip.updateOne(
      { payslip_no: `PAY-${prevYear}${String(prevMonth).padStart(2, '0')}-9101` },
      {
        $set: {
          employee_id: emp101._id,
          contract_id: contract101._id,
          structure_id: structure._id,
          month: prevMonth,
          year: prevYear,
          branch: 'Main',
          basic_pay: 25000,
          total_allowances: 3000,
          gross_pay: 28000,
          total_deductions: 0,
          net_pay: 28000,
          status: 'Paid',
          payment_method: 'Bank',
          paid_at: new Date(),
        },
      },
      { upsert: true }
    );
  }

  console.log(`Seeded 5 demo employees (DEMO-101..DEMO-105) for ${month}/${year} (Main branch).`);
  await mongoose.disconnect();
}

seedDemo().catch((err) => {
  console.error('Demo seed failed:', err);
  process.exit(1);
});

