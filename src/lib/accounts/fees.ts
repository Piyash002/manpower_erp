import mongoose from 'mongoose';
import { FeeTemplate, IFeeTemplateStage } from '@/models/FeeTemplate';
import { StudentFeePlan, IStudentFeeStage } from '@/models/StudentFeePlan';
import { MoneyReceipt } from '@/models/MoneyReceipt';
import { FeeRefund, type RefundKind, type RefundRuleCode } from '@/models/FeeRefund';
import { FiscalYear } from '@/models/FiscalYear';
import { JournalEntry } from '@/models/JournalEntry';
import { Account } from '@/models/Account';
import { Student } from '@/models/Student';
import { AuditLog } from '@/models/AuditLog';
import { VoucherSequence } from '@/models/VoucherSequence';
import {
  getSystemAccountId,
  postTransactionEntry,
  resolveDepositSystemTag,
  resolveOpenPeriodForDate,
  reverseJournalEntry,
  runInTransaction,
} from '@/lib/accounts/posting';
import { ensureAccountsSeeded } from '@/lib/accounts-seed';
import { connectDB } from '@/lib/db';
import { takaToPaisa, paisaToTaka } from '@/lib/accounts-money';
import type { PaymentMethod } from '@/models/Payment';

async function resolveFiscalCodeLoose(date: Date, session?: mongoose.ClientSession) {
  const fy = await FiscalYear.findOne({
    startDate: { $lte: date },
    endDate: { $gte: date },
    isDeleted: { $ne: true },
  }).session(session || null);
  return fy?.code || `FY${date.getUTCFullYear()}`;
}

async function nextFiscalSeriesId(
  prefix: string,
  fiscalYearCode: string,
  seriesTag: string,
  journalType: 'JV' | 'RV' | 'PV' | 'CV',
  session: mongoose.ClientSession
) {
  const seriesKey = `${fiscalYearCode}:${seriesTag}`.toUpperCase();
  const doc = await VoucherSequence.findOneAndUpdate(
    { seriesKey },
    {
      $inc: { lastSeq: 1 },
      $setOnInsert: { fiscalYearCode, journalType },
    },
    { returnDocument: 'after', upsert: true, session }
  );
  const seq = doc?.lastSeq || 1;
  return `${prefix}-${fiscalYearCode}-${String(seq).padStart(5, '0')}`;
}

/**
 * Recompute stage statuses & totals cleanly in integer paisa.
 */
export function allocatePaisaAcrossStages(
  stages: IStudentFeeStage[],
  incomingPaisa: number,
  targetStageNo?: number | null
): Array<{ stageNo: number; label: string; amountPaisa: number }> {
  let remaining = Math.max(0, Math.round(incomingPaisa));
  const allocations: Array<{ stageNo: number; label: string; amountPaisa: number }> = [];

  const orderedIndices = stages
    .map((_, idx) => idx)
    .sort((a, b) => {
      if (targetStageNo) {
        if (stages[a].stageNo === targetStageNo) return -1;
        if (stages[b].stageNo === targetStageNo) return 1;
      }
      return stages[a].stageNo - stages[b].stageNo;
    });

  for (const idx of orderedIndices) {
    if (remaining <= 0) break;
    const st = stages[idx];
    const dueOnStage = Math.max(0, (st.amountPaisa || 0) - (st.paidPaisa || 0));
    if (dueOnStage <= 0) continue;

    const alloc = Math.min(remaining, dueOnStage);
    st.paidPaisa = (st.paidPaisa || 0) + alloc;
    remaining -= alloc;

    if (st.paidPaisa >= st.amountPaisa) {
      st.status = 'Paid';
      st.paidAt = new Date();
    } else if (st.paidPaisa > 0) {
      st.status = 'Partial';
    }
    allocations.push({ stageNo: st.stageNo, label: st.label, amountPaisa: alloc });
  }

  return allocations;
}

/**
 * Single authoritative service to collect a student receipt, post RV journal
 * (Deposit Cash/Bank/bKash/Nagad Dr / Student Fee Receivable 1210 Cr),
 * allocate across StudentFeePlan stages, and sync read-only Student cache totals.
 */
export async function collectStudentReceipt(params: {
  studentId: string;
  amountPaisa: number;
  method: PaymentMethod;
  depositAccountId?: string;
  reference?: string;
  bankName?: string;
  chequeNo?: string;
  chequeDate?: Date | string;
  proofUrl?: string;
  receiptDate?: Date | string;
  note?: string;
  targetStageNo?: number | null;
  branch?: string;
  department?: string;
  idempotencyKey?: string;
  user: { userId?: string; name?: string; username?: string; role?: string };
}) {
  await connectDB();
  await ensureAccountsSeeded();

  const amountPaisa = Math.round(Number(params.amountPaisa || 0));
  if (!Number.isInteger(amountPaisa) || amountPaisa <= 0) {
    throw new Error('Receipt amount must be a positive integer value in paisa.');
  }

  const rDate = params.receiptDate ? new Date(params.receiptDate) : new Date();
  if (Number.isNaN(rDate.getTime())) {
    throw new Error('Invalid receipt date.');
  }

  let parsedChequeDate: Date | null = null;
  if (params.chequeDate) {
    parsedChequeDate = new Date(params.chequeDate);
    if (Number.isNaN(parsedChequeDate.getTime())) {
      throw new Error('Invalid cheque date.');
    }
  }

  const cleanBankName = params.bankName?.trim() || '';
  const cleanChequeNo = params.chequeNo?.trim() || '';
  const cleanProofUrl = params.proofUrl?.trim() || '';
  const cleanReference = params.reference?.trim() || cleanChequeNo || '';

  const branch = params.branch?.trim() || 'Main';
  const department = params.department?.trim() || 'Counseling';
  const actor = params.user?.name || params.user?.username || 'System';

  return runInTransaction(async (session) => {
    const plan = await StudentFeePlan.findOne({
      studentId: params.studentId,
      isDeleted: { $ne: true },
    }).session(session);
    if (!plan) {
      throw new Error('No Student Fee Plan exists for this student in Accounts.');
    }
    if (amountPaisa > plan.totalDuePaisa) {
      throw new Error(
        `Receipt amount (${paisaToTaka(amountPaisa)} BDT) exceeds remaining due balance (${paisaToTaka(plan.totalDuePaisa)} BDT).`
      );
    }

    const student = await Student.findById(params.studentId).session(session);
    if (!student) {
      throw new Error('Student not found.');
    }

    let depositAccId = params.depositAccountId?.trim() || '';
    if (depositAccId) {
      if (!mongoose.Types.ObjectId.isValid(depositAccId)) {
        throw new Error('Invalid deposit account ID.');
      }
      const chosenAcc = await Account.findOne({
        _id: depositAccId,
        active: true,
        isGroup: false,
        type: 'Asset',
        isDeleted: { $ne: true },
      }).session(session);
      if (!chosenAcc) {
        throw new Error('Deposit account must be an active non-group Asset account.');
      }
      depositAccId = chosenAcc._id.toString();
    } else {
      depositAccId = await getSystemAccountId(resolveDepositSystemTag(params.method));
    }

    const receivableAccId = await getSystemAccountId('STUDENT_RECEIVABLE');
    const { fiscalYearCode } = await resolveOpenPeriodForDate(rDate, session);
    const receiptNo = await nextFiscalSeriesId('MR', fiscalYearCode, 'ACCOUNTS_MR', 'RV', session);
    const idemKey = params.idempotencyKey || `RECEIPT:${receiptNo}`;

    const allocations = allocatePaisaAcrossStages(plan.stages, amountPaisa, params.targetStageNo);
    const bankDetailLabel = [
      cleanBankName ? `Bank: ${cleanBankName}` : '',
      cleanChequeNo ? `Cheque/Ref: ${cleanChequeNo}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    const { entry } = await postTransactionEntry({
      journalType: 'RV',
      entryDate: rDate,
      description: `Student fee receipt ${receiptNo} from ${student.name} (${student.student_no}) via ${params.method}${bankDetailLabel ? ` [${bankDetailLabel}]` : ''}`,
      reference: cleanReference || receiptNo,
      sourceModule: 'FEE_RECEIPT',
      sourceId: receiptNo,
      idempotencyKey: idemKey,
      session,
      user: params.user,
      lines: [
        {
          accountId: depositAccId,
          description: `Received via ${params.method} (${receiptNo})${bankDetailLabel ? ` — ${bankDetailLabel}` : ''}`,
          debitPaisa: amountPaisa,
          creditPaisa: 0,
          branch,
          department,
          studentId: student._id.toString(),
          agentId: student.referred_by_agent ? student.referred_by_agent.toString() : null,
        },
        {
          accountId: receivableAccId,
          description: `Receivable settlement for ${student.student_no}`,
          debitPaisa: 0,
          creditPaisa: amountPaisa,
          branch,
          department,
          studentId: student._id.toString(),
          agentId: student.referred_by_agent ? student.referred_by_agent.toString() : null,
        },
      ],
    });

    const [receipt] = await MoneyReceipt.create(
      [
        {
          receiptNo,
          studentId: student._id,
          feePlanId: plan._id,
          amountPaisa,
          method: params.method,
          depositAccountId: new mongoose.Types.ObjectId(depositAccId),
          reference: cleanReference,
          bankName: cleanBankName,
          chequeNo: cleanChequeNo,
          chequeDate: parsedChequeDate,
          proofUrl: cleanProofUrl,
          receiptDate: rDate,
          note: params.note?.trim() || '',
          branch,
          department,
          allocations,
          journalEntryId: entry._id,
          status: 'Posted',
          createdBy: actor,
        },
      ],
      { session }
    );

    plan.totalPaidPaisa += amountPaisa;
    plan.totalDuePaisa = Math.max(0, plan.netPayablePaisa - plan.totalPaidPaisa);
    if (plan.totalDuePaisa === 0) {
      plan.status = 'Paid';
      for (const s of plan.stages) {
        if (s.status !== 'Paid') {
          s.status = 'Paid';
          s.paidAt = s.paidAt || new Date();
        }
      }
    }
    await plan.save({ session });

    // Keep Admission read-only summary cache synchronized cleanly
    const netCollected = Math.max(0, plan.totalPaidPaisa - (plan.totalRefundedPaisa || 0));
    student.total_paid = paisaToTaka(netCollected);
    student.total_due = paisaToTaka(plan.totalDuePaisa);
    await student.save({ session });

    await AuditLog.create(
      [
        {
          userId: params.user?.userId || 'system',
          userName: actor,
          userRole: params.user?.role || 'System',
          action: 'ACCOUNTS_RECEIPT_POSTED',
          entity: 'MoneyReceipt',
          entityId: receipt._id.toString(),
          newValues: {
            receiptNo,
            voucherNo: entry.voucherNo,
            studentNo: student.student_no,
            amountPaisa,
            method: params.method,
            bankName: cleanBankName || undefined,
            chequeNo: cleanChequeNo || undefined,
            proofUrl: cleanProofUrl || undefined,
          },
          timestamp: new Date(),
        },
      ],
      { session }
    );

    return { receipt, entry, plan };
  });
}

export function buildStagesFromTotals(params: {
  admissionFeeTaka: number;
  courseFeeTaka: number;
  visaCostTaka: number;
  govtFeeTaka: number;
  visaOffsetDays?: number;
}): IFeeTemplateStage[] {
  const raw: Array<Omit<IFeeTemplateStage, 'stageOrder'>> = [];
  if (params.admissionFeeTaka > 0) {
    raw.push({
      stageCode: 'BOOKING',
      label: 'Admission & Booking Fee',
      amountPaisa: takaToPaisa(params.admissionFeeTaka),
      dueOffsetDays: 0,
    });
  }
  if (params.courseFeeTaka > 0) {
    raw.push({
      stageCode: 'MEDICAL_TRAINING',
      label: 'Training & Course Fee',
      amountPaisa: takaToPaisa(params.courseFeeTaka),
      dueOffsetDays: 15,
    });
  }
  if (params.visaCostTaka > 0) {
    raw.push({
      stageCode: 'VISA_PROCESSING',
      label: 'Visa Processing Charge',
      amountPaisa: takaToPaisa(params.visaCostTaka),
      dueOffsetDays: params.visaOffsetDays || 30,
    });
  }
  if (params.govtFeeTaka > 0) {
    raw.push({
      stageCode: 'SERVICE_CHARGE',
      label: 'Government & Biometric Fees',
      amountPaisa: takaToPaisa(params.govtFeeTaka),
      dueOffsetDays: params.visaOffsetDays || 30,
    });
  }
  return raw.map((s, idx) => ({ ...s, stageOrder: idx + 1 }));
}

export async function createFeeTemplateRecord(params: {
  code: string;
  name: string;
  tradeId?: string | null;
  tradeName?: string;
  country?: string;
  stages: IFeeTemplateStage[];
  createdBy?: string;
}) {
  const totalAmountPaisa = params.stages.reduce((s, st) => s + st.amountPaisa, 0);
  return FeeTemplate.create({
    code: params.code.toUpperCase(),
    name: params.name,
    tradeId: params.tradeId ? new mongoose.Types.ObjectId(params.tradeId) : null,
    tradeName: params.tradeName || 'General',
    country: params.country || 'All',
    stages: params.stages,
    totalAmountPaisa,
    active: true,
    isDeleted: false,
    createdBy: params.createdBy || 'System',
  });
}

function addDaysUtc(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(days)));
  return d;
}

/**
 * Reduce unpaid stages (starting from the last stage backwards) so stage totals
 * always match `plan.netPayablePaisa` and `plan.totalDuePaisa` down to 1 paisa.
 */
function deductCreditFromUnpaidStages(stages: IStudentFeeStage[], creditPaisa: number) {
  let rem = Math.max(0, Math.round(creditPaisa));
  for (let i = stages.length - 1; i >= 0 && rem > 0; i--) {
    const st = stages[i];
    const unpaid = Math.max(0, (st.amountPaisa || 0) - (st.paidPaisa || 0));
    if (unpaid <= 0) continue;
    const take = Math.min(rem, unpaid);
    st.amountPaisa -= take;
    rem -= take;
    if (st.paidPaisa >= st.amountPaisa) {
      st.status = 'Paid';
      st.paidAt = st.paidAt || new Date();
    } else if (st.paidPaisa > 0) {
      st.status = 'Partial';
    } else {
      st.status = 'Pending';
    }
  }
  if (rem > 0) {
    throw new Error('Credit reduction exceeds unpaid stage balances.');
  }
}

/**
 * Create a Student Fee Plan in Accounts on admission (or manual Accounts assignment),
 * posting gross receivable (`1210 Student Fee Receivable Dr / 4110 Fee Income Cr`).
 * Any discount requested on admission is stored as a Pending discount request for Admin approval.
 */
export async function createStudentFeePlanOnAdmission(params: {
  studentId: string;
  templateId?: string | null;
  branch?: string;
  department?: string;
  tradeName?: string;
  destinationCountry?: string;
  admissionDate?: Date | string;
  fallbackFeeTotals?: {
    admissionFeeTaka?: number;
    courseFeeTaka?: number;
    visaCostTaka?: number;
    govtFeeTaka?: number;
  };
  discountTaka?: number;
  discountReason?: string;
  idempotencyKey?: string;
  session?: mongoose.ClientSession;
  user: { userId?: string; name?: string; username?: string; role?: string };
}) {
  await connectDB();
  await ensureAccountsSeeded();

  const branch = params.branch?.trim() || 'Main';
  const department = params.department?.trim() || 'Counseling';
  const actor = params.user?.name || params.user?.username || 'System';

  const execute = async (session: mongoose.ClientSession) => {
    const existing = await StudentFeePlan.findOne({
      studentId: params.studentId,
      isDeleted: { $ne: true },
    }).session(session);
    if (existing) {
      return { plan: existing, entry: null, duplicate: true, skipped: false };
    }

    const student = await Student.findById(params.studentId).session(session);
    if (!student) {
      throw new Error('Student not found.');
    }

    const baseDate = params.admissionDate
      ? new Date(params.admissionDate)
      : student.admission_date
      ? new Date(student.admission_date)
      : new Date();
    if (Number.isNaN(baseDate.getTime())) {
      throw new Error('Invalid admission date for fee plan creation.');
    }

    let tplDoc = null;
    if (params.templateId) {
      tplDoc = await FeeTemplate.findOne({
        _id: params.templateId,
        isDeleted: { $ne: true },
      }).session(session);
      if (!tplDoc) {
        throw new Error('Selected Fee Template not found in Accounts.');
      }
    }

    let templateStages: IFeeTemplateStage[] = [];
    if (tplDoc && Array.isArray(tplDoc.stages) && tplDoc.stages.length > 0) {
      templateStages = [...tplDoc.stages].sort((a, b) => a.stageOrder - b.stageOrder);
    } else if (params.fallbackFeeTotals) {
      templateStages = buildStagesFromTotals({
        admissionFeeTaka: Number(params.fallbackFeeTotals.admissionFeeTaka || 0),
        courseFeeTaka: Number(params.fallbackFeeTotals.courseFeeTaka || 0),
        visaCostTaka: Number(params.fallbackFeeTotals.visaCostTaka || 0),
        govtFeeTaka: Number(params.fallbackFeeTotals.govtFeeTaka || 0),
      });
    }

    const totalBilledPaisa = templateStages.reduce((s, st) => s + Math.round(st.amountPaisa || 0), 0);
    if (totalBilledPaisa <= 0) {
      return { plan: null, entry: null, duplicate: false, skipped: true };
    }

    const planStages: IStudentFeeStage[] = templateStages.map((st, idx) => ({
      stageNo: idx + 1,
      stageCode: st.stageCode || 'OTHER',
      label: st.label,
      dueDate: addDaysUtc(baseDate, st.dueOffsetDays || 0),
      amountPaisa: Math.round(st.amountPaisa),
      paidPaisa: 0,
      status: 'Pending',
      paidAt: null,
    }));

    const { fiscalYearCode } = await resolveOpenPeriodForDate(baseDate, session);
    const planNo = await nextFiscalSeriesId('SFP', fiscalYearCode, 'ACCOUNTS_SFP', 'JV', session);

    const receivableAccId = await getSystemAccountId('STUDENT_RECEIVABLE');
    const feeIncomeAccId = await getSystemAccountId('FEE_INCOME');

    const { entry } = await postTransactionEntry({
      journalType: 'JV',
      entryDate: baseDate,
      description: `Student fee receivable accrued (${planNo}) for ${student.name} (${student.student_no})`,
      reference: planNo,
      sourceModule: 'STUDENT_ADMISSION',
      sourceId: student._id.toString(),
      idempotencyKey: params.idempotencyKey || `FEE_PLAN:${student._id.toString()}`,
      session,
      user: params.user,
      lines: [
        {
          accountId: receivableAccId,
          description: `Fee receivable ${planNo} (${student.student_no})`,
          debitPaisa: totalBilledPaisa,
          creditPaisa: 0,
          branch,
          department,
          studentId: student._id.toString(),
          agentId: student.referred_by_agent ? student.referred_by_agent.toString() : null,
        },
        {
          accountId: feeIncomeAccId,
          description: `Training & service fee recognized (${planNo})`,
          debitPaisa: 0,
          creditPaisa: totalBilledPaisa,
          branch,
          department,
          studentId: student._id.toString(),
          agentId: student.referred_by_agent ? student.referred_by_agent.toString() : null,
        },
      ],
    });

    const requestedDiscPaisa = params.discountTaka ? takaToPaisa(params.discountTaka) : 0;
    const clampedPendingDisc = Math.min(Math.max(0, requestedDiscPaisa), totalBilledPaisa);
    const hasPendingDisc = clampedPendingDisc > 0;

    const [plan] = await StudentFeePlan.create(
      [
        {
          planNo,
          studentId: student._id,
          studentNo: student.student_no,
          templateId: tplDoc ? tplDoc._id : null,
          tradeName: params.tradeName || tplDoc?.tradeName || student.trade_name || '',
          destinationCountry:
            params.destinationCountry ||
            tplDoc?.country ||
            student.destination_country ||
            'Not decided yet',
          branch,
          department,
          totalBilledPaisa,
          discountPaisa: 0,
          discountReason: '',
          discountApprovedBy: '',
          pendingDiscountPaisa: hasPendingDisc ? clampedPendingDisc : 0,
          pendingDiscountReason: hasPendingDisc
            ? String(params.discountReason || '').trim() || 'Requested on admission'
            : '',
          pendingDiscountRequestedBy: hasPendingDisc ? actor : '',
          discountStatus: hasPendingDisc ? 'Pending' : 'None',
          creditNotePaisa: 0,
          netPayablePaisa: totalBilledPaisa,
          totalPaidPaisa: 0,
          totalRefundedPaisa: 0,
          totalDuePaisa: totalBilledPaisa,
          status: 'Active',
          stages: planStages,
          invoiceJournalEntryId: entry._id,
          isDeleted: false,
          createdBy: actor,
        },
      ],
      { session }
    );

    student.total_paid = 0;
    student.total_due = paisaToTaka(plan.totalDuePaisa);
    await student.save({ session });

    await AuditLog.create(
      [
        {
          userId: params.user?.userId || 'system',
          userName: actor,
          userRole: params.user?.role || 'System',
          action: 'STUDENT_FEE_PLAN_CREATED',
          entity: 'StudentFeePlan',
          entityId: plan._id.toString(),
          newValues: {
            planNo,
            voucherNo: entry.voucherNo,
            studentNo: student.student_no,
            templateId: tplDoc?._id?.toString() || null,
            totalBilledPaisa,
            pendingDiscountPaisa: hasPendingDisc ? clampedPendingDisc : 0,
          },
          timestamp: new Date(),
        },
      ],
      { session }
    );

    return { plan, entry, duplicate: false, skipped: false };
  };

  return params.session ? execute(params.session) : runInTransaction(execute);
}

/**
 * Request a student fee discount/waiver (stored as Pending until Admin approves).
 */
export async function requestStudentDiscount(params: {
  planId: string;
  discountPaisa: number;
  reason: string;
  user: { userId?: string; name?: string; username?: string; role?: string };
}) {
  await connectDB();
  const discountPaisa = Math.round(Number(params.discountPaisa || 0));
  const reason = String(params.reason || '').trim();
  if (!Number.isInteger(discountPaisa) || discountPaisa <= 0) {
    throw new Error('Discount amount must be greater than zero.');
  }
  if (reason.length < 3) {
    throw new Error('A clear discount reason (minimum 3 characters) is required.');
  }

  const plan = await StudentFeePlan.findOne({ _id: params.planId, isDeleted: { $ne: true } });
  if (!plan) {
    throw new Error('Student Fee Plan not found.');
  }
  if (plan.discountStatus === 'Pending') {
    throw new Error('A discount request is already pending Admin review on this fee plan.');
  }
  if (discountPaisa > plan.totalDuePaisa) {
    throw new Error(
      `Requested discount (${paisaToTaka(discountPaisa)} BDT) exceeds remaining due (${paisaToTaka(plan.totalDuePaisa)} BDT). Use a Refund instead.`
    );
  }

  const actor = params.user?.name || params.user?.username || 'System';
  plan.pendingDiscountPaisa = discountPaisa;
  plan.pendingDiscountReason = reason;
  plan.pendingDiscountRequestedBy = actor;
  plan.discountStatus = 'Pending';
  await plan.save();

  await AuditLog.create({
    userId: params.user?.userId || 'system',
    userName: actor,
    userRole: params.user?.role || 'System',
    action: 'STUDENT_DISCOUNT_REQUESTED',
    entity: 'StudentFeePlan',
    entityId: plan._id.toString(),
    newValues: {
      planNo: plan.planNo,
      pendingDiscountPaisa: discountPaisa,
      reason,
    },
    timestamp: new Date(),
  });

  return plan;
}

/**
 * Admin approves or rejects a pending discount request.
 * Approval posts a Journal Entry: 4110 Fee Income Dr / 1210 Student Fee Receivable Cr.
 */
export async function processStudentDiscountApproval(params: {
  planId: string;
  decision: 'Approve' | 'Reject';
  rejectionReason?: string;
  adjustmentDate?: Date | string;
  user: { userId?: string; name?: string; username?: string; role?: string };
}) {
  await connectDB();
  await ensureAccountsSeeded();

  const actor = params.user?.name || params.user?.username || 'System';

  return runInTransaction(async (session) => {
    const plan = await StudentFeePlan.findOne({ _id: params.planId, isDeleted: { $ne: true } }).session(
      session
    );
    if (!plan) {
      throw new Error('Student Fee Plan not found.');
    }
    if (plan.discountStatus !== 'Pending' || !plan.pendingDiscountPaisa || plan.pendingDiscountPaisa <= 0) {
      throw new Error('No pending discount request exists on this fee plan.');
    }

    const disc = Math.round(plan.pendingDiscountPaisa);
    const reason = plan.pendingDiscountReason || 'Approved fee discount';

    if (params.decision === 'Reject') {
      plan.discountStatus = 'Rejected';
      plan.pendingDiscountPaisa = 0;
      plan.pendingDiscountReason = params.rejectionReason?.trim() || reason;
      await plan.save({ session });

      await AuditLog.create(
        [
          {
            userId: params.user?.userId || 'system',
            userName: actor,
            userRole: params.user?.role || 'System',
            action: 'STUDENT_DISCOUNT_REJECTED',
            entity: 'StudentFeePlan',
            entityId: plan._id.toString(),
            newValues: { planNo: plan.planNo, rejectedPaisa: disc, rejectionReason: params.rejectionReason || '' },
            timestamp: new Date(),
          },
        ],
        { session }
      );

      return { plan, entry: null };
    }

    if (disc > plan.totalDuePaisa) {
      throw new Error(
        `Cannot approve discount (${paisaToTaka(disc)} BDT): exceeds current remaining due (${paisaToTaka(plan.totalDuePaisa)} BDT).`
      );
    }

    const student = await Student.findById(plan.studentId).session(session);
    if (!student) {
      throw new Error('Linked student record not found.');
    }

    const adjDate = params.adjustmentDate ? new Date(params.adjustmentDate) : new Date();
    const feeIncomeAccId = await getSystemAccountId('FEE_INCOME');
    const receivableAccId = await getSystemAccountId('STUDENT_RECEIVABLE');

    const { entry } = await postTransactionEntry({
      journalType: 'JV',
      entryDate: adjDate,
      description: `Fee discount approved for ${student.name} (${plan.planNo}): ${reason}`,
      reference: plan.planNo,
      sourceModule: 'FEE_DISCOUNT',
      sourceId: plan._id.toString(),
      idempotencyKey: `DISCOUNT:${plan._id.toString()}:${plan.discountPaisa + disc}`,
      session,
      user: params.user,
      lines: [
        {
          accountId: feeIncomeAccId,
          description: `Fee discount granted (${plan.planNo})`,
          debitPaisa: disc,
          creditPaisa: 0,
          branch: plan.branch,
          department: plan.department,
          studentId: student._id.toString(),
          agentId: student.referred_by_agent ? student.referred_by_agent.toString() : null,
        },
        {
          accountId: receivableAccId,
          description: `Receivable reduction from discount (${plan.planNo})`,
          debitPaisa: 0,
          creditPaisa: disc,
          branch: plan.branch,
          department: plan.department,
          studentId: student._id.toString(),
          agentId: student.referred_by_agent ? student.referred_by_agent.toString() : null,
        },
      ],
    });

    deductCreditFromUnpaidStages(plan.stages, disc);

    plan.discountPaisa = (plan.discountPaisa || 0) + disc;
    plan.discountReason = plan.discountReason ? `${plan.discountReason}; ${reason}` : reason;
    plan.discountApprovedBy = actor;
    plan.discountStatus = 'Approved';
    plan.discountJournalEntryId = entry._id;
    plan.pendingDiscountPaisa = 0;
    plan.netPayablePaisa = Math.max(
      0,
      plan.totalBilledPaisa - plan.discountPaisa - (plan.creditNotePaisa || 0)
    );
    plan.totalDuePaisa = Math.max(0, plan.netPayablePaisa - plan.totalPaidPaisa);
    if (plan.totalDuePaisa === 0 && plan.status === 'Active') {
      plan.status = 'Paid';
    }
    await plan.save({ session });

    student.total_due = paisaToTaka(plan.totalDuePaisa);
    await student.save({ session });

    await AuditLog.create(
      [
        {
          userId: params.user?.userId || 'system',
          userName: actor,
          userRole: params.user?.role || 'System',
          action: 'STUDENT_DISCOUNT_APPROVED',
          entity: 'StudentFeePlan',
          entityId: plan._id.toString(),
          newValues: {
            planNo: plan.planNo,
            voucherNo: entry.voucherNo,
            discountPaisa: disc,
            newDuePaisa: plan.totalDuePaisa,
          },
          timestamp: new Date(),
        },
      ],
      { session }
    );

    return { plan, entry };
  });
}

/**
 * Reverse a posted MoneyReceipt cleanly (Admin only).
 * Creates a mirror reversal Journal Entry inside the same transaction and restores stage & plan dues.
 */
export async function reverseMoneyReceipt(params: {
  receiptId: string;
  reason: string;
  reversalDate?: Date | string;
  user: { userId?: string; name?: string; username?: string; role?: string };
}) {
  await connectDB();
  await ensureAccountsSeeded();

  const reason = String(params.reason || '').trim();
  if (reason.length < 3) {
    throw new Error('A clear reversal reason (minimum 3 characters) is required.');
  }
  const actor = params.user?.name || params.user?.username || 'System';

  return runInTransaction(async (session) => {
    const receipt = await MoneyReceipt.findOne({
      _id: params.receiptId,
      isDeleted: { $ne: true },
    }).session(session);
    if (!receipt) {
      throw new Error('Money Receipt not found.');
    }
    if (receipt.status === 'Reversed') {
      throw new Error(`Receipt ${receipt.receiptNo} is already reversed.`);
    }

    const plan = await StudentFeePlan.findById(receipt.feePlanId).session(session);
    if (!plan) {
      throw new Error('Linked Student Fee Plan not found.');
    }
    const netCollected = plan.totalPaidPaisa - (plan.totalRefundedPaisa || 0);
    if (receipt.amountPaisa > netCollected) {
      throw new Error(
        `Cannot reverse ${receipt.receiptNo}: ${paisaToTaka(plan.totalRefundedPaisa || 0)} BDT has already been refunded out of collected funds.`
      );
    }

    const student = await Student.findById(receipt.studentId).session(session);
    if (!student) {
      throw new Error('Linked student record not found.');
    }

    const { reversal } = await reverseJournalEntry({
      entryId: receipt.journalEntryId.toString(),
      reason: `Receipt ${receipt.receiptNo} reversed: ${reason}`,
      reversalDate: params.reversalDate,
      session,
      user: params.user,
    });

    // Roll back stage allocations
    let remainingToRollback = receipt.amountPaisa;
    if (Array.isArray(receipt.allocations) && receipt.allocations.length > 0) {
      for (const alloc of receipt.allocations) {
        const st = plan.stages.find((s) => s.stageNo === alloc.stageNo);
        if (st && remainingToRollback > 0) {
          const rollback = Math.min(alloc.amountPaisa, st.paidPaisa, remainingToRollback);
          st.paidPaisa -= rollback;
          remainingToRollback -= rollback;
          if (st.paidPaisa <= 0) {
            st.paidPaisa = 0;
            st.status = 'Pending';
            st.paidAt = null;
          } else if (st.paidPaisa < st.amountPaisa) {
            st.status = 'Partial';
            st.paidAt = null;
          }
        }
      }
    }
    // Fallback reverse from highest paid stage if allocations didn't cover legacy records
    for (let i = plan.stages.length - 1; i >= 0 && remainingToRollback > 0; i--) {
      const st = plan.stages[i];
      if (st.paidPaisa > 0) {
        const rollback = Math.min(st.paidPaisa, remainingToRollback);
        st.paidPaisa -= rollback;
        remainingToRollback -= rollback;
        if (st.paidPaisa <= 0) {
          st.paidPaisa = 0;
          st.status = 'Pending';
          st.paidAt = null;
        } else if (st.paidPaisa < st.amountPaisa) {
          st.status = 'Partial';
          st.paidAt = null;
        }
      }
    }

    plan.totalPaidPaisa = Math.max(0, plan.totalPaidPaisa - receipt.amountPaisa);
    plan.totalDuePaisa = Math.max(0, plan.netPayablePaisa - plan.totalPaidPaisa);
    if (plan.totalDuePaisa > 0 && plan.status === 'Paid') {
      plan.status = 'Active';
    }
    await plan.save({ session });

    receipt.status = 'Reversed';
    receipt.reversalJournalEntryId = reversal._id as mongoose.Types.ObjectId;
    receipt.reversalReason = reason;
    await receipt.save({ session });

    student.total_paid = paisaToTaka(Math.max(0, plan.totalPaidPaisa - (plan.totalRefundedPaisa || 0)));
    student.total_due = paisaToTaka(plan.totalDuePaisa);
    await student.save({ session });

    await AuditLog.create(
      [
        {
          userId: params.user?.userId || 'system',
          userName: actor,
          userRole: params.user?.role || 'System',
          action: 'ACCOUNTS_RECEIPT_REVERSED',
          entity: 'MoneyReceipt',
          entityId: receipt._id.toString(),
          oldValues: { status: 'Posted', amountPaisa: receipt.amountPaisa },
          newValues: {
            status: 'Reversed',
            reversalVoucherNo: reversal.voucherNo,
            reason,
          },
          timestamp: new Date(),
        },
      ],
      { session }
    );

    return { receipt, reversal, plan };
  });
}

/**
 * Create a Fee Refund or Credit Note request (Pending Admin approval).
 */
export async function createFeeRefundRequest(params: {
  studentId: string;
  kind: RefundKind;
  amountPaisa: number;
  refundRule: RefundRuleCode;
  reason: string;
  method?: PaymentMethod | '';
  payoutAccountId?: string | null;
  reference?: string;
  refundDate?: Date | string;
  user: { userId?: string; name?: string; username?: string; role?: string };
}) {
  await connectDB();
  const amountPaisa = Math.round(Number(params.amountPaisa || 0));
  const reason = String(params.reason || '').trim();
  if (!Number.isInteger(amountPaisa) || amountPaisa <= 0) {
    throw new Error('Refund/Credit Note amount must be positive.');
  }
  if (reason.length < 3) {
    throw new Error('A clear reason (minimum 3 characters) is required.');
  }
  if (params.kind === 'Refund' && !params.method) {
    throw new Error('Payout payment method is required for a Cash/Bank Refund.');
  }

  const rDate = params.refundDate ? new Date(params.refundDate) : new Date();
  if (Number.isNaN(rDate.getTime())) {
    throw new Error('Invalid refund date.');
  }

  const plan = await StudentFeePlan.findOne({ studentId: params.studentId, isDeleted: { $ne: true } });
  if (!plan) {
    throw new Error('Student Fee Plan not found in Accounts.');
  }

  if (params.kind === 'CreditNote') {
    if (amountPaisa > plan.totalDuePaisa) {
      throw new Error(
        `Credit Note (${paisaToTaka(amountPaisa)} BDT) exceeds remaining due (${paisaToTaka(plan.totalDuePaisa)} BDT).`
      );
    }
  } else {
    const netCollected = Math.max(0, plan.totalPaidPaisa - (plan.totalRefundedPaisa || 0));
    if (amountPaisa > netCollected) {
      throw new Error(
        `Cash Refund (${paisaToTaka(amountPaisa)} BDT) exceeds refundable collected amount (${paisaToTaka(netCollected)} BDT).`
      );
    }
  }

  const actor = params.user?.name || params.user?.username || 'System';
  const fyCode = await resolveFiscalCodeLoose(rDate);
  const seqPrefix = params.kind === 'CreditNote' ? 'CN' : 'RF';
  const session = await mongoose.startSession();
  let refundNo = '';
  try {
    await session.withTransaction(async () => {
      refundNo = await nextFiscalSeriesId(
        seqPrefix,
        fyCode,
        `ACCOUNTS_${seqPrefix}`,
        params.kind === 'CreditNote' ? 'JV' : 'PV',
        session
      );
    });
  } finally {
    await session.endSession();
  }

  const refund = await FeeRefund.create({
    refundNo,
    kind: params.kind,
    studentId: plan.studentId,
    feePlanId: plan._id,
    amountPaisa,
    refundRule: params.refundRule,
    reason,
    method: params.kind === 'Refund' ? params.method || 'Cash' : '',
    payoutAccountId: params.payoutAccountId ? new mongoose.Types.ObjectId(params.payoutAccountId) : null,
    reference: params.reference?.trim() || '',
    refundDate: rDate,
    status: 'Pending',
    requestedBy: actor,
    isDeleted: false,
  });

  await AuditLog.create({
    userId: params.user?.userId || 'system',
    userName: actor,
    userRole: params.user?.role || 'System',
    action: 'FEE_REFUND_REQUESTED',
    entity: 'FeeRefund',
    entityId: refund._id.toString(),
    newValues: {
      refundNo,
      kind: params.kind,
      refundRule: params.refundRule,
      amountPaisa,
      reason,
    },
    timestamp: new Date(),
  });

  return refund;
}

/**
 * Admin approves or rejects a Pending Fee Refund or Credit Note.
 * - CreditNote approval: posts JV `4110 Fee Income Dr / 1210 Student Receivable Cr` and reduces due.
 * - Refund payout approval: posts PV `4110 Fee Income Dr / Cash or Bank Cr` and increments totalRefundedPaisa.
 */
export async function processFeeRefundApproval(params: {
  refundId: string;
  decision: 'Approve' | 'Reject';
  rejectionReason?: string;
  approvalDate?: Date | string;
  user: { userId?: string; name?: string; username?: string; role?: string };
}) {
  await connectDB();
  await ensureAccountsSeeded();

  const actor = params.user?.name || params.user?.username || 'System';

  return runInTransaction(async (session) => {
    const refund = await FeeRefund.findOne({ _id: params.refundId, isDeleted: { $ne: true } }).session(
      session
    );
    if (!refund) {
      throw new Error('Refund / Credit Note request not found.');
    }
    if (refund.status !== 'Pending') {
      throw new Error(`Request ${refund.refundNo} is already ${refund.status}.`);
    }

    if (params.decision === 'Reject') {
      refund.status = 'Rejected';
      refund.rejectedBy = actor;
      refund.rejectedAt = new Date();
      refund.rejectionReason = params.rejectionReason?.trim() || 'Rejected by Admin';
      await refund.save({ session });

      await AuditLog.create(
        [
          {
            userId: params.user?.userId || 'system',
            userName: actor,
            userRole: params.user?.role || 'System',
            action: 'FEE_REFUND_REJECTED',
            entity: 'FeeRefund',
            entityId: refund._id.toString(),
            newValues: { refundNo: refund.refundNo, rejectionReason: refund.rejectionReason },
            timestamp: new Date(),
          },
        ],
        { session }
      );

      return { refund, entry: null };
    }

    const plan = await StudentFeePlan.findById(refund.feePlanId).session(session);
    if (!plan) {
      throw new Error('Linked Student Fee Plan not found.');
    }
    const student = await Student.findById(refund.studentId).session(session);
    if (!student) {
      throw new Error('Linked student record not found.');
    }

    const postDate = params.approvalDate ? new Date(params.approvalDate) : refund.refundDate || new Date();
    const feeIncomeAccId = await getSystemAccountId('FEE_INCOME');

    let entry;
    if (refund.kind === 'CreditNote') {
      if (refund.amountPaisa > plan.totalDuePaisa) {
        throw new Error(
          `Credit Note (${paisaToTaka(refund.amountPaisa)} BDT) exceeds remaining due (${paisaToTaka(plan.totalDuePaisa)} BDT).`
        );
      }
      const receivableAccId = await getSystemAccountId('STUDENT_RECEIVABLE');
      const posted = await postTransactionEntry({
        journalType: 'JV',
        entryDate: postDate,
        description: `Credit Note ${refund.refundNo} (${refund.refundRule}) for ${student.name} (${student.student_no})`,
        reference: refund.refundNo,
        sourceModule: 'FEE_CREDIT_NOTE',
        sourceId: refund._id.toString(),
        idempotencyKey: `CREDIT_NOTE:${refund._id.toString()}`,
        session,
        user: params.user,
        lines: [
          {
            accountId: feeIncomeAccId,
            description: `Fee credit note ${refund.refundNo}: ${refund.reason}`,
            debitPaisa: refund.amountPaisa,
            creditPaisa: 0,
            branch: plan.branch,
            department: plan.department,
            studentId: student._id.toString(),
            agentId: student.referred_by_agent ? student.referred_by_agent.toString() : null,
          },
          {
            accountId: receivableAccId,
            description: `Receivable adjustment (${refund.refundNo})`,
            debitPaisa: 0,
            creditPaisa: refund.amountPaisa,
            branch: plan.branch,
            department: plan.department,
            studentId: student._id.toString(),
            agentId: student.referred_by_agent ? student.referred_by_agent.toString() : null,
          },
        ],
      });
      entry = posted.entry;

      deductCreditFromUnpaidStages(plan.stages, refund.amountPaisa);
      plan.creditNotePaisa = (plan.creditNotePaisa || 0) + refund.amountPaisa;
      plan.netPayablePaisa = Math.max(
        0,
        plan.totalBilledPaisa - plan.discountPaisa - plan.creditNotePaisa
      );
      plan.totalDuePaisa = Math.max(0, plan.netPayablePaisa - plan.totalPaidPaisa);
      if (plan.totalDuePaisa === 0 && plan.totalPaidPaisa === 0) {
        plan.status = 'Cancelled';
      } else if (plan.totalDuePaisa === 0) {
        plan.status = 'Paid';
      }
    } else {
      const netCollected = Math.max(0, plan.totalPaidPaisa - (plan.totalRefundedPaisa || 0));
      if (refund.amountPaisa > netCollected) {
        throw new Error(
          `Refund (${paisaToTaka(refund.amountPaisa)} BDT) exceeds net collected balance (${paisaToTaka(netCollected)} BDT).`
        );
      }
      const payoutAccId =
        refund.payoutAccountId?.toString() ||
        (await getSystemAccountId(resolveDepositSystemTag(refund.method || 'Cash')));
      const posted = await postTransactionEntry({
        journalType: 'PV',
        entryDate: postDate,
        description: `Fee Refund ${refund.refundNo} (${refund.refundRule}) to ${student.name} (${student.student_no}) via ${refund.method}`,
        reference: refund.reference || refund.refundNo,
        sourceModule: 'FEE_REFUND',
        sourceId: refund._id.toString(),
        idempotencyKey: `FEE_REFUND:${refund._id.toString()}`,
        session,
        user: params.user,
        lines: [
          {
            accountId: feeIncomeAccId,
            description: `Fee refund ${refund.refundNo}: ${refund.reason}`,
            debitPaisa: refund.amountPaisa,
            creditPaisa: 0,
            branch: plan.branch,
            department: plan.department,
            studentId: student._id.toString(),
            agentId: student.referred_by_agent ? student.referred_by_agent.toString() : null,
          },
          {
            accountId: payoutAccId,
            description: `Refund paid via ${refund.method} (${refund.refundNo})`,
            debitPaisa: 0,
            creditPaisa: refund.amountPaisa,
            branch: plan.branch,
            department: plan.department,
            studentId: student._id.toString(),
            agentId: student.referred_by_agent ? student.referred_by_agent.toString() : null,
          },
        ],
      });
      entry = posted.entry;

      plan.totalRefundedPaisa = (plan.totalRefundedPaisa || 0) + refund.amountPaisa;
      if (plan.totalPaidPaisa - plan.totalRefundedPaisa === 0 && plan.totalDuePaisa === 0) {
        plan.status = 'Refunded';
      }
    }

    await plan.save({ session });

    student.total_paid = paisaToTaka(Math.max(0, plan.totalPaidPaisa - (plan.totalRefundedPaisa || 0)));
    student.total_due = paisaToTaka(plan.totalDuePaisa);
    await student.save({ session });

    refund.status = 'Approved';
    refund.approvedBy = actor;
    refund.approvedAt = new Date();
    refund.journalEntryId = entry._id as mongoose.Types.ObjectId;
    await refund.save({ session });

    await AuditLog.create(
      [
        {
          userId: params.user?.userId || 'system',
          userName: actor,
          userRole: params.user?.role || 'System',
          action: 'FEE_REFUND_APPROVED',
          entity: 'FeeRefund',
          entityId: refund._id.toString(),
          newValues: {
            refundNo: refund.refundNo,
            kind: refund.kind,
            voucherNo: entry.voucherNo,
            amountPaisa: refund.amountPaisa,
          },
          timestamp: new Date(),
        },
      ],
      { session }
    );

    return { refund, entry, plan };
  });
}

export interface StudentStatementRow {
  date: Date;
  type: 'INVOICE' | 'RECEIPT' | 'RECEIPT_REVERSAL' | 'DISCOUNT' | 'CREDIT_NOTE' | 'REFUND';
  refNo: string;
  voucherNo: string;
  description: string;
  debitPaisa: number;
  creditPaisa: number;
  runningBalancePaisa: number;
  status: string;
}

/**
 * Full read-only Student Fee Statement (Invoice, Receipts, Reversals, Discounts, Credit Notes, Refunds).
 */
export async function getStudentFeeStatement(studentId: string) {
  await connectDB();

  const student = await Student.findById(studentId)
    .select(
      'name student_no mobile phone trade_name destination_country status admission_date batch'
    )
    .lean();
  if (!student) {
    throw new Error('Student not found.');
  }

  const plan = await StudentFeePlan.findOne({ studentId, isDeleted: { $ne: true } }).lean();
  const receipts = await MoneyReceipt.find({ studentId, isDeleted: { $ne: true } })
    .sort({ receiptDate: 1, createdAt: 1 })
    .lean();
  const refunds = await FeeRefund.find({ studentId, isDeleted: { $ne: true } })
    .sort({ refundDate: 1, createdAt: 1 })
    .lean();

  const jeIds = new Set<string>();
  if (plan?.invoiceJournalEntryId) jeIds.add(plan.invoiceJournalEntryId.toString());
  if (plan?.discountJournalEntryId) jeIds.add(plan.discountJournalEntryId.toString());
  receipts.forEach((r) => {
    if (r.journalEntryId) jeIds.add(r.journalEntryId.toString());
    if (r.reversalJournalEntryId) jeIds.add(r.reversalJournalEntryId.toString());
  });
  refunds.forEach((rf) => {
    if (rf.journalEntryId) jeIds.add(rf.journalEntryId.toString());
  });

  const jeDocs =
    jeIds.size > 0
      ? await JournalEntry.find({ _id: { $in: Array.from(jeIds) } })
          .select('voucherNo entryDate')
          .lean()
      : [];
  const jeMap = new Map(jeDocs.map((j) => [j._id.toString(), j]));

  const rawRows: Array<Omit<StudentStatementRow, 'runningBalancePaisa'> & { sortOrder: number }> = [];

  if (plan) {
    const invJe = plan.invoiceJournalEntryId ? jeMap.get(plan.invoiceJournalEntryId.toString()) : null;
    rawRows.push({
      date: invJe?.entryDate || plan.createdAt,
      type: 'INVOICE',
      refNo: plan.planNo,
      voucherNo: invJe?.voucherNo || '—',
      description: `Fee Plan (${plan.tradeName || 'General'} - ${plan.destinationCountry || 'All'})`,
      debitPaisa: plan.totalBilledPaisa,
      creditPaisa: 0,
      status: plan.status,
      sortOrder: 1,
    });

    if (plan.discountPaisa > 0) {
      const discJe = plan.discountJournalEntryId ? jeMap.get(plan.discountJournalEntryId.toString()) : null;
      rawRows.push({
        date: discJe?.entryDate || plan.updatedAt,
        type: 'DISCOUNT',
        refNo: `${plan.planNo}-DISC`,
        voucherNo: discJe?.voucherNo || '—',
        description: `Approved Discount: ${plan.discountReason || 'Fee waiver'}`,
        debitPaisa: 0,
        creditPaisa: plan.discountPaisa,
        status: 'Approved',
        sortOrder: 2,
      });
    }
  }

  for (const r of receipts) {
    const rJe = r.journalEntryId ? jeMap.get(r.journalEntryId.toString()) : null;
    rawRows.push({
      date: r.receiptDate,
      type: 'RECEIPT',
      refNo: r.receiptNo,
      voucherNo: rJe?.voucherNo || '—',
      description: `Payment via ${r.method}${r.reference ? ` (${r.reference})` : ''}`,
      debitPaisa: 0,
      creditPaisa: r.amountPaisa,
      status: r.status,
      sortOrder: 3,
    });
    if (r.status === 'Reversed') {
      const revJe = r.reversalJournalEntryId ? jeMap.get(r.reversalJournalEntryId.toString()) : null;
      rawRows.push({
        date: revJe?.entryDate || r.updatedAt,
        type: 'RECEIPT_REVERSAL',
        refNo: `${r.receiptNo}-REV`,
        voucherNo: revJe?.voucherNo || '—',
        description: `Reversal: ${r.reversalReason || 'Reversed receipt'}`,
        debitPaisa: r.amountPaisa,
        creditPaisa: 0,
        status: 'Reversed',
        sortOrder: 4,
      });
    }
  }

  for (const rf of refunds) {
    if (rf.status !== 'Approved') continue;
    const rfJe = rf.journalEntryId ? jeMap.get(rf.journalEntryId.toString()) : null;
    if (rf.kind === 'CreditNote') {
      rawRows.push({
        date: rf.refundDate,
        type: 'CREDIT_NOTE',
        refNo: rf.refundNo,
        voucherNo: rfJe?.voucherNo || '—',
        description: `Credit Note (${rf.refundRule}): ${rf.reason}`,
        debitPaisa: 0,
        creditPaisa: rf.amountPaisa,
        status: 'Approved',
        sortOrder: 5,
      });
    } else {
      rawRows.push({
        date: rf.refundDate,
        type: 'REFUND',
        refNo: rf.refundNo,
        voucherNo: rfJe?.voucherNo || '—',
        description: `Cash/Bank Refund (${rf.refundRule}) via ${rf.method}: ${rf.reason}`,
        debitPaisa: 0,
        creditPaisa: 0,
        status: 'Approved',
        sortOrder: 6,
      });
    }
  }

  rawRows.sort((a, b) => {
    const tA = new Date(a.date).getTime();
    const tB = new Date(b.date).getTime();
    if (tA !== tB) return tA - tB;
    return a.sortOrder - b.sortOrder;
  });

  let running = 0;
  const rows: StudentStatementRow[] = rawRows.map((row) => {
    running += row.debitPaisa - row.creditPaisa;
    return {
      date: row.date,
      type: row.type,
      refNo: row.refNo,
      voucherNo: row.voucherNo,
      description: row.description,
      debitPaisa: row.debitPaisa,
      creditPaisa: row.creditPaisa,
      runningBalancePaisa: running,
      status: row.status,
    };
  });

  return {
    student,
    plan,
    receipts: receipts.map((r) => ({
      ...r,
      voucherNo: (r.journalEntryId && jeMap.get(r.journalEntryId.toString())?.voucherNo) || '—',
    })),
    refunds: refunds.map((rf) => ({
      ...rf,
      voucherNo: (rf.journalEntryId && jeMap.get(rf.journalEntryId.toString())?.voucherNo) || '—',
    })),
    rows,
  };
}

