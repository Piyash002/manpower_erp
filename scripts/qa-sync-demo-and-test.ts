import fs from 'fs';
import path from 'path';

for (const fname of ['.env', '.env.local']) {
  const envPath = path.resolve(process.cwd(), fname);
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8')
      .split('\n')
      .forEach((line) => {
        const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (m) process.env[m[1]] = (m[2] || '').trim().replace(/^['"](.*)['"]$/, '$1');
      });
  }
}

import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db';
import { ensureAccountsSeeded, ensureFiscalYearWithPeriods } from '../src/lib/accounts-seed';
import { ensurePayrollSeeded } from '../src/lib/payroll-seed';
import {
  collectStudentReceipt,
  createFeeRefundRequest,
  createFeeTemplateRecord,
  createStudentFeePlanOnAdmission,
  getStudentFeeStatement,
  processFeeRefundApproval,
  processStudentDiscountApproval,
  reverseMoneyReceipt,
} from '../src/lib/accounts/fees';
import {
  disbursePayrollRun,
  postPayrollConfirmAccrual,
  reversePayrollConfirmAccrual,
} from '../src/lib/accounts/payroll';
import { getSystemAccountId } from '../src/lib/accounts/posting';
import { onPayrollRunConfirmed, generateNextPayslipNo } from '../src/lib/payroll-engine';
import { FeeTemplate } from '../src/models/FeeTemplate';
import { StudentFeePlan } from '../src/models/StudentFeePlan';
import { MoneyReceipt } from '../src/models/MoneyReceipt';
import { FeeRefund } from '../src/models/FeeRefund';
import { JournalEntry } from '../src/models/JournalEntry';
import { JournalLine } from '../src/models/JournalLine';
import { Student } from '../src/models/Student';
import { Trade } from '../src/models/Trade';
import { Batch } from '../src/models/Batch';
import { BatchAssessment } from '../src/models/BatchAssessment';
import { Employee } from '../src/models/Employee';
import { EmployeeContract } from '../src/models/EmployeeContract';
import { SalaryStructure } from '../src/models/SalaryStructure';
import { PayslipBatch } from '../src/models/PayslipBatch';
import { Payslip } from '../src/models/Payslip';
import { AccountingPeriod } from '../src/models/AccountingPeriod';
import { FiscalYear } from '../src/models/FiscalYear';
import { VoucherSequence } from '../src/models/VoucherSequence';
import { paisaToTaka } from '../src/lib/accounts-money';

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string, detail?: string) {
  if (cond) {
    console.log(`✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function seedLiveDemoData() {
  console.log('--- 1. SEEDING / ENSURING LIVE DEMO DATA (FY2026) ---');
  await ensureFiscalYearWithPeriods(2026, 'DemoSeeder');
  // Ensure Sep, Oct, Nov 2026 are Open so demo transactions & user UI testing work smoothly
  await AccountingPeriod.updateMany(
    { year: 2026, month: { $in: [9, 10, 11] } },
    { $set: { status: 'Open' } }
  );

  const adminUser = { userId: 'demo-admin', name: 'System Administrator', username: 'admin', role: 'Admin' };
  const acctUser = { userId: 'demo-acct', name: 'Demo Accountant', username: 'accountant', role: 'Accountant' };

  const trade = await Trade.findOne({ active: true }).lean();
  const realBatch = trade ? await Batch.findOne({ trade_id: trade._id }).sort({ start_date: 1 }).lean() : null;
  const demoBatchCode = realBatch?.batch_code || 'B-2026-01';
  const structure = await SalaryStructure.findOne({}).lean();
  let tpl1 = await FeeTemplate.findOne({ isDeleted: { $ne: true }, active: true })
    .sort({ totalAmountPaisa: -1 })
    .lean();
  if (!tpl1) {
    tpl1 = (
      await createFeeTemplateRecord({
        code: 'TPL-DEMO-GEN',
        name: 'General Overseas Training & Visa Package',
        tradeId: trade?._id?.toString() || null,
        tradeName: trade?.name || 'General',
        country: 'Saudi Arabia',
        stages: [
          { stageOrder: 1, stageCode: 'BOOKING', label: 'Admission & Booking Fee', amountPaisa: 1500000, dueOffsetDays: 0 },
          { stageOrder: 2, stageCode: 'MEDICAL_TRAINING', label: 'Training & Medical Fee', amountPaisa: 3500000, dueOffsetDays: 15 },
          { stageOrder: 3, stageCode: 'VISA_PROCESSING', label: 'Visa & Emigration Clearance', amountPaisa: 10500000, dueOffsetDays: 30 },
        ],
        createdBy: 'DemoSeeder',
      })
    ).toObject();
  }

  // Demo Student 1: Admitted with FeeTemplate, Approved Discount (5k), Cash Receipt (50k)
  let demoSt1 = await Student.findOne({ student_no: 'ST-2026-DEMO01' });
  if (!demoSt1) {
    demoSt1 = await Student.create({
      student_no: 'ST-2026-DEMO01',
      name: 'Tariqul Hasan (Demo)',
      father_name: 'Md. Rafiqul Hasan',
      mother_name: 'Salma Begum',
      date_of_birth: new Date('1998-04-12'),
      gender: 'Male',
      blood_group: 'O+',
      nid_or_birth_cert: 'NID-1998-DEMO01',
      religion: 'Islam',
      marital_status: 'Single',
      mobile: '01711-000101',
      emergency_contact_name: 'Rafiqul Hasan',
      emergency_contact_relation: 'Father',
      emergency_contact_phone: '01711-000102',
      present_address: 'Mirpur-10, Dhaka',
      permanent_address: 'Comilla Sadar',
      passport_no: 'BD-DEMO-001',
      trade_id: trade!._id,
      trade_name: trade!.name,
      batch: demoBatchCode,
      session: 'Morning',
      admission_date: new Date('2026-11-02T10:00:00Z'),
      destination_country: tpl1.country || 'Saudi Arabia',
      destination_contract_years: 2,
      status: 'Active',
      fee_snapshot: { admission_fee: 0, course_fee: 0, visa_cost: 0, govt_fee: 0, discount: 0, total_payable: 0 },
      total_paid: 0,
      total_due: 0,
      created_by: 'DemoSeeder',
    });

    const admRes1 = await createStudentFeePlanOnAdmission({
      studentId: demoSt1._id.toString(),
      templateId: tpl1._id.toString(),
      admissionDate: '2026-11-02',
      discountTaka: 5000,
      discountReason: 'Demo Merit Scholarship',
      user: adminUser,
    });
    if (admRes1.plan && admRes1.plan.discountStatus === 'Pending') {
      await processStudentDiscountApproval({
        planId: admRes1.plan._id.toString(),
        decision: 'Approve',
        adjustmentDate: '2026-11-03',
        user: adminUser,
      });
    }
    const existingPlan1 = await StudentFeePlan.findOne({ studentId: demoSt1._id, isDeleted: { $ne: true } }).lean();
    if (existingPlan1 && existingPlan1.totalDuePaisa >= 5000000) {
      await collectStudentReceipt({
        studentId: demoSt1._id.toString(),
        amountPaisa: 5000000,
        method: 'Cash',
        receiptDate: '2026-11-05',
        reference: 'CASH-DEMO-01',
        note: 'Booking + partial training fee',
        user: acctUser,
      });
    }
    console.log('  + Created Demo Student ST-2026-DEMO01 (Fee Plan + Approved Discount + Cash Receipt)');
  } else {
    console.log('  = Demo Student ST-2026-DEMO01 already exists');
  }

  // Demo Student 2: Admitted with FeeTemplate, bKash Receipt, Approved Credit Note, Pending Refund
  let demoSt2 = await Student.findOne({ student_no: 'ST-2026-DEMO02' });
  if (!demoSt2) {
    demoSt2 = await Student.create({
      student_no: 'ST-2026-DEMO02',
      name: 'Nadia Akter (Demo)',
      father_name: 'Md. Karim Uddin',
      mother_name: 'Amena Khatun',
      date_of_birth: new Date('2000-08-20'),
      gender: 'Female',
      blood_group: 'A+',
      nid_or_birth_cert: 'NID-2000-DEMO02',
      religion: 'Islam',
      marital_status: 'Single',
      mobile: '01812-000201',
      emergency_contact_name: 'Karim Uddin',
      emergency_contact_relation: 'Father',
      emergency_contact_phone: '01812-000202',
      present_address: 'Uttara Sector-7, Dhaka',
      permanent_address: 'Gazipur',
      passport_no: 'BD-DEMO-002',
      trade_id: trade!._id,
      trade_name: trade!.name,
      batch: demoBatchCode,
      session: 'Morning',
      admission_date: new Date('2026-11-04T10:00:00Z'),
      destination_country: tpl1.country || 'Singapore',
      destination_contract_years: 2,
      status: 'Active',
      fee_snapshot: { admission_fee: 0, course_fee: 0, visa_cost: 0, govt_fee: 0, discount: 0, total_payable: 0 },
      total_paid: 0,
      total_due: 0,
      created_by: 'DemoSeeder',
    });

    await createStudentFeePlanOnAdmission({
      studentId: demoSt2._id.toString(),
      templateId: tpl1._id.toString(),
      admissionDate: '2026-11-04',
      user: adminUser,
    });

    const plan2 = await StudentFeePlan.findOne({ studentId: demoSt2._id, isDeleted: { $ne: true } }).lean();
    if (plan2 && plan2.totalDuePaisa > 0) {
      const collectAmt = Math.min(4000000, Math.round(plan2.totalDuePaisa * 0.5) || plan2.totalDuePaisa);
      await collectStudentReceipt({
        studentId: demoSt2._id.toString(),
        amountPaisa: collectAmt,
        method: 'bKash',
        receiptDate: '2026-11-06',
        reference: 'BKASH-DEMO-902',
        note: 'bKash merchant collection',
        user: acctUser,
      });
    }
    const plan2After = await StudentFeePlan.findOne({ studentId: demoSt2._id, isDeleted: { $ne: true } }).lean();
    if (plan2After && plan2After.totalDuePaisa >= 500000) {
      const cnAmt = Math.min(1000000, Math.round(plan2After.totalDuePaisa * 0.25));
      const cn = await createFeeRefundRequest({
        studentId: demoSt2._id.toString(),
        kind: 'CreditNote',
        amountPaisa: cnAmt,
        refundRule: 'PACKAGE_DOWNGRADE',
        reason: 'Demo credit note for package adjustment',
        refundDate: '2026-11-07',
        user: acctUser,
      });
      await processFeeRefundApproval({
        refundId: cn._id.toString(),
        decision: 'Approve',
        approvalDate: '2026-11-07',
        user: adminUser,
      });
    }
    const plan2Ref = await StudentFeePlan.findOne({ studentId: demoSt2._id, isDeleted: { $ne: true } }).lean();
    const netCol2 = plan2Ref ? Math.max(0, plan2Ref.totalPaidPaisa - (plan2Ref.totalRefundedPaisa || 0)) : 0;
    if (netCol2 >= 500000) {
      await createFeeRefundRequest({
        studentId: demoSt2._id.toString(),
        kind: 'Refund',
        amountPaisa: 500000,
        refundRule: 'OVERPAYMENT',
        reason: 'Demo pending refund awaiting Admin click in /accounts/dues',
        method: 'Cash',
        refundDate: '2026-11-08',
        user: acctUser,
      });
    }
    console.log('  + Created Demo Student ST-2026-DEMO02 (bKash Receipt + Credit Note + Pending Refund)');
  } else {
    const plan2 = await StudentFeePlan.findOne({ studentId: demoSt2._id, isDeleted: { $ne: true } }).lean();
    if (plan2 && plan2.totalPaidPaisa === 0 && plan2.totalDuePaisa > 0) {
      const collectAmt = Math.min(4000000, Math.round(plan2.totalDuePaisa * 0.5) || plan2.totalDuePaisa);
      await collectStudentReceipt({
        studentId: demoSt2._id.toString(),
        amountPaisa: collectAmt,
        method: 'bKash',
        receiptDate: '2026-11-06',
        reference: 'BKASH-DEMO-902',
        note: 'bKash merchant collection',
        user: acctUser,
      });
      const plan2Ref = await StudentFeePlan.findOne({ studentId: demoSt2._id, isDeleted: { $ne: true } }).lean();
      if (plan2Ref && plan2Ref.totalDuePaisa >= 500000) {
        const cn = await createFeeRefundRequest({
          studentId: demoSt2._id.toString(),
          kind: 'CreditNote',
          amountPaisa: Math.min(1000000, Math.round(plan2Ref.totalDuePaisa * 0.25)),
          refundRule: 'PACKAGE_DOWNGRADE',
          reason: 'Demo credit note for package adjustment',
          refundDate: '2026-11-07',
          user: acctUser,
        });
        await processFeeRefundApproval({
          refundId: cn._id.toString(),
          decision: 'Approve',
          approvalDate: '2026-11-07',
          user: adminUser,
        });
      }
      await createFeeRefundRequest({
        studentId: demoSt2._id.toString(),
        kind: 'Refund',
        amountPaisa: 500000,
        refundRule: 'OVERPAYMENT',
        reason: 'Demo pending refund awaiting Admin click in /accounts/dues',
        method: 'Cash',
        refundDate: '2026-11-08',
        user: acctUser,
      });
    }
    console.log('  = Demo Student ST-2026-DEMO02 ready');
  }
  if (demoSt2 && realBatch) {
    if (demoSt2.batch !== realBatch.batch_code) {
      await Student.updateOne({ _id: demoSt2._id }, { $set: { batch: realBatch.batch_code } });
    }
    await BatchAssessment.findOneAndUpdate(
      { batch_id: realBatch._id, student_id: demoSt2._id },
      { $setOnInsert: { batch_id: realBatch._id, student_id: demoSt2._id, result_status: 'Pending' } },
      { upsert: true }
    );
  }

  // Sync any legacy student with dummy B-* batch string that already has a valid BatchAssessment
  const legacyAssessments = await BatchAssessment.find({}).lean();
  for (const a of legacyAssessments) {
    const [st, bt] = await Promise.all([
      Student.findById(a.student_id).select('batch'),
      Batch.findById(a.batch_id).select('batch_code'),
    ]);
    if (st && bt && st.batch && st.batch.startsWith('B-') && st.batch !== bt.batch_code) {
      st.batch = bt.batch_code;
      await st.save();
    }
  }

  // Demo Payroll Runs in FY2026:
  // Ensure at least 1 active contracted employee exists
  let demoEmp = await Employee.findOne({ status: 'Active' }).lean();
  let demoContract = demoEmp
    ? await EmployeeContract.findOne({ employee_id: demoEmp._id, status: 'Active' }).lean()
    : null;

  if (!demoEmp) {
    const createdEmp = await Employee.create({
      employee_id: 'EMP-DEMO-01',
      firstName: 'Kamrul',
      lastName: 'Islam (Demo)',
      email: 'kamrul.demo@dreams.local',
      phone: '01799-000111',
      department: 'Administration',
      designation: 'Accounts Officer',
      joining_date: new Date('2026-01-01'),
      employee_type: 'Permanent',
      status: 'Active',
      basic_salary: 35000,
      payment_method: 'Bank',
      bank_name: 'Dutch-Bangla Bank',
      bank_account_no: '101-110-009911',
    });
    demoEmp = createdEmp.toObject();
  }
  if (!demoContract && structure && demoEmp) {
    const createdCtr = await EmployeeContract.create({
      employee_id: demoEmp._id,
      structure_id: structure._id,
      start_date: new Date('2026-01-01'),
      basic_salary: demoEmp.basic_salary || 35000,
      status: 'Active',
    });
    demoContract = createdCtr.toObject();
  }

  // Helper to create demo payroll batch cleanly if missing
  const createDemoPayrollRunIfMissing = async (
    batchCode: string,
    name: string,
    month: number,
    year: number,
    targetAction: 'confirm' | 'pay'
  ) => {
    const exists = await PayslipBatch.findOne({ batch_code: batchCode });
    if (exists) {
      console.log(`  = Demo Payroll Run ${batchCode} already exists (${exists.status})`);
      return exists;
    }
    if (!demoEmp || !demoContract || !structure) {
      console.log(`  ! Skipping ${batchCode}: missing Employee/Contract/SalaryStructure`);
      return null;
    }

    const netAmt = demoContract.basic_salary || 35000;
    const batch = await PayslipBatch.create({
      name,
      batch_code: batchCode,
      month,
      year,
      branch: 'Main',
      department: 'all',
      status: 'Verified',
      days_basis: 'fixed_30',
      overtime_multiplier: 2,
      include_no_attendance: true,
      payslip_count: 1,
      skipped_count: 0,
      total_gross_pay: netAmt,
      total_deductions: 0,
      total_net_pay: netAmt,
      verified_by: 'Demo HR',
      verified_at: new Date(),
      created_by: 'DemoSeeder',
    });

    const slipNo = await generateNextPayslipNo(month, year);
    await Payslip.create({
      payslip_no: slipNo,
      employee_id: demoEmp._id,
      contract_id: demoContract._id,
      structure_id: structure._id,
      batch_id: batch._id,
      month,
      year,
      branch: 'Main',
      days_basis: 'fixed_30',
      days_in_month: 30,
      prorated_days: 30,
      per_day_rate: Math.round(netAmt / 30),
      overtime_multiplier: 2,
      attendance_summary: {
        presentDays: 26,
        absentDays: 0,
        lateDays: 0,
        halfDays: 0,
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
      },
      inputs_snapshot: {
        bonus: 0,
        overtime_hours: 0,
        overtime_rate: 0,
        loan_installment: 0,
        manual_deduction: 0,
      },
      lines: [
        { name: 'Basic Salary', code: 'BASIC', category: 'BASIC', sequence: 10, amount: netAmt, source: 'contract' },
        { name: 'Gross Earnings', code: 'GROSS', category: 'GROSS', sequence: 70, amount: netAmt, source: 'formula' },
        { name: 'Net Payable', code: 'NET', category: 'NET', sequence: 130, amount: netAmt, source: 'formula' },
      ],
      basic_pay: netAmt,
      total_allowances: 0,
      gross_pay: netAmt,
      total_deductions: 0,
      net_pay: netAmt,
      status: 'Confirmed',
      verified_by: 'Demo HR',
      verified_at: new Date(),
      confirmed_by: 'System Administrator',
      confirmed_at: new Date(),
      created_by: 'DemoSeeder',
    });

    await postPayrollConfirmAccrual({ runId: batch._id.toString(), user: adminUser });
    batch.status = 'Confirmed';
    batch.confirmed_by = 'System Administrator';
    batch.confirmed_at = new Date();
    await batch.save();

    if (targetAction === 'pay') {
      await disbursePayrollRun({
        runId: batch._id.toString(),
        method: 'Bank',
        paymentDate: `${year}-${String(month).padStart(2, '0')}-28`,
        paymentReference: `BEFTN-${year}${month}-DEMO`,
        note: 'Demo salary disbursement via Bank',
        user: acctUser,
      });
      console.log(`  + Created & Disbursed Demo Payroll ${batchCode} (JV + PV posted, Paid)`);
    } else {
      console.log(`  + Created Confirmed Demo Payroll ${batchCode} (JV accrued, awaiting Disbursement in /accounts/payroll)`);
    }
    return batch;
  };

  await createDemoPayrollRunIfMissing('PR-202609-DEMO', 'Sep 2026 Demo Payroll (Disbursed)', 9, 2026, 'pay');
  await createDemoPayrollRunIfMissing('PR-202610-DEMO', 'Oct 2026 Demo Payroll (Awaiting Pay)', 10, 2026, 'confirm');

  // Archive any legacy pre-Phase-1 smoke journal doc without a voucherNo (soft-delete only)
  const legacyRes = await JournalEntry.updateMany(
    { $or: [{ voucherNo: { $exists: false } }, { voucherNo: null }, { voucherNo: '' }], isDeleted: { $ne: true } },
    { $set: { isDeleted: true } }
  );
  if (legacyRes.modifiedCount > 0) {
    console.log(`  + Soft-archived ${legacyRes.modifiedCount} pre-Accounts legacy smoke journal doc(s)`);
  }

  // Backfill accrual for any pre-Phase-C Confirmed payroll runs (e.g. PR-202611-01)
  const confirmedBatches = await PayslipBatch.find({
    is_reversal: { $ne: true },
    status: { $in: ['Confirmed', 'Paid'] },
    total_net_pay: { $gt: 0 },
  }).lean();
  for (const b of confirmedBatches) {
    const res = await postPayrollConfirmAccrual({ runId: b._id.toString(), user: adminUser });
    console.log(
      `  Payroll check ${b.batch_code} (status=${b.status}, net=${b.total_net_pay}): entry=${res.entry?.voucherNo || 'null'}, dup=${res.duplicate}, skipped=${res.skipped}`
    );
  }
}

async function runQaVerification() {
  console.log('\n--- 2. RUNNING SENIOR QA END-TO-END SYNC TESTS (ISOLATED FY2096) ---');

  const testFyYear = 2096;
  await ensureFiscalYearWithPeriods(testFyYear, 'QA-Sync');
  const qaAdmin = { userId: 'qa-admin', name: 'QA Admin', username: 'qaadmin', role: 'Admin' };
  const qaAcct = { userId: 'qa-acct', name: 'QA Accountant', username: 'qaacct', role: 'Accountant' };

  const trade = await Trade.findOne({}).lean();
  const structure = await SalaryStructure.findOne({}).lean();
  const ts = Date.now();

  let tpl: any = null;
  let qaStudent: any = null;
  let qaEmp: any = null;
  let qaContract: any = null;
  let qaBatchConfirmed: any = null;
  let qaBatchReversed: any = null;
  const qaSlipsToClean: any[] = [];
  const qaEntryIds: mongoose.Types.ObjectId[] = [];
  const qaReceiptIds: any[] = [];
  const qaRefundIds: any[] = [];
  let qaPlanId: any = null;

  try {
    // --- TEST SUITE A: ADMISSION <-> ACCOUNTS SYNC ---
    tpl = await createFeeTemplateRecord({
      code: `QA96-TPL-${ts}`,
      name: 'QA Sync Package FY2096',
      tradeId: trade?._id?.toString() || null,
      tradeName: trade?.name || 'General',
      country: 'Qatar',
      stages: [
        { stageOrder: 1, stageCode: 'BOOKING', label: 'Booking', amountPaisa: 1000000, dueOffsetDays: 0 },
        { stageOrder: 2, stageCode: 'MEDICAL_TRAINING', label: 'Training', amountPaisa: 2000000, dueOffsetDays: 10 },
        { stageOrder: 3, stageCode: 'VISA_PROCESSING', label: 'Visa', amountPaisa: 7000000, dueOffsetDays: 20 },
      ],
      createdBy: 'QA96',
    });

    qaStudent = await Student.create({
      student_no: `ST-QA96-${ts}`,
      name: 'QA96 Sync Candidate',
      father_name: 'F96',
      mother_name: 'M96',
      date_of_birth: new Date('1997-03-03'),
      gender: 'Male',
      blood_group: 'B+',
      nid_or_birth_cert: `NID-QA96-${ts}`,
      religion: 'Islam',
      marital_status: 'Single',
      mobile: '01700009696',
      emergency_contact_name: 'EC96',
      emergency_contact_relation: 'Brother',
      emergency_contact_phone: '01700009695',
      present_address: 'Dhaka',
      permanent_address: 'Dhaka',
      passport_no: `PQA96-${ts}`,
      trade_id: trade!._id,
      trade_name: trade!.name,
      batch: 'QA96-BATCH',
      session: '2096',
      admission_date: new Date('2096-06-05T00:00:00Z'),
      destination_country: 'Qatar',
      destination_contract_years: 2,
      fee_snapshot: { admission_fee: 0, course_fee: 0, visa_cost: 0, govt_fee: 0, discount: 0, total_payable: 0 },
      total_paid: 0,
      total_due: 0,
      created_by: 'QA96',
    });

    // Period lock guard on Admission fee plan
    await AccountingPeriod.updateOne({ year: 2096, month: 6 }, { $set: { status: 'Locked' } });
    let blockedAdmLock = false;
    try {
      await createStudentFeePlanOnAdmission({
        studentId: qaStudent._id.toString(),
        templateId: tpl._id.toString(),
        admissionDate: '2096-06-05',
        user: qaAcct,
      });
    } catch {
      blockedAdmLock = true;
    }
    await AccountingPeriod.updateOne({ year: 2096, month: 6 }, { $set: { status: 'Open' } });
    assert(blockedAdmLock, 'QA-A1: Locked Accounting Period strictly blocks Admission fee accrual');

    const adm = await createStudentFeePlanOnAdmission({
      studentId: qaStudent._id.toString(),
      templateId: tpl._id.toString(),
      admissionDate: '2096-06-05',
      discountTaka: 5000,
      discountReason: 'QA96 Early Admission Discount',
      user: qaAcct,
    });
    qaPlanId = adm.plan?._id;
    if (adm.entry?._id) qaEntryIds.push(adm.entry._id as mongoose.Types.ObjectId);

    const discApr = await processStudentDiscountApproval({
      planId: adm.plan!._id.toString(),
      decision: 'Approve',
      adjustmentDate: '2096-06-06',
      user: qaAdmin,
    });
    if (discApr.entry?._id) qaEntryIds.push(discApr.entry._id as mongoose.Types.ObjectId);

    // Overpayment guard
    let blockedOverpay = false;
    try {
      await collectStudentReceipt({
        studentId: qaStudent._id.toString(),
        amountPaisa: 9600000, // net payable is 95,000 BDT (9,500,000 paisa)
        method: 'Cash',
        receiptDate: '2096-06-07',
        user: qaAcct,
      });
    } catch {
      blockedOverpay = true;
    }
    assert(blockedOverpay, 'QA-A2: Receipt collector rejects overpayment exceeding net due balance');

    const rcptA = await collectStudentReceipt({
      studentId: qaStudent._id.toString(),
      amountPaisa: 2500000, // 25,000 BDT -> Stage 1 (10k Paid), Stage 2 (15k/20k Partial)
      method: 'bKash',
      receiptDate: '2096-06-08',
      reference: `BK96-${ts}`,
      user: qaAcct,
    });
    qaReceiptIds.push(rcptA.receipt._id);
    qaEntryIds.push(rcptA.entry._id as mongoose.Types.ObjectId);

    const revA = await reverseMoneyReceipt({
      receiptId: rcptA.receipt._id.toString(),
      reason: 'QA96 Reversal check',
      reversalDate: '2096-06-09',
      user: qaAdmin,
    });
    qaEntryIds.push(revA.reversal._id as mongoose.Types.ObjectId);

    const rcptB = await collectStudentReceipt({
      studentId: qaStudent._id.toString(),
      amountPaisa: 3000000,
      method: 'Bank transfer',
      receiptDate: '2096-06-10',
      reference: `BNK96-${ts}`,
      user: qaAcct,
    });
    qaReceiptIds.push(rcptB.receipt._id);
    qaEntryIds.push(rcptB.entry._id as mongoose.Types.ObjectId);

    const rfReq = await createFeeRefundRequest({
      studentId: qaStudent._id.toString(),
      kind: 'Refund',
      amountPaisa: 1000000,
      refundRule: 'VISA_REJECTED',
      reason: 'QA96 Refund test',
      method: 'Cash',
      refundDate: '2096-06-11',
      user: qaAcct,
    });
    qaRefundIds.push(rfReq._id);
    const rfApr = await processFeeRefundApproval({
      refundId: rfReq._id.toString(),
      decision: 'Approve',
      approvalDate: '2096-06-11',
      user: qaAdmin,
    });
    if (rfApr.entry?._id) qaEntryIds.push(rfApr.entry._id as mongoose.Types.ObjectId);

    const cnReq = await createFeeRefundRequest({
      studentId: qaStudent._id.toString(),
      kind: 'CreditNote',
      amountPaisa: 1500000,
      refundRule: 'PACKAGE_DOWNGRADE',
      reason: 'QA96 Credit note test',
      refundDate: '2096-06-12',
      user: qaAcct,
    });
    qaRefundIds.push(cnReq._id);
    const cnApr = await processFeeRefundApproval({
      refundId: cnReq._id.toString(),
      decision: 'Approve',
      approvalDate: '2096-06-12',
      user: qaAdmin,
    });
    if (cnApr.entry?._id) qaEntryIds.push(cnApr.entry._id as mongoose.Types.ObjectId);

    // 100k gross - 5k disc - 30k paid - 15k credit note = 50k due; net cash collected = 30k - 10k refund = 20k
    const stAfter = await Student.findById(qaStudent._id).lean();
    const stmt = await getStudentFeeStatement(qaStudent._id.toString());
    const arAccId = await getSystemAccountId('STUDENT_RECEIVABLE');
    const studentArGl = (
      await JournalLine.find({ accountId: arAccId, studentId: qaStudent._id, isDeleted: { $ne: true } }).lean()
    ).reduce((s, l) => s + l.debitPaisa - l.creditPaisa, 0);

    assert(
      stAfter?.total_paid === 20000 &&
        stAfter?.total_due === 50000 &&
        stmt.rows[stmt.rows.length - 1]?.runningBalancePaisa === 5000000 &&
        studentArGl === 5000000,
      'QA-A3: Admission + Discount + Receipt + Reversal + Refund + CreditNote sync Student cache, Statement & GL 1210 (50,000 BDT due, 20,000 BDT net paid)'
    );

    // --- TEST SUITE B: HRM PAYROLL <-> ACCOUNTS SYNC (PHASE C) ---
    qaEmp = await Employee.create({
      employee_id: `EMP-QA96-${ts}`,
      firstName: 'QA96',
      lastName: 'Engineer',
      email: `qa96-${ts}@dreams.local`,
      phone: '01700096001',
      department: 'Training',
      designation: 'Instructor',
      joining_date: new Date('2096-01-01'),
      employee_type: 'Permanent',
      status: 'Active',
      basic_salary: 45000,
      payment_method: 'Bank',
    });
    qaContract = await EmployeeContract.create({
      employee_id: qaEmp._id,
      structure_id: structure!._id,
      start_date: new Date('2096-01-01'),
      basic_salary: 45000,
      status: 'Active',
    });

    qaBatchConfirmed = await PayslipBatch.create({
      name: 'QA96 July Payroll',
      batch_code: `PR-209607-${ts}`,
      month: 7,
      year: 2096,
      branch: 'Main',
      department: 'Training',
      status: 'Verified',
      days_basis: 'fixed_30',
      overtime_multiplier: 2,
      include_no_attendance: true,
      payslip_count: 1,
      skipped_count: 0,
      total_gross_pay: 45000,
      total_deductions: 0,
      total_net_pay: 45000,
      created_by: 'QA96',
    });
    const slip1 = await Payslip.create({
      payslip_no: `PS-209607-${ts}-1`,
      employee_id: qaEmp._id,
      contract_id: qaContract._id,
      structure_id: structure!._id,
      batch_id: qaBatchConfirmed._id,
      month: 7,
      year: 2096,
      branch: 'Main',
      days_basis: 'fixed_30',
      days_in_month: 30,
      prorated_days: 30,
      per_day_rate: 1500,
      overtime_multiplier: 2,
      attendance_summary: { presentDays: 26, absentDays: 0, lateDays: 0, halfDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0 },
      inputs_snapshot: { bonus: 0, overtime_hours: 0, overtime_rate: 0, loan_installment: 0, manual_deduction: 0 },
      lines: [
        { name: 'Basic', code: 'BASIC', category: 'BASIC', sequence: 10, amount: 45000, source: 'contract' },
        { name: 'Net', code: 'NET', category: 'NET', sequence: 130, amount: 45000, source: 'formula' },
      ],
      basic_pay: 45000,
      total_allowances: 0,
      gross_pay: 45000,
      total_deductions: 0,
      net_pay: 45000,
      status: 'Verified',
      created_by: 'QA96',
    });
    qaSlipsToClean.push(slip1._id);

    // 1. Period Lock blocks Confirm accrual
    await AccountingPeriod.updateOne({ year: 2096, month: 7 }, { $set: { status: 'Locked' } });
    let blockedPayLock = false;
    try {
      await onPayrollRunConfirmed({
        runId: qaBatchConfirmed._id.toString(),
        month: 7,
        year: 2096,
        branch: 'Main',
        totalNetPay: 45000,
        user: qaAdmin,
      });
    } catch {
      blockedPayLock = true;
    }
    await AccountingPeriod.updateOne({ year: 2096, month: 7 }, { $set: { status: 'Open' } });
    assert(blockedPayLock, 'QA-B1: Locked Accounting Period strictly blocks Payroll Confirm accrual');

    // 2. Confirm accrual posts 5210 Dr / 2110 Cr and is idempotent
    await onPayrollRunConfirmed({
      runId: qaBatchConfirmed._id.toString(),
      month: 7,
      year: 2096,
      branch: 'Main',
      totalNetPay: 45000,
      user: qaAdmin,
    });
    // Call duplicate confirm hook to assert idempotency
    const dupRes = await postPayrollConfirmAccrual({ runId: qaBatchConfirmed._id.toString(), user: qaAdmin });
    qaBatchConfirmed.status = 'Confirmed';
    await qaBatchConfirmed.save();
    await Payslip.updateOne({ _id: slip1._id }, { $set: { status: 'Confirmed' } });

    const confirmJes = await JournalEntry.find({
      sourceModule: 'PAYROLL_CONFIRM',
      sourceId: qaBatchConfirmed._id.toString(),
      isDeleted: { $ne: true },
    }).lean();
    confirmJes.forEach((j) => qaEntryIds.push(j._id as mongoose.Types.ObjectId));

    const salExpId = await getSystemAccountId('SALARY_EXPENSE');
    const salPayId = await getSystemAccountId('SALARY_PAYABLE');
    const empPayableAfterConfirm = (
      await JournalLine.find({ accountId: salPayId, employeeId: qaEmp._id, isDeleted: { $ne: true } }).lean()
    ).reduce((s, l) => s + l.creditPaisa - l.debitPaisa, 0);

    assert(
      confirmJes.length === 1 && dupRes.duplicate === true && empPayableAfterConfirm === 4500000,
      'QA-B2: Payroll Confirm accrual is idempotent and credits 2110 Salary Payable (45,000 BDT) for QA employee'
    );

    // 3. Disburse from Accounts marks PayslipBatch + Payslip Paid & settles 2110 -> Bank
    const disbRes = await disbursePayrollRun({
      runId: qaBatchConfirmed._id.toString(),
      method: 'Bank',
      paymentDate: '2096-07-31',
      paymentReference: `BEFTN-QA96-${ts}`,
      note: 'QA96 Bank Salary Transfer',
      user: qaAcct,
    });
    qaEntryIds.push(disbRes.payEntry._id as mongoose.Types.ObjectId);

    const slip1After = await Payslip.findById(slip1._id).lean();
    const empPayableAfterPay = (
      await JournalLine.find({ accountId: salPayId, employeeId: qaEmp._id, isDeleted: { $ne: true } }).lean()
    ).reduce((s, l) => s + l.creditPaisa - l.debitPaisa, 0);
    const empExpenseTotal = (
      await JournalLine.find({ accountId: salExpId, employeeId: qaEmp._id, isDeleted: { $ne: true } }).lean()
    ).reduce((s, l) => s + l.debitPaisa - l.creditPaisa, 0);

    assert(
      disbRes.batch.status === 'Paid' &&
        slip1After?.status === 'Paid' &&
        slip1After?.payment_reference === `BEFTN-QA96-${ts}` &&
        empPayableAfterPay === 0 &&
        empExpenseTotal === 4500000,
      'QA-B3: Accounts Salary Disbursement posts PV, zeros 2110 Salary Payable, keeps 5210 Expense (45k), and marks HRM Batch & Payslips Paid'
    );

    // 4. Reverse Confirmed Payroll Run zeroes both 5210 Expense and 2110 Payable
    qaBatchReversed = await PayslipBatch.create({
      name: 'QA96 August Payroll (To Reverse)',
      batch_code: `PR-209608-${ts}`,
      month: 8,
      year: 2096,
      branch: 'Main',
      department: 'Training',
      status: 'Verified',
      days_basis: 'fixed_30',
      overtime_multiplier: 2,
      include_no_attendance: true,
      payslip_count: 1,
      skipped_count: 0,
      total_gross_pay: 20000,
      total_deductions: 0,
      total_net_pay: 20000,
      created_by: 'QA96',
    });
    const slip2 = await Payslip.create({
      payslip_no: `PS-209608-${ts}-1`,
      employee_id: qaEmp._id,
      contract_id: qaContract._id,
      structure_id: structure!._id,
      batch_id: qaBatchReversed._id,
      month: 8,
      year: 2096,
      branch: 'Main',
      days_basis: 'fixed_30',
      days_in_month: 30,
      prorated_days: 30,
      per_day_rate: 667,
      overtime_multiplier: 2,
      attendance_summary: { presentDays: 26, absentDays: 0, lateDays: 0, halfDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0 },
      inputs_snapshot: { bonus: 0, overtime_hours: 0, overtime_rate: 0, loan_installment: 0, manual_deduction: 0 },
      lines: [
        { name: 'Basic', code: 'BASIC', category: 'BASIC', sequence: 10, amount: 20000, source: 'contract' },
        { name: 'Net', code: 'NET', category: 'NET', sequence: 130, amount: 20000, source: 'formula' },
      ],
      basic_pay: 20000,
      total_allowances: 0,
      gross_pay: 20000,
      total_deductions: 0,
      net_pay: 20000,
      status: 'Verified',
      created_by: 'QA96',
    });
    qaSlipsToClean.push(slip2._id);

    const acc2 = await postPayrollConfirmAccrual({ runId: qaBatchReversed._id.toString(), user: qaAdmin });
    if (acc2.entry?._id) qaEntryIds.push(acc2.entry._id as mongoose.Types.ObjectId);
    const revPay = await reversePayrollConfirmAccrual({
      runId: qaBatchReversed._id.toString(),
      reason: 'QA96 Reversal test',
      user: qaAdmin,
    });
    if (revPay?.reversal?._id) qaEntryIds.push(revPay.reversal._id as mongoose.Types.ObjectId);

    const augEntries = await JournalEntry.find({
      sourceModule: 'PAYROLL_CONFIRM',
      sourceId: qaBatchReversed._id.toString(),
    }).lean();
    assert(
      Boolean(revPay?.reversal) && augEntries.some((e) => e.status === 'Reversed'),
      'QA-B4: Reversing a Confirmed payroll run creates mirror reversal JV in Accounts'
    );

    // --- TEST SUITE C: GLOBAL DB DOUBLE-ENTRY & CROSS-MODULE INTEGRITY AUDIT ---
    console.log('\n--- 3. GLOBAL PRODUCTION + DEMO INTEGRITY AUDIT ---');
    const allEntries = await JournalEntry.find({
      status: { $in: ['Posted', 'Reversed'] },
      isDeleted: { $ne: true },
    }).lean();
    const allLines = await JournalLine.find({
      status: { $in: ['Posted', 'Reversed'] },
      isDeleted: { $ne: true },
    }).lean();

    let unbalancedEntries = 0;
    const lineSumsByEntry = new Map<string, { dr: number; cr: number }>();
    let globalDr = 0;
    let globalCr = 0;
    for (const l of allLines) {
      globalDr += l.debitPaisa;
      globalCr += l.creditPaisa;
      const k = l.entryId.toString();
      const cur = lineSumsByEntry.get(k) || { dr: 0, cr: 0 };
      cur.dr += l.debitPaisa;
      cur.cr += l.creditPaisa;
      lineSumsByEntry.set(k, cur);
    }
    for (const e of allEntries) {
      const s = lineSumsByEntry.get(e._id.toString()) || { dr: 0, cr: 0 };
      if (s.dr !== s.cr || s.dr <= 0 || s.dr !== e.totalDebitPaisa || s.cr !== e.totalCreditPaisa) {
        unbalancedEntries++;
        console.log('  ! Entry mismatch FULL:', JSON.stringify(e), 'lineSum:', s);
      }
    }
    assert(
      unbalancedEntries === 0 && globalDr === globalCr && globalDr > 0,
      `QA-C1: 100% of ${allEntries.length} Journal Entries & Trial Balance (${paisaToTaka(globalDr).toLocaleString('en-IN')} BDT) balance to 1 paisa`,
      `unbalancedEntries=${unbalancedEntries}, globalDr=${globalDr}, globalCr=${globalCr}`
    );

    const allPlans = await StudentFeePlan.find({ isDeleted: { $ne: true } }).lean();
    let planMismatches = 0;
    for (const p of allPlans) {
      const st = await Student.findById(p.studentId).select('student_no total_due').lean();
      if (!st || Math.abs(Math.round((st.total_due || 0) * 100) - p.totalDuePaisa) > 1) {
        planMismatches++;
      }
    }
    assert(
      planMismatches === 0 && allPlans.length >= 2,
      `QA-C2: All ${allPlans.length} StudentFeePlans sync 100% with Student.total_due`,
      `mismatches=${planMismatches}`
    );

    const confirmedOrPaidBatches = await PayslipBatch.find({
      is_reversal: { $ne: true },
      status: { $in: ['Confirmed', 'Paid'] },
    }).lean();
    const missingAccruals: string[] = [];
    const missingPayouts: string[] = [];
    for (const b of confirmedOrPaidBatches) {
      if ((b.total_net_pay || 0) <= 0) continue;
      const hasConfirmJe = await JournalEntry.exists({
        sourceModule: 'PAYROLL_CONFIRM',
        sourceId: b._id.toString(),
        status: 'Posted',
        isDeleted: { $ne: true },
      });
      if (!hasConfirmJe) missingAccruals.push(b.batch_code);
      if (b.status === 'Paid') {
        const hasPayJe = await JournalEntry.exists({
          sourceModule: 'PAYROLL_PAY',
          sourceId: b._id.toString(),
          status: 'Posted',
          isDeleted: { $ne: true },
        });
        if (!hasPayJe) missingPayouts.push(b.batch_code);
      }
    }
    console.log(
      `  Info: Confirmed/Paid Payroll Runs audited = ${confirmedOrPaidBatches.length}; Missing Accruals = [${missingAccruals.join(', ') || 'none'}]; Missing Payouts = [${missingPayouts.join(', ') || 'none'}]`
    );
    assert(
      missingAccruals.length === 0 && missingPayouts.length === 0,
      'QA-C3: Every Confirmed/Paid Payroll Run has its linked Accounts JV/PV voucher'
    );

    // QA-C4: Cross-module Trades <-> Batches <-> Assessments <-> FeeTemplates <-> Students Sync Audit
    const [allTrades, allBatches, allAssessments, allTemplates, allStudents] = await Promise.all([
      Trade.find().lean(),
      Batch.find().lean(),
      BatchAssessment.find().lean(),
      FeeTemplate.find({ isDeleted: { $ne: true } }).lean(),
      Student.find().select('student_no trade_id trade_name batch status').lean(),
    ]);
    const tradeNameById = new Map(allTrades.map((t) => [t._id.toString(), t.name]));
    const batchById = new Map(allBatches.map((b) => [b._id.toString(), b]));
    const studentById = new Map(allStudents.map((s) => [s._id.toString(), s]));

    let catalogSyncErrors = 0;
    for (const b of allBatches) {
      const expected = tradeNameById.get(b.trade_id?.toString() || '');
      if (!expected || b.trade_name !== expected) catalogSyncErrors++;
    }
    for (const tplItem of allTemplates) {
      if (tplItem.tradeId) {
        const expected = tradeNameById.get(tplItem.tradeId.toString());
        if (!expected || tplItem.tradeName !== expected) catalogSyncErrors++;
      }
    }
    for (const s of allStudents) {
      const expected = tradeNameById.get(s.trade_id?.toString() || '');
      if (!expected || s.trade_name !== expected) catalogSyncErrors++;
    }
    for (const a of allAssessments) {
      const st = studentById.get(a.student_id?.toString() || '');
      const bt = batchById.get(a.batch_id?.toString() || '');
      if (!st || !bt || st.trade_id?.toString() !== bt.trade_id?.toString()) {
        catalogSyncErrors++;
      }
    }
    assert(
      catalogSyncErrors === 0,
      `QA-C4: 100% Sync verified across ${allTrades.length} Trades, ${allBatches.length} Batches, ${allAssessments.length} Assessments, ${allTemplates.length} FeeTemplates & ${allStudents.length} Students`,
      `catalogSyncErrors=${catalogSyncErrors}`
    );
  } finally {
    // Clean up ONLY isolated FY2096 QA fixtures (preserving FY2026 live + demo data)
    if (qaRefundIds.length > 0) await FeeRefund.deleteMany({ _id: { $in: qaRefundIds } });
    if (qaReceiptIds.length > 0) await MoneyReceipt.deleteMany({ _id: { $in: qaReceiptIds } });
    if (qaPlanId) await StudentFeePlan.deleteMany({ _id: qaPlanId });
    if (tpl?._id) await FeeTemplate.deleteMany({ _id: tpl._id });
    if (qaStudent?._id) await Student.deleteMany({ _id: qaStudent._id });
    if (qaSlipsToClean.length > 0) await Payslip.deleteMany({ _id: { $in: qaSlipsToClean } });
    if (qaBatchConfirmed?._id) await PayslipBatch.deleteMany({ _id: qaBatchConfirmed._id });
    if (qaBatchReversed?._id) await PayslipBatch.deleteMany({ _id: qaBatchReversed._id });
    if (qaContract?._id) await EmployeeContract.deleteMany({ _id: qaContract._id });
    if (qaEmp?._id) await Employee.deleteMany({ _id: qaEmp._id });
    if (qaEntryIds.length > 0) {
      await JournalLine.deleteMany({ entryId: { $in: qaEntryIds } });
      await JournalEntry.deleteMany({ _id: { $in: qaEntryIds } });
    }
    await VoucherSequence.deleteMany({ fiscalYearCode: 'FY2096' });
    await AccountingPeriod.deleteMany({ year: testFyYear });
    await FiscalYear.deleteMany({ code: 'FY2096' });
  }

  console.log('\n====================================================');
  console.log(`SENIOR QA SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================');
  process.exit(failed > 0 ? 1 : 0);
}

async function main() {
  await connectDB();
  await ensureAccountsSeeded();
  await ensurePayrollSeeded();
  await seedLiveDemoData();
  await runQaVerification();
}

main().catch((err) => {
  console.error('Fatal QA script error:', err);
  process.exit(1);
});

