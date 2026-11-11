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
import {
  buildStagesFromTotals,
  allocatePaisaAcrossStages,
  collectStudentReceipt,
} from '../src/lib/accounts/fees';
import {
  getSystemAccountId,
  postTransactionEntry,
  resolveDepositSystemTag,
} from '../src/lib/accounts/posting';
import { StudentFeePlan } from '../src/models/StudentFeePlan';
import { MoneyReceipt } from '../src/models/MoneyReceipt';
import { JournalEntry } from '../src/models/JournalEntry';
import { JournalLine } from '../src/models/JournalLine';
import { Student } from '../src/models/Student';
import { Trade } from '../src/models/Trade';
import { AccountingPeriod } from '../src/models/AccountingPeriod';
import { FiscalYear } from '../src/models/FiscalYear';
import { VoucherSequence } from '../src/models/VoucherSequence';

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

async function runTests() {
  console.log('====================================================');
  console.log('DREAMS ERP - PHASE A OWNERSHIP & POSTING TESTS');
  console.log('====================================================\n');

  // 1. Stage builder from descriptive + monetary fields
  const stages = buildStagesFromTotals({
    admissionFeeTaka: 5000,
    courseFeeTaka: 20000,
    visaCostTaka: 130000,
    govtFeeTaka: 15000,
    visaOffsetDays: 45,
  });
  const sumPaisa = stages.reduce((s, st) => s + st.amountPaisa, 0);
  assert(
    stages.length === 4 && sumPaisa === 17000000 && stages[2].dueOffsetDays === 45,
    'buildStagesFromTotals computes integer paisa stages accurately (1,70,000 BDT = 17,000,000 paisa)'
  );

  // 2. Payment stage allocation
  const mockStages: any[] = [
    { stageNo: 1, label: 'Booking', dueDate: new Date(), amountPaisa: 500000, paidPaisa: 0, status: 'Pending' },
    { stageNo: 2, label: 'Training', dueDate: new Date(), amountPaisa: 2000000, paidPaisa: 0, status: 'Pending' },
  ];
  const allocs = allocatePaisaAcrossStages(mockStages, 1200000, null);
  assert(
    allocs.length === 2 &&
      mockStages[0].status === 'Paid' &&
      mockStages[0].paidPaisa === 500000 &&
      mockStages[1].status === 'Partial' &&
      mockStages[1].paidPaisa === 700000,
    'allocatePaisaAcrossStages settles oldest stage first and leaves remainder partial'
  );

  // 3. Deposit tag resolution
  assert(
    resolveDepositSystemTag('Cash') === 'CASH' &&
      resolveDepositSystemTag('bKash') === 'BKASH' &&
      resolveDepositSystemTag('Nagad') === 'NAGAD' &&
      resolveDepositSystemTag('Bank transfer') === 'BANK_MAIN',
    'resolveDepositSystemTag routes Cash, bKash, Nagad, and Bank to proper COA accounts'
  );

  await connectDB();
  await ensureAccountsSeeded();

  // 4. Transactional Invoice + MoneyReceipt posting & StudentFeePlan sync in isolated FY2098
  const testFyYear = 2098;
  await ensureFiscalYearWithPeriods(testFyYear, 'QA-PhaseA');
  const qaUser = { userId: 'qa-acct', name: 'QA Accountant', username: 'qaacct', role: 'Accountant' };

  const trade = await Trade.findOne({}).lean();
  const ts = Date.now();
  const fakeStudent = await Student.create({
    student_no: `ST-QA-${ts}`,
    name: 'Phase A QA Candidate',
    father_name: 'QA Father',
    mother_name: 'QA Mother',
    date_of_birth: new Date('1998-01-01'),
    gender: 'Male',
    blood_group: 'O+',
    nid_or_birth_cert: `NID-QA-${ts}`,
    religion: 'Islam',
    marital_status: 'Single',
    mobile: '01700000099',
    emergency_contact_name: 'EC',
    emergency_contact_relation: 'Brother',
    emergency_contact_phone: '01700000098',
    present_address: 'Dhaka',
    permanent_address: 'Dhaka',
    passport_no: `PQA${ts}`,
    trade_id: trade!._id,
    trade_name: trade!.name,
    batch: 'QA-BATCH',
    session: '2098',
    admission_date: new Date('2098-05-01T00:00:00Z'),
    destination_country: 'Saudi Arabia',
    destination_contract_years: 2,
    fee_snapshot: {
      admission_fee: 5000,
      course_fee: 20000,
      visa_cost: 0,
      govt_fee: 0,
      discount: 0,
      total_payable: 25000,
    },
    total_paid: 0,
    total_due: 25000,
    created_by: 'QA',
  });

  let createdPlanId: any = null;
  const createdEntryIds: mongoose.Types.ObjectId[] = [];
  let createdReceiptId: any = null;

  try {
    const arAccId = await getSystemAccountId('STUDENT_RECEIVABLE');
    const incAccId = await getSystemAccountId('FEE_INCOME');

    const { entry: invEntry } = await postTransactionEntry({
      journalType: 'JV',
      entryDate: '2098-05-01',
      description: `QA Invoice ${fakeStudent.student_no}`,
      sourceModule: 'QA_PHASE_A',
      sourceId: fakeStudent._id.toString(),
      idempotencyKey: `QA_INV:${fakeStudent._id}`,
      user: qaUser,
      lines: [
        { accountId: arAccId, debitPaisa: 2500000, creditPaisa: 0, studentId: fakeStudent._id.toString() },
        { accountId: incAccId, debitPaisa: 0, creditPaisa: 2500000, studentId: fakeStudent._id.toString() },
      ],
    });
    createdEntryIds.push(invEntry._id as mongoose.Types.ObjectId);

    const plan = await StudentFeePlan.create({
      planNo: `FP-${fakeStudent.student_no}`,
      studentId: fakeStudent._id,
      studentNo: fakeStudent.student_no,
      tradeName: fakeStudent.trade_name,
      destinationCountry: fakeStudent.destination_country,
      totalBilledPaisa: 2500000,
      discountPaisa: 0,
      netPayablePaisa: 2500000,
      totalPaidPaisa: 0,
      totalDuePaisa: 2500000,
      stages: [
        { stageNo: 1, stageCode: 'BOOKING', label: 'Booking', dueDate: new Date('2098-05-01'), amountPaisa: 500000, paidPaisa: 0, status: 'Pending' },
        { stageNo: 2, stageCode: 'MEDICAL_TRAINING', label: 'Course', dueDate: new Date('2098-05-15'), amountPaisa: 2000000, paidPaisa: 0, status: 'Pending' },
      ],
      invoiceJournalEntryId: invEntry._id,
      createdBy: 'QA',
    });
    createdPlanId = plan._id;

    // Collect 10,000 BDT via bKash -> should settle Stage 1 (5,000 Paid) and Stage 2 (5,000 Partial), sync Student cache, and post balanced RV to BKASH Dr / 1210 Cr!
    const res = await collectStudentReceipt({
      studentId: fakeStudent._id.toString(),
      amountPaisa: 1000000,
      method: 'bKash',
      reference: `BK-QA-${ts}`,
      receiptDate: '2098-05-02',
      user: qaUser,
    });
    createdReceiptId = res.receipt._id;
    createdEntryIds.push(res.entry._id as mongoose.Types.ObjectId);

    const refreshedStudent = await Student.findById(fakeStudent._id).lean();
    assert(
      res.receipt.journalEntryId.toString() === res.entry._id.toString() &&
        res.plan.totalPaidPaisa === 1000000 &&
        res.plan.totalDuePaisa === 1500000 &&
        res.plan.stages[0].status === 'Paid' &&
        res.plan.stages[1].status === 'Partial' &&
        refreshedStudent?.total_paid === 10000 &&
        refreshedStudent?.total_due === 15000,
      'collectStudentReceipt atomically posts RV journal, allocates across stages, and syncs read-only Student totals'
    );
  } finally {
    if (createdReceiptId) await MoneyReceipt.deleteMany({ _id: createdReceiptId });
    if (createdPlanId) await StudentFeePlan.deleteMany({ _id: createdPlanId });
    await Student.deleteMany({ _id: fakeStudent._id });
    if (createdEntryIds.length > 0) {
      await JournalLine.deleteMany({ entryId: { $in: createdEntryIds } });
      await JournalEntry.deleteMany({ _id: { $in: createdEntryIds } });
    }
    await VoucherSequence.deleteMany({ fiscalYearCode: 'FY2098' });
    await AccountingPeriod.deleteMany({ year: testFyYear });
    await FiscalYear.deleteMany({ code: 'FY2098' });
  }

  console.log('\n====================================================');
  console.log(`PHASE A TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Phase A test fatal error:', err);
  process.exit(1);
});
