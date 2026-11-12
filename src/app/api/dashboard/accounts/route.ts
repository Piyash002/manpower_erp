import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { ACCOUNTS_READ_ROLES, requireAccountsAuth } from '@/lib/accounts-auth';
import { ensureAccountsSeeded } from '@/lib/accounts-seed';
import { Account } from '@/models/Account';
import { JournalEntry } from '@/models/JournalEntry';
import { JournalLine } from '@/models/JournalLine';
import { MoneyReceipt } from '@/models/MoneyReceipt';
import { StudentFeePlan } from '@/models/StudentFeePlan';
import { Student } from '@/models/Student';
import { FeeRefund } from '@/models/FeeRefund';
import { AccountingPeriod } from '@/models/AccountingPeriod';
import { PayslipBatch } from '@/models/PayslipBatch';
import { FixedAsset } from '@/models/FixedAsset';
import { ExpenseRecord } from '@/models/ExpenseRecord';
import { VendorBill } from '@/models/VendorBill';
import { resolveDateRange } from '@/lib/dashboard-helpers';
import { paisaToTaka } from '@/lib/accounts-money';

const CASH_BANK_CODES = ['1110', '1120', '1130', '1140', '1150'];

export async function GET(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensureAccountsSeeded();
    void Student;

    const { searchParams } = new URL(req.url);
    const range = resolveDateRange(
      searchParams.get('range'),
      searchParams.get('startDate'),
      searchParams.get('endDate')
    );

    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const currentYear = now.getUTCFullYear();
    const yearStart = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0));
    const yearEnd = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59, 999));
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    const [
      accounts,
      trialBalanceAgg,
      collectionsRangeAgg,
      collectionsTrendAgg,
      incomeExpenseMonthlyAgg,
      openPlans,
      currentPeriod,
      confirmedPayrollRuns,
      pendingRefundsCount,
      pendingDiscountsCount,
      draftVouchersCount,
      fixedAssetsAgg,
      expensesMonthAgg,
      payablesDueAgg,
    ] = await Promise.all([
      Account.find({
        isGroup: false,
        active: true,
        isDeleted: { $ne: true },
        $or: [{ code: { $in: [...CASH_BANK_CODES, '1210'] } }, { type: { $in: ['Income', 'Expense'] } }],
      })
        .select('code name type')
        .lean(),
      // Global Trial Balance & per-account posted balances (index-first $match on JournalLine)
      JournalLine.aggregate<{ _id: string; debitPaisa: number; creditPaisa: number }>([
        { $match: { status: 'Posted', isDeleted: false } },
        {
          $lookup: {
            from: 'journalentries',
            localField: 'entryId',
            foreignField: '_id',
            as: 'entry',
          },
        },
        { $unwind: '$entry' },
        { $match: { 'entry.status': 'Posted', 'entry.isDeleted': false } },
        {
          $group: {
            _id: '$accountId',
            debitPaisa: { $sum: '$debitPaisa' },
            creditPaisa: { $sum: '$creditPaisa' },
          },
        },
      ]),
      MoneyReceipt.aggregate<{ totalPaisa: number; count: number }>([
        {
          $match: {
            status: 'Posted',
            isDeleted: { $ne: true },
            receiptDate: { $gte: range.startDate, $lte: range.endDate },
          },
        },
        { $group: { _id: null, totalPaisa: { $sum: '$amountPaisa' }, count: { $sum: 1 } } },
      ]),
      MoneyReceipt.aggregate<{ _id: string; totalPaisa: number }>([
        {
          $match: {
            status: 'Posted',
            isDeleted: { $ne: true },
            receiptDate: { $gte: range.startDate, $lte: range.endDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%m-%d', date: '$receiptDate' } },
            totalPaisa: { $sum: '$amountPaisa' },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 14 },
      ]),
      // Income vs Expense by month (current year, index-first $match on JournalLine)
      JournalLine.aggregate<{
        _id: { month: number; accountType: string };
        debitPaisa: number;
        creditPaisa: number;
      }>([
        {
          $match: {
            status: 'Posted',
            isDeleted: false,
            entryDate: { $gte: yearStart, $lte: yearEnd },
          },
        },
        {
          $lookup: {
            from: 'journalentries',
            localField: 'entryId',
            foreignField: '_id',
            as: 'entry',
          },
        },
        { $unwind: '$entry' },
        {
          $match: {
            'entry.status': 'Posted',
            'entry.isDeleted': false,
            'entry.entryDate': { $gte: yearStart, $lte: yearEnd },
          },
        },
        {
          $lookup: {
            from: 'accounts',
            localField: 'accountId',
            foreignField: '_id',
            as: 'account',
          },
        },
        { $unwind: '$account' },
        { $match: { 'account.type': { $in: ['Income', 'Expense'] } } },
        {
          $group: {
            _id: { month: { $month: '$entry.entryDate' }, accountType: '$account.type' },
            debitPaisa: { $sum: '$debitPaisa' },
            creditPaisa: { $sum: '$creditPaisa' },
          },
        },
      ]),
      StudentFeePlan.find({
        isDeleted: { $ne: true },
        totalDuePaisa: { $gt: 0 },
      })
        .populate('studentId', 'student_no name trade_name batch')
        .sort({ totalDuePaisa: -1 })
        .lean(),
      AccountingPeriod.findOne({
        startDate: { $lte: now },
        endDate: { $gte: now },
      })
        .select('name status month year')
        .lean(),
      PayslipBatch.countDocuments({ status: 'Confirmed' }),
      FeeRefund.countDocuments({ status: 'Pending', isDeleted: { $ne: true } }),
      StudentFeePlan.countDocuments({ discountStatus: 'Pending', isDeleted: { $ne: true } }),
      JournalEntry.countDocuments({ status: 'Draft', isDeleted: { $ne: true } }),
      FixedAsset.aggregate<{ nbvPaisa: number; count: number }>([
        { $match: { status: 'Active', isDeleted: { $ne: true } } },
        {
          $group: {
            _id: null,
            nbvPaisa: {
              $sum: {
                $max: [0, { $subtract: ['$costPaisa', { $ifNull: ['$accumulatedDepreciationPaisa', 0] }] }],
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      ExpenseRecord.aggregate<{ totalPaisa: number }>([
        {
          $match: {
            status: 'Posted',
            isDeleted: { $ne: true },
            date: { $gte: monthStart, $lte: monthEnd },
          },
        },
        { $group: { _id: null, totalPaisa: { $sum: '$amountPaisa' } } },
      ]),
      VendorBill.aggregate<{ duePaisa: number; count: number }>([
        { $match: { status: { $in: ['Open', 'PartiallyPaid'] }, isDeleted: { $ne: true } } },
        { $group: { _id: null, duePaisa: { $sum: '$duePaisa' }, count: { $sum: 1 } } },
      ]),
    ]);

    // Map posted balances by accountId
    const balById = new Map<string, { debitPaisa: number; creditPaisa: number }>();
    let tbDebitPaisa = 0;
    let tbCreditPaisa = 0;
    for (const row of trialBalanceAgg) {
      balById.set(String(row._id), { debitPaisa: row.debitPaisa, creditPaisa: row.creditPaisa });
      tbDebitPaisa += row.debitPaisa;
      tbCreditPaisa += row.creditPaisa;
    }

    const trialBalanceDiffPaisa = Math.abs(tbDebitPaisa - tbCreditPaisa);
    const trialBalanceBalanced = trialBalanceDiffPaisa <= 1;

    // Cash & Bank (1110-1150) & Receivable (1210)
    const cashBreakdown: Array<{ code: string; name: string; balancePaisa: number }> = [];
    let cashBankBalancePaisa = 0;
    let receivablePaisa = 0;

    for (const acc of accounts as any[]) {
      const b = balById.get(String(acc._id)) || { debitPaisa: 0, creditPaisa: 0 };
      const netDebitPaisa = b.debitPaisa - b.creditPaisa;
      if (CASH_BANK_CODES.includes(acc.code)) {
        cashBankBalancePaisa += netDebitPaisa;
        cashBreakdown.push({
          code: acc.code,
          name: acc.name,
          balancePaisa: netDebitPaisa,
        });
      } else if (acc.code === '1210') {
        receivablePaisa = netDebitPaisa;
      }
    }

    // Overdue installments & top 5 candidate dues summary
    let overdueCount = 0;
    let overdueAmountPaisa = 0;

    const duesRows = (openPlans as any[]).map((plan) => {
      const stages = [...(plan.stages || [])].sort((a, b) => a.stageNo - b.stageNo);
      let studentOverdue = false;
      let nextStage: any = null;

      for (const s of stages) {
        const rem = (s.amountPaisa || 0) - (s.paidPaisa || 0);
        if (rem > 0) {
          if (!nextStage) nextStage = s;
          if (new Date(s.dueDate) < todayStart) {
            studentOverdue = true;
            overdueCount++;
            overdueAmountPaisa += rem;
          }
        }
      }

      const st = plan.studentId || {};
      const netPaidPaisa = Math.max(0, (plan.totalPaidPaisa || 0) - (plan.totalRefundedPaisa || 0));

      return {
        planId: String(plan._id),
        studentId: st._id ? String(st._id) : '',
        studentNo: st.student_no || plan.studentNo || '-',
        name: st.name || 'Candidate',
        tradeName: st.trade_name || plan.tradeName || '-',
        batch: st.batch || '-',
        totalFeePaisa: plan.netPayablePaisa || 0,
        totalPaidPaisa: netPaidPaisa,
        duePaisa: plan.totalDuePaisa || 0,
        nextInstallment: nextStage
          ? {
              label: nextStage.label,
              dueDate: nextStage.dueDate,
              remainingPaisa: (nextStage.amountPaisa || 0) - (nextStage.paidPaisa || 0),
            }
          : null,
        status: studentOverdue ? 'Overdue' : 'Due Pending',
      };
    });

    // Monthly Income vs Expense chart
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const incomeByMonth = new Map<number, number>();
    const expenseByMonth = new Map<number, number>();
    for (const row of incomeExpenseMonthlyAgg) {
      if (row._id.accountType === 'Income') {
        incomeByMonth.set(row._id.month, row.creditPaisa - row.debitPaisa);
      } else if (row._id.accountType === 'Expense') {
        expenseByMonth.set(row._id.month, row.debitPaisa - row.creditPaisa);
      }
    }

    const incomeVsExpense = monthLabels.map((label, idx) => ({
      label,
      primary: paisaToTaka(Math.max(0, incomeByMonth.get(idx + 1) || 0)),
      secondary: paisaToTaka(Math.max(0, expenseByMonth.get(idx + 1) || 0)),
    }));

    // Pending actions list (max 5)
    const pendingActions: Array<{
      id: string;
      title: string;
      detail: string;
      count: number;
      href: string;
      actionLabel: string;
    }> = [];

    if (confirmedPayrollRuns > 0) {
      pendingActions.push({
        id: 'payroll-disbursement',
        title: 'Salary Runs Awaiting Disbursement',
        detail: 'Confirmed payroll runs ready for PV posting',
        count: confirmedPayrollRuns,
        href: '/accounts/payroll',
        actionLabel: 'Disburse',
      });
    }
    if (pendingRefundsCount > 0) {
      pendingActions.push({
        id: 'refund-approvals',
        title: 'Pending Refund Approvals',
        detail: 'Candidate refund or credit note requests',
        count: pendingRefundsCount,
        href: '/accounts/receipts',
        actionLabel: 'Review',
      });
    }
    if (pendingDiscountsCount > 0) {
      pendingActions.push({
        id: 'discount-approvals',
        title: 'Pending Discount Approvals',
        detail: 'Fee plan discount requests awaiting Admin approval',
        count: pendingDiscountsCount,
        href: '/accounts/student-fees',
        actionLabel: 'Review',
      });
    }
    if (draftVouchersCount > 0) {
      pendingActions.push({
        id: 'draft-vouchers',
        title: 'Draft Journal Vouchers',
        detail: 'Unposted vouchers awaiting review & posting',
        count: draftVouchersCount,
        href: '/accounts/vouchers',
        actionLabel: 'Open',
      });
    }

    return NextResponse.json({
      success: true,
      range: {
        preset: range.preset,
        label: range.label,
        startIso: range.startIso,
        endIso: range.endIso,
      },
      kpis: {
        cashBankBalancePaisa,
        cashBreakdown,
        collectionsPaisa: collectionsRangeAgg[0]?.totalPaisa || 0,
        collectionsCount: collectionsRangeAgg[0]?.count || 0,
        receivablePaisa,
        overdueCount,
        overdueAmountPaisa,
      },
      statusStrip: {
        fiscalPeriodName: currentPeriod?.name || 'No active period',
        fiscalPeriodStatus: currentPeriod?.status || 'Unknown',
        trialBalanceBalanced,
        trialBalanceDiffPaisa,
      },
      modules: {
        fixedAssetsNbvPaisa: fixedAssetsAgg[0]?.nbvPaisa || 0,
        fixedAssetsCount: fixedAssetsAgg[0]?.count || 0,
        expensesThisMonthPaisa: expensesMonthAgg[0]?.totalPaisa || 0,
        payablesDuePaisa: payablesDueAgg[0]?.duePaisa || 0,
        payablesCount: payablesDueAgg[0]?.count || 0,
      },
      charts: {
        incomeVsExpense,
        collectionsTrend: collectionsTrendAgg.map((c) => ({
          label: c._id,
          primary: paisaToTaka(c.totalPaisa),
        })),
      },
      tables: {
        candidateDuesSummary: duesRows.slice(0, 5),
        pendingActions: pendingActions.slice(0, 5),
      },
    });
  } catch (error: any) {
    console.error('Accounts dashboard API error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to load accounts dashboard' },
      { status: 500 }
    );
  }
}

