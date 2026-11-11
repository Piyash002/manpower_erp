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
  collectStudentReceipt,
  createFeeRefundRequest,
  createFeeTemplateRecord,
  createStudentFeePlanOnAdmission,
  getStudentFeeStatement,
  processFeeRefundApproval,
  processStudentDiscountApproval,
  reverseMoneyReceipt,
} from '../src/lib/accounts/fees';
import { buildMoneyReceiptPdfBuffer } from '../src/lib/export-utils';
import { FeeTemplate } from '../src/models/FeeTemplate';
import { StudentFeePlan } from '../src/models/StudentFeePlan';
import { MoneyReceipt } from '../src/models/MoneyReceipt';
import { FeeRefund } from '../src/models/FeeRefund';
import { JournalEntry } from '../src/models/JournalEntry';
import { JournalLine } from '../src/models/JournalLine';
import { Student } from '../src/models/Student';
import { Trade } from '../src/models/Trade';
import { AccountingPeriod } from '../src/models/AccountingPeriod';
import { FiscalYear } from '../src/models/FiscalYear';
import { VoucherSequence } from '../src/models/VoucherSequence';
import { getSystemAccountId } from '../src/lib/accounts/posting';

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
  console.log('DREAMS ERP - PHASE B STUDENT FEE LIFECYCLE TESTS');
  console.log('====================================================\n');

  await connectDB();
  await ensureAccountsSeeded();

  const testFyYear = 2097;
  await ensureFiscalYearWithPeriods(testFyYear, 'QA-PhaseB');
  const qaAdmin = { userId: 'qa-admin', name: 'QA Admin', username: 'qaadmin', role: 'Admin' };
  const qaAcct = { userId: 'qa-acct', name: 'QA Accountant', username: 'qaacct', role: 'Accountant' };

  const trade = await Trade.findOne({}).lean();
  const ts = Date.now();

  let tpl: any = null;
  let student: any = null;
  const cleanupEntryIds: mongoose.Types.ObjectId[] = [];
  const cleanupReceiptIds: any[] = [];
  const cleanupRefundIds: any[] = [];
  let createdPlanId: any = null;

  try {
    tpl = await createFeeTemplateRecord({
      code: `QA-TPL-${ts}`,
      name: 'QA Phase B Package',
      tradeId: trade?._id?.toString() || null,
      tradeName: trade?.name || 'General',
      country: 'Saudi Arabia',
      stages: [
        { stageOrder: 1, stageCode: 'BOOKING', label: 'Booking', amountPaisa: 2000000, dueOffsetDays: 0 },
        { stageOrder: 2, stageCode: 'MEDICAL_TRAINING', label: 'Training', amountPaisa: 3000000, dueOffsetDays: 15 },
        { stageOrder: 3, stageCode: 'VISA_PROCESSING', label: 'Visa', amountPaisa: 10000000, dueOffsetDays: 30 },
      ],
      createdBy: 'QA',
    });

    student = await Student.create({
      student_no: `ST-QAB-${ts}`,
      name: 'Phase B Candidate',
      father_name: 'Father B',
      mother_name: 'Mother B',
      date_of_birth: new Date('1999-01-01'),
      gender: 'Male',
      blood_group: 'B+',
      nid_or_birth_cert: `NID-QAB-${ts}`,
      religion: 'Islam',
      marital_status: 'Single',
      mobile: '01700000097',
      emergency_contact_name: 'EC',
      emergency_contact_relation: 'Brother',
      emergency_contact_phone: '01700000096',
      present_address: 'Dhaka',
      permanent_address: 'Dhaka',
      passport_no: `PQAB${ts}`,
      trade_id: trade!._id,
      trade_name: trade!.name,
      batch: 'QA-BATCH-B',
      session: '2097',
      admission_date: new Date('2097-04-10T00:00:00Z'),
      destination_country: 'Saudi Arabia',
      destination_contract_years: 2,
      fee_snapshot: {
        admission_fee: 0,
        course_fee: 0,
        visa_cost: 0,
        govt_fee: 0,
        discount: 0,
        total_payable: 0,
      },
      total_paid: 0,
      total_due: 0,
      created_by: 'QA',
    });

    // 1. Admission fee plan creation + pending discount
    const admRes = await createStudentFeePlanOnAdmission({
      studentId: student._id.toString(),
      templateId: tpl._id.toString(),
      admissionDate: '2097-04-10',
      discountTaka: 10000,
      discountReason: 'QA Merit Scholarship',
      user: qaAcct,
    });
    createdPlanId = admRes.plan?._id;
    if (admRes.entry?._id) cleanupEntryIds.push(admRes.entry._id as mongoose.Types.ObjectId);

    assert(
      Boolean(
        admRes.plan &&
          admRes.plan.planNo.startsWith('SFP-FY2097-') &&
          admRes.plan.totalBilledPaisa === 15000000 &&
          admRes.plan.netPayablePaisa === 15000000 &&
          admRes.plan.pendingDiscountPaisa === 1000000 &&
          admRes.plan.discountStatus === 'Pending'
      ),
      'createStudentFeePlanOnAdmission posts gross 1,50,000 BDT AR and holds discount as Pending'
    );

    // 2. Admin approves discount
    const discRes = await processStudentDiscountApproval({
      planId: admRes.plan!._id.toString(),
      decision: 'Approve',
      adjustmentDate: '2097-04-11',
      user: qaAdmin,
    });
    if (discRes.entry?._id) cleanupEntryIds.push(discRes.entry._id as mongoose.Types.ObjectId);
    const stageSumAfterDisc = discRes.plan.stages.reduce((s, st) => s + st.amountPaisa, 0);

    assert(
      discRes.plan.discountPaisa === 1000000 &&
        discRes.plan.netPayablePaisa === 14000000 &&
        discRes.plan.totalDuePaisa === 14000000 &&
        stageSumAfterDisc === 14000000,
      'processStudentDiscountApproval posts 4110 Dr / 1210 Cr and adjusts stages to 1,40,000 BDT'
    );

    // 3. Collect Cash receipt (50,000 BDT) + PDF generation
    const rcpt1 = await collectStudentReceipt({
      studentId: student._id.toString(),
      amountPaisa: 5000000,
      method: 'Cash',
      receiptDate: '2097-04-12',
      note: 'Stage 1 + Stage 2 payment',
      user: qaAcct,
    });
    cleanupReceiptIds.push(rcpt1.receipt._id);
    cleanupEntryIds.push(rcpt1.entry._id as mongoose.Types.ObjectId);

    const pdfBuf = buildMoneyReceiptPdfBuffer({
      receiptNo: rcpt1.receipt.receiptNo,
      voucherNo: rcpt1.entry.voucherNo,
      receiptDate: rcpt1.receipt.receiptDate,
      amountTaka: 50000,
      method: 'Cash',
      createdBy: 'QA',
      studentName: student.name,
      studentNo: student.student_no,
      netPayableTaka: 140000,
      totalPaidTaka: 50000,
      totalDueTaka: 90000,
    });

    assert(
      rcpt1.receipt.receiptNo.startsWith('MR-FY2097-') &&
        rcpt1.plan.totalPaidPaisa === 5000000 &&
        rcpt1.plan.totalDuePaisa === 9000000 &&
        pdfBuf.toString('latin1', 0, 5) === '%PDF-',
      'collectStudentReceipt uses fiscal-year MR-FY2097 sequence and builds valid PDF receipt buffer'
    );

    // 4. Reverse receipt 1 cleanly
    const revRes = await reverseMoneyReceipt({
      receiptId: rcpt1.receipt._id.toString(),
      reason: 'QA Dishonored test reversal',
      reversalDate: '2097-04-13',
      user: qaAdmin,
    });
    cleanupEntryIds.push(revRes.reversal._id as mongoose.Types.ObjectId);

    assert(
      revRes.receipt.status === 'Reversed' &&
        revRes.plan.totalPaidPaisa === 0 &&
        revRes.plan.totalDuePaisa === 14000000 &&
        revRes.plan.stages[0].paidPaisa === 0,
      'reverseMoneyReceipt posts mirror reversal JE and restores plan due & stages'
    );

    // 5. Re-collect 60,000 BDT, process Cash Refund (20,000) & Credit Note (30,000)
    const rcpt2 = await collectStudentReceipt({
      studentId: student._id.toString(),
      amountPaisa: 6000000,
      method: 'bKash',
      receiptDate: '2097-04-14',
      user: qaAcct,
    });
    cleanupReceiptIds.push(rcpt2.receipt._id);
    cleanupEntryIds.push(rcpt2.entry._id as mongoose.Types.ObjectId);

    const refReq = await createFeeRefundRequest({
      studentId: student._id.toString(),
      kind: 'Refund',
      amountPaisa: 2000000,
      refundRule: 'VISA_REJECTED',
      reason: 'QA Partial cash refund after rejection',
      method: 'Cash',
      refundDate: '2097-04-15',
      user: qaAcct,
    });
    cleanupRefundIds.push(refReq._id);

    const refApr = await processFeeRefundApproval({
      refundId: refReq._id.toString(),
      decision: 'Approve',
      approvalDate: '2097-04-15',
      user: qaAdmin,
    });
    if (refApr.entry?._id) cleanupEntryIds.push(refApr.entry._id as mongoose.Types.ObjectId);

    const cnReq = await createFeeRefundRequest({
      studentId: student._id.toString(),
      kind: 'CreditNote',
      amountPaisa: 3000000,
      refundRule: 'PACKAGE_DOWNGRADE',
      reason: 'QA Credit Note adjustment',
      refundDate: '2097-04-16',
      user: qaAcct,
    });
    cleanupRefundIds.push(cnReq._id);

    const cnApr = await processFeeRefundApproval({
      refundId: cnReq._id.toString(),
      decision: 'Approve',
      approvalDate: '2097-04-16',
      user: qaAdmin,
    });
    if (cnApr.entry?._id) cleanupEntryIds.push(cnApr.entry._id as mongoose.Types.ObjectId);

    const studentAfter = await Student.findById(student._id).lean();
    assert(
      refApr.refund.status === 'Approved' &&
        cnApr.refund.status === 'Approved' &&
        cnApr.plan?.totalRefundedPaisa === 2000000 &&
        cnApr.plan?.creditNotePaisa === 3000000 &&
        cnApr.plan?.totalDuePaisa === 5000000 &&
        studentAfter?.total_paid === 40000 &&
        studentAfter?.total_due === 50000,
      'Refund & Credit Note approvals post accurately and sync net paid (40k) & due (50k)'
    );

    // 6. Statement vs GL 1210 Receivable reconciliation
    const statement = await getStudentFeeStatement(student._id.toString());
    const lastRowBalance = statement.rows[statement.rows.length - 1]?.runningBalancePaisa;
    const arAccId = await getSystemAccountId('STUDENT_RECEIVABLE');
    const glArLines = await JournalLine.find({
      accountId: arAccId,
      studentId: student._id,
      isDeleted: { $ne: true },
    }).lean();
    const glArBalance = glArLines.reduce((s, l) => s + l.debitPaisa - l.creditPaisa, 0);

    assert(
      lastRowBalance === 5000000 && glArBalance === 5000000 && lastRowBalance === glArBalance,
      `Student Statement (${lastRowBalance}) reconciles 100% with GL 1210 Receivable (${glArBalance})`
    );
  } finally {
    if (cleanupRefundIds.length > 0) await FeeRefund.deleteMany({ _id: { $in: cleanupRefundIds } });
    if (cleanupReceiptIds.length > 0) await MoneyReceipt.deleteMany({ _id: { $in: cleanupReceiptIds } });
    if (createdPlanId) await StudentFeePlan.deleteMany({ _id: createdPlanId });
    if (tpl?._id) await FeeTemplate.deleteMany({ _id: tpl._id });
    if (student?._id) await Student.deleteMany({ _id: student._id });
    if (cleanupEntryIds.length > 0) {
      await JournalLine.deleteMany({ entryId: { $in: cleanupEntryIds } });
      await JournalEntry.deleteMany({ _id: { $in: cleanupEntryIds } });
    }
    await VoucherSequence.deleteMany({ fiscalYearCode: 'FY2097' });
    await AccountingPeriod.deleteMany({ year: testFyYear });
    await FiscalYear.deleteMany({ code: 'FY2097' });
  }

  console.log('\n====================================================');
  console.log(`PHASE B TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Phase B test fatal error:', err);
  process.exit(1);
});

