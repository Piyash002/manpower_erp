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
import { ensureAccountsSeeded } from '../src/lib/accounts-seed';
import { Trade } from '../src/models/Trade';
import { CountryCost } from '../src/models/CountryCost';
import { Student } from '../src/models/Student';
import { Installment } from '../src/models/Installment';
import { Payment } from '../src/models/Payment';
import { FeeTemplate } from '../src/models/FeeTemplate';
import { StudentFeePlan, IStudentFeeStage } from '../src/models/StudentFeePlan';
import { MoneyReceipt } from '../src/models/MoneyReceipt';
import { formatPaisaBDT, takaToPaisa } from '../src/lib/accounts-money';
import { buildStagesFromTotals, allocatePaisaAcrossStages } from '../src/lib/accounts/fees';
import {
  getSystemAccountId,
  postTransactionEntry,
  resolveDepositSystemTag,
  runInTransaction,
} from '../src/lib/accounts/posting';

const DRY_RUN = process.argv.includes('--dry-run');
const SYSTEM_USER = { userId: 'migration', name: 'Accounts Fee Migration', username: 'system', role: 'Admin' };

function sanitizeCode(str: string) {
  return str
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 18);
}

async function main() {
  await connectDB();
  await ensureAccountsSeeded();

  console.log('====================================================');
  console.log(`DREAMS ERP - FEE MIGRATION TO ACCOUNTS (${DRY_RUN ? 'DRY RUN' : 'APPLY MODE'})`);
  console.log('====================================================\n');

  const [trades, countryCosts, students, installments, payments, lockedPeriods] = await Promise.all([
    Trade.find({}).sort({ name: 1 }).lean(),
    CountryCost.find({}).populate('trade_id', 'name admission_fee course_fee').lean(),
    Student.find({}).sort({ createdAt: 1 }).lean(),
    Installment.find({}).sort({ due_date: 1, installment_no: 1 }).lean(),
    Payment.find({}).sort({ payment_date: 1, createdAt: 1 }).lean(),
    (await import('../src/models/AccountingPeriod')).AccountingPeriod.find({ status: 'Locked' })
      .select('name year month')
      .lean(),
  ]);

  const instByStudent = new Map<string, any[]>();
  for (const inst of installments) {
    const k = inst.student_id.toString();
    if (!instByStudent.has(k)) instByStudent.set(k, []);
    instByStudent.get(k)!.push(inst);
  }

  const pmtByStudent = new Map<string, any[]>();
  for (const p of payments) {
    const k = p.student_id.toString();
    if (!pmtByStudent.has(k)) pmtByStudent.set(k, []);
    pmtByStudent.get(k)!.push(p);
  }

  let templatesToCreate = 0;
  let plansToCreate = 0;
  let receiptsToCreate = 0;
  let adjustmentsToCreate = 0;
  let totalBilledPaisa = 0;
  let totalReceiptsPaisa = 0;
  let totalAdjPaisa = 0;

  // 1. Migrate Trades & CountryCosts -> FeeTemplates
  for (const t of trades as any[]) {
    const key = `TRADE:${t._id}`;
    const exists = await FeeTemplate.findOne({ sourceLegacyKey: key, isDeleted: { $ne: true } }).lean();
    if (!exists) {
      templatesToCreate++;
      if (!DRY_RUN) {
        const stages = buildStagesFromTotals({
          admissionFeeTaka: t.admission_fee || 0,
          courseFeeTaka: t.course_fee || 0,
          visaCostTaka: 0,
          govtFeeTaka: 0,
        });
        await FeeTemplate.create({
          code: `TPL-TRD-${sanitizeCode(t.name)}-${String(t._id).slice(-4).toUpperCase()}`,
          name: `${t.name} (Course Base)`,
          tradeId: t._id,
          tradeName: t.name,
          country: 'All',
          stages,
          totalAmountPaisa: stages.reduce((s, st) => s + st.amountPaisa, 0),
          active: Boolean(t.active),
          sourceLegacyKey: key,
          createdBy: 'Migration',
        });
      }
    }
  }

  for (const cc of countryCosts as any[]) {
    const key = `COUNTRY:${cc._id}`;
    const exists = await FeeTemplate.findOne({ sourceLegacyKey: key, isDeleted: { $ne: true } }).lean();
    if (!exists) {
      templatesToCreate++;
      if (!DRY_RUN) {
        const tr: any = cc.trade_id || {};
        const stages = buildStagesFromTotals({
          admissionFeeTaka: tr.admission_fee || 0,
          courseFeeTaka: tr.course_fee || 0,
          visaCostTaka: cc.visa_cost || 0,
          govtFeeTaka: cc.govt_fee || 0,
          visaOffsetDays: cc.visa_days || 30,
        });
        await FeeTemplate.create({
          code: `TPL-${sanitizeCode(tr.name || 'TRD')}-${sanitizeCode(cc.country)}-${String(cc._id).slice(-4).toUpperCase()}`,
          name: `${tr.name || 'Trade'} — ${cc.country} Full Package`,
          tradeId: tr._id || null,
          tradeName: tr.name || 'General',
          country: cc.country,
          stages,
          totalAmountPaisa: stages.reduce((s, st) => s + st.amountPaisa, 0),
          active: true,
          sourceLegacyKey: key,
          createdBy: 'Migration',
        });
      }
    }
  }

  const receivableAccId = await getSystemAccountId('STUDENT_RECEIVABLE');
  const feeIncomeAccId = await getSystemAccountId('FEE_INCOME');
  const cashAccId = await getSystemAccountId('CASH');

  // 2. Migrate each Student -> StudentFeePlan + Invoice JV + MoneyReceipts + Historical Gap Adjustment
  for (const st of students as any[]) {
    const sid = st._id.toString();
    const stInsts = instByStudent.get(sid) || [];
    const stPmts = pmtByStudent.get(sid) || [];

    const payablePaisa = takaToPaisa(st.fee_snapshot?.total_payable || 0);
    const grossBilledPaisa = takaToPaisa(
      (st.fee_snapshot?.admission_fee || 0) +
        (st.fee_snapshot?.course_fee || 0) +
        (st.fee_snapshot?.visa_cost || 0) +
        (st.fee_snapshot?.govt_fee || 0)
    );
    const discountPaisa = takaToPaisa(st.fee_snapshot?.discount || 0);
    const studentTotalPaidPaisa = takaToPaisa(st.total_paid || 0);
    const sumPmtsPaisa = stPmts.reduce((s: number, p: any) => s + takaToPaisa(p.amount || 0), 0);
    const gapAdjPaisa = Math.max(0, studentTotalPaidPaisa - sumPmtsPaisa);

    totalBilledPaisa += payablePaisa;
    totalReceiptsPaisa += sumPmtsPaisa;
    totalAdjPaisa += gapAdjPaisa;

    const existingPlan = await StudentFeePlan.findOne({ studentId: st._id, isDeleted: { $ne: true } }).lean();
    if (!existingPlan) plansToCreate++;

    for (const p of stPmts) {
      const existingRec = await MoneyReceipt.findOne({
        legacyPaymentId: p._id,
        isDeleted: { $ne: true },
      }).lean();
      if (!existingRec) receiptsToCreate++;
    }
    if (gapAdjPaisa > 0) {
      const existingAdj = await MoneyReceipt.findOne({
        receiptNo: `MR-ADJ-${st.student_no}`.toUpperCase(),
        isDeleted: { $ne: true },
      }).lean();
      if (!existingAdj) adjustmentsToCreate++;
    }

    if (DRY_RUN) continue;

    await runInTransaction(async (session) => {
      let plan = await StudentFeePlan.findOne({ studentId: st._id, isDeleted: { $ne: true } }).session(
        session
      );

      if (!plan) {
        // Build clean stages totaling exact netPayablePaisa (historical paid + remaining installments)
        const stages: IStudentFeeStage[] = [];
        let stageNo = 1;
        const admDate = st.admission_date ? new Date(st.admission_date) : new Date(st.createdAt);

        const instTotalPaisa = stInsts.reduce((s: number, i: any) => s + takaToPaisa(i.amount || 0), 0);
        const initialBookingPaidPaisa = Math.max(0, payablePaisa - instTotalPaisa);

        if (initialBookingPaidPaisa > 0 || stInsts.length === 0) {
          stages.push({
            stageNo: stageNo++,
            stageCode: 'BOOKING',
            label: 'Admission / Initial Booking',
            dueDate: admDate,
            amountPaisa: stInsts.length === 0 ? payablePaisa : initialBookingPaidPaisa,
            paidPaisa: 0,
            status: 'Pending',
            paidAt: null,
          });
        }

        for (const inst of stInsts) {
          const amtPaisa = takaToPaisa(inst.amount || 0);
          stages.push({
            stageNo: stageNo++,
            stageCode: 'OTHER',
            label: `Installment #${inst.installment_no}`,
            dueDate: new Date(inst.due_date),
            amountPaisa: amtPaisa,
            paidPaisa: 0,
            status: 'Pending',
            paidAt: null,
          });
        }

        let invoiceEntryId: mongoose.Types.ObjectId | null = null;
        if (payablePaisa > 0) {
          const { entry } = await postTransactionEntry({
            journalType: 'JV',
            entryDate: admDate,
            description: `Migrated fee invoice for ${st.name} (${st.student_no})`,
            reference: st.student_no,
            sourceModule: 'FEE_INVOICE_MIGRATION',
            sourceId: st._id.toString(),
            idempotencyKey: `MIGRATE_PLAN:${st._id}`,
            session,
            user: SYSTEM_USER,
            lines: [
              {
                accountId: receivableAccId,
                description: `Student fee receivable (${st.student_no})`,
                debitPaisa: payablePaisa,
                creditPaisa: 0,
                branch: 'Main',
                department: 'Counseling',
                studentId: st._id.toString(),
              },
              {
                accountId: feeIncomeAccId,
                description: `Candidate fee billing (${st.trade_name})`,
                debitPaisa: 0,
                creditPaisa: payablePaisa,
                branch: 'Main',
                department: 'Counseling',
                studentId: st._id.toString(),
              },
            ],
          });
          invoiceEntryId = entry._id as mongoose.Types.ObjectId;
        }

        const [createdPlan] = await StudentFeePlan.create(
          [
            {
              planNo: `FP-${st.student_no}`,
              studentId: st._id,
              studentNo: st.student_no,
              templateId: null,
              tradeName: st.trade_name || '',
              destinationCountry: st.destination_country || 'Not decided yet',
              branch: 'Main',
              department: 'Counseling',
              totalBilledPaisa: Math.max(payablePaisa, grossBilledPaisa),
              discountPaisa,
              discountReason: discountPaisa > 0 ? 'Migrated admission discount' : '',
              discountApprovedBy: discountPaisa > 0 ? 'Admin (Legacy)' : '',
              netPayablePaisa: payablePaisa,
              totalPaidPaisa: 0,
              totalRefundedPaisa: 0,
              totalDuePaisa: payablePaisa,
              status: payablePaisa === 0 ? 'Paid' : 'Active',
              stages,
              invoiceJournalEntryId: invoiceEntryId,
              createdBy: 'Migration',
            },
          ],
          { session }
        );
        plan = createdPlan;
      }

      // Post each historical Payment -> MoneyReceipt + RV JournalEntry
      for (const p of stPmts) {
        const existingRec = await MoneyReceipt.findOne({
          legacyPaymentId: p._id,
          isDeleted: { $ne: true },
        }).session(session);
        if (existingRec) continue;

        const pAmountPaisa = takaToPaisa(p.amount || 0);
        if (pAmountPaisa <= 0) continue;

        const depositAccId = await getSystemAccountId(resolveDepositSystemTag(p.method || 'Cash'));
        const allocations = allocatePaisaAcrossStages(plan.stages, pAmountPaisa, null);

        const { entry: rvEntry } = await postTransactionEntry({
          journalType: 'RV',
          entryDate: p.payment_date || p.createdAt,
          description: `Migrated receipt ${p.receipt_no} from ${st.name} (${st.student_no})`,
          reference: p.receipt_no,
          sourceModule: 'FEE_RECEIPT_MIGRATION',
          sourceId: p._id.toString(),
          idempotencyKey: `MIGRATE_RECEIPT:${p._id}`,
          session,
          user: SYSTEM_USER,
          lines: [
            {
              accountId: depositAccId,
              description: `Historical ${p.method} (${p.receipt_no})`,
              debitPaisa: pAmountPaisa,
              creditPaisa: 0,
              branch: 'Main',
              department: 'Counseling',
              studentId: st._id.toString(),
            },
            {
              accountId: receivableAccId,
              description: `Settlement against ${st.student_no}`,
              debitPaisa: 0,
              creditPaisa: pAmountPaisa,
              branch: 'Main',
              department: 'Counseling',
              studentId: st._id.toString(),
            },
          ],
        });

        await MoneyReceipt.create(
          [
            {
              receiptNo: p.receipt_no,
              studentId: st._id,
              feePlanId: plan._id,
              amountPaisa: pAmountPaisa,
              method: p.method || 'Cash',
              depositAccountId: new mongoose.Types.ObjectId(depositAccId),
              reference: p.reference || '',
              receiptDate: p.payment_date || p.createdAt,
              note: p.note || 'Migrated from legacy Payment',
              branch: 'Main',
              department: 'Counseling',
              allocations,
              journalEntryId: rvEntry._id,
              legacyPaymentId: p._id,
              status: 'Posted',
              createdBy: p.created_by || 'Migration',
            },
          ],
          { session }
        );

        plan.totalPaidPaisa += pAmountPaisa;
        plan.totalDuePaisa = Math.max(0, plan.netPayablePaisa - plan.totalPaidPaisa);
      }

      // Reconcile unreceipted historical paid gap if Student.total_paid > sum(Payments)
      if (gapAdjPaisa > 0) {
        const adjReceiptNo = `MR-ADJ-${st.student_no}`.toUpperCase();
        const existingAdj = await MoneyReceipt.findOne({
          receiptNo: adjReceiptNo,
          isDeleted: { $ne: true },
        }).session(session);

        if (!existingAdj) {
          const allocations = allocatePaisaAcrossStages(plan.stages, gapAdjPaisa, null);
          const adjDate = st.admission_date ? new Date(st.admission_date) : new Date(st.createdAt);

          const { entry: adjEntry } = await postTransactionEntry({
            journalType: 'RV',
            entryDate: adjDate,
            description: `Legacy pre-Accounts paid balance reconciliation for ${st.student_no}`,
            reference: adjReceiptNo,
            sourceModule: 'FEE_RECEIPT_RECONCILIATION',
            sourceId: st._id.toString(),
            idempotencyKey: `MIGRATE_ADJ:${st._id}`,
            session,
            user: SYSTEM_USER,
            lines: [
              {
                accountId: cashAccId,
                description: `Unreceipted legacy collection (${st.student_no})`,
                debitPaisa: gapAdjPaisa,
                creditPaisa: 0,
                branch: 'Main',
                department: 'Counseling',
                studentId: st._id.toString(),
              },
              {
                accountId: receivableAccId,
                description: `Receivable reconciliation (${st.student_no})`,
                debitPaisa: 0,
                creditPaisa: gapAdjPaisa,
                branch: 'Main',
                department: 'Counseling',
                studentId: st._id.toString(),
              },
            ],
          });

          await MoneyReceipt.create(
            [
              {
                receiptNo: adjReceiptNo,
                studentId: st._id,
                feePlanId: plan._id,
                amountPaisa: gapAdjPaisa,
                method: 'Cash',
                depositAccountId: new mongoose.Types.ObjectId(cashAccId),
                reference: 'LEGACY-GAP-ADJ',
                receiptDate: adjDate,
                note: 'Historical paid-vs-receipts reconciliation',
                branch: 'Main',
                department: 'Counseling',
                allocations,
                journalEntryId: adjEntry._id,
                status: 'Posted',
                createdBy: 'Migration',
              },
            ],
            { session }
          );

          plan.totalPaidPaisa += gapAdjPaisa;
          plan.totalDuePaisa = Math.max(0, plan.netPayablePaisa - plan.totalPaidPaisa);
        }
      }

      if (plan.totalDuePaisa === 0) {
        plan.status = 'Paid';
      }
      await plan.save({ session });
    });
  }

  console.log('Migration Summary:');
  console.log(`- Fee Templates to create:        ${templatesToCreate}`);
  console.log(`- Student Fee Plans to create:    ${plansToCreate}`);
  console.log(`- Money Receipts (from Payments): ${receiptsToCreate} (${formatPaisaBDT(totalReceiptsPaisa)})`);
  console.log(`- Legacy Gap Reconciliations:     ${adjustmentsToCreate} (${formatPaisaBDT(totalAdjPaisa)})`);
  console.log(`- Total Billed (Receivable):      ${formatPaisaBDT(totalBilledPaisa)}`);
  console.log(`- Expected Receivable Closing:    ${formatPaisaBDT(totalBilledPaisa - totalReceiptsPaisa - totalAdjPaisa)}`);
  if (lockedPeriods.length > 0) {
    console.log(
      `⚠️  WARNING: Locked periods detected (${lockedPeriods
        .map((p: any) => p.name)
        .join(', ')}). Unlock in Accounts -> Periods before applying entries in those months.`
    );
  }
  console.log(DRY_RUN ? '\n[DRY RUN ONLY - NO CHANGES COMMITTED]' : '\n✅ MIGRATION APPLIED SUCCESSFULLY');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
