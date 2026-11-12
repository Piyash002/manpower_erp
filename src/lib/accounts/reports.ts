import { Account } from '@/models/Account';
import { JournalLine } from '@/models/JournalLine';
import { FixedAsset } from '@/models/FixedAsset';
import { ExpenseRecord } from '@/models/ExpenseRecord';
import { VendorBill } from '@/models/VendorBill';
import { ensureAccountsSeeded } from '@/lib/accounts-seed';
import { utcEndOfDay, utcStartOfDay } from '@/lib/accounts/shared';

async function aggregatePostedBalancesByAccount(dateFilter: Record<string, Date>) {
  const lineMatch: Record<string, unknown> = {
    status: 'Posted',
    isDeleted: false,
  };
  const matchEntry: Record<string, unknown> = {
    'entry.status': 'Posted',
    'entry.isDeleted': false,
  };
  if (Object.keys(dateFilter).length > 0) {
    lineMatch.entryDate = dateFilter;
    matchEntry['entry.entryDate'] = dateFilter;
  }

  const rows = await JournalLine.aggregate<{
    _id: string;
    debitPaisa: number;
    creditPaisa: number;
  }>([
    { $match: lineMatch },
    {
      $lookup: {
        from: 'journalentries',
        localField: 'entryId',
        foreignField: '_id',
        as: 'entry',
      },
    },
    { $unwind: '$entry' },
    { $match: matchEntry },
    {
      $group: {
        _id: '$accountId',
        debitPaisa: { $sum: '$debitPaisa' },
        creditPaisa: { $sum: '$creditPaisa' },
      },
    },
  ]);

  const map = new Map<string, { debitPaisa: number; creditPaisa: number }>();
  for (const r of rows) {
    map.set(String(r._id), { debitPaisa: r.debitPaisa, creditPaisa: r.creditPaisa });
  }
  return map;
}

export async function getBalanceSheetReport(asOfDateInput?: string) {
  await ensureAccountsSeeded();
  const asOfDate = utcEndOfDay(asOfDateInput);
  const [accounts, balMap] = await Promise.all([
    Account.find({ isGroup: false, active: true, isDeleted: { $ne: true } }).sort({ code: 1 }).lean(),
    aggregatePostedBalancesByAccount({ $lte: asOfDate }),
  ]);

  const assets: Array<{
    code: string;
    name: string;
    systemTag: string;
    isContra: boolean;
    balancePaisa: number;
  }> = [];
  const liabilities: Array<{
    code: string;
    name: string;
    systemTag: string;
    balancePaisa: number;
  }> = [];
  const equity: Array<{
    code: string;
    name: string;
    systemTag: string;
    balancePaisa: number;
  }> = [];

  let totalAssetsPaisa = 0;
  let totalLiabilitiesPaisa = 0;
  let totalEquityAccountsPaisa = 0;
  let totalIncomePaisa = 0;
  let totalExpensePaisa = 0;

  for (const acc of accounts) {
    const raw = balMap.get(String(acc._id)) || { debitPaisa: 0, creditPaisa: 0 };
    if (acc.type === 'Asset') {
      // Assets carry debit normal balance; contra-asset 1390 carries credit normal balance (negative in asset total)
      const balancePaisa = raw.debitPaisa - raw.creditPaisa;
      totalAssetsPaisa += balancePaisa;
      if (balancePaisa !== 0 || acc.systemTag === 'ACCUM_DEPRECIATION') {
        assets.push({
          code: acc.code,
          name: acc.name,
          systemTag: acc.systemTag || '',
          isContra: acc.normalBalance === 'Credit',
          balancePaisa,
        });
      }
    } else if (acc.type === 'Liability') {
      const balancePaisa = raw.creditPaisa - raw.debitPaisa;
      totalLiabilitiesPaisa += balancePaisa;
      if (balancePaisa !== 0) {
        liabilities.push({
          code: acc.code,
          name: acc.name,
          systemTag: acc.systemTag || '',
          balancePaisa,
        });
      }
    } else if (acc.type === 'Equity') {
      const balancePaisa = raw.creditPaisa - raw.debitPaisa;
      totalEquityAccountsPaisa += balancePaisa;
      if (balancePaisa !== 0) {
        equity.push({
          code: acc.code,
          name: acc.name,
          systemTag: acc.systemTag || '',
          balancePaisa,
        });
      }
    } else if (acc.type === 'Income') {
      totalIncomePaisa += raw.creditPaisa - raw.debitPaisa;
    } else if (acc.type === 'Expense') {
      totalExpensePaisa += raw.debitPaisa - raw.creditPaisa;
    }
  }

  const currentPeriodNetProfitPaisa = totalIncomePaisa - totalExpensePaisa;
  const totalEquityPaisa = totalEquityAccountsPaisa + currentPeriodNetProfitPaisa;
  const liabilitiesPlusEquityPaisa = totalLiabilitiesPaisa + totalEquityPaisa;

  return {
    asOfDate: asOfDate.toISOString(),
    assets,
    totalAssetsPaisa,
    liabilities,
    totalLiabilitiesPaisa,
    equity,
    totalIncomePaisa,
    totalExpensePaisa,
    currentPeriodNetProfitPaisa,
    totalEquityPaisa,
    liabilitiesPlusEquityPaisa,
    differencePaisa: totalAssetsPaisa - liabilitiesPlusEquityPaisa,
    isBalanced: totalAssetsPaisa === liabilitiesPlusEquityPaisa,
  };
}

export async function getAssetRegisterReport() {
  await ensureAccountsSeeded();
  const [assets, glAccounts, balMap] = await Promise.all([
    FixedAsset.find({ isDeleted: false }).sort({ assetCode: 1 }).lean(),
    Account.find({
      systemTag: {
        $in: [
          'FA_TRAINING_EQUIPMENT',
          'FA_FURNITURE',
          'FA_COMPUTER',
          'FA_LEASEHOLD',
          'ACCUM_DEPRECIATION',
        ],
      },
    }).lean(),
    aggregatePostedBalancesByAccount({}),
  ]);

  let totalCostPaisa = 0;
  let totalAccumulatedDepreciationPaisa = 0;
  let totalNetBookValuePaisa = 0;
  let activeCount = 0;
  let disposedCount = 0;

  const rows = assets.map((a) => {
    const accum = a.accumulatedDepreciationPaisa || 0;
    const netBookValuePaisa = a.costPaisa - accum;
    if (a.status === 'Active') {
      activeCount += 1;
      totalCostPaisa += a.costPaisa;
      totalAccumulatedDepreciationPaisa += accum;
      totalNetBookValuePaisa += netBookValuePaisa;
    } else {
      disposedCount += 1;
    }
    return {
      ...a,
      netBookValuePaisa,
    };
  });

  let glGrossCostPaisa = 0;
  let glAccumDepPaisa = 0;
  for (const acc of glAccounts) {
    const raw = balMap.get(String(acc._id)) || { debitPaisa: 0, creditPaisa: 0 };
    if (acc.systemTag === 'ACCUM_DEPRECIATION') {
      glAccumDepPaisa += raw.creditPaisa - raw.debitPaisa;
    } else {
      glGrossCostPaisa += raw.debitPaisa - raw.creditPaisa;
    }
  }

  return {
    rows,
    summary: {
      activeCount,
      disposedCount,
      totalCostPaisa,
      totalAccumulatedDepreciationPaisa,
      totalNetBookValuePaisa,
      glGrossCostPaisa,
      glAccumDepPaisa,
      glNetBookValuePaisa: glGrossCostPaisa - glAccumDepPaisa,
    },
  };
}

export async function getExpenseSummaryReport(startDateInput?: string, endDateInput?: string) {
  await ensureAccountsSeeded();
  const dateFilter: Record<string, Date> = {};
  if (startDateInput) dateFilter.$gte = utcStartOfDay(startDateInput);
  if (endDateInput) dateFilter.$lte = utcEndOfDay(endDateInput);

  const expMatch: Record<string, unknown> = { status: 'Posted', isDeleted: false };
  if (Object.keys(dateFilter).length > 0) expMatch.date = dateFilter;

  const [byCategory, glExpenseAccounts, balMap] = await Promise.all([
    ExpenseRecord.aggregate<{
      _id: { categoryName: string; accountCode: string };
      count: number;
      totalPaisa: number;
      paidPaisa: number;
      unpaidPaisa: number;
      prepaidPaisa: number;
    }>([
      { $match: expMatch },
      {
        $group: {
          _id: { categoryName: '$categoryName', accountCode: '$accountCode' },
          count: { $sum: 1 },
          totalPaisa: { $sum: '$amountPaisa' },
          paidPaisa: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'Paid'] }, '$amountPaisa', 0] },
          },
          unpaidPaisa: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'Unpaid'] }, '$amountPaisa', 0] },
          },
          prepaidPaisa: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'Prepaid'] }, '$amountPaisa', 0] },
          },
        },
      },
      { $sort: { totalPaisa: -1 } },
    ]),
    Account.find({ type: 'Expense', isGroup: false, active: true, isDeleted: { $ne: true } }).sort({ code: 1 }).lean(),
    aggregatePostedBalancesByAccount(dateFilter),
  ]);

  const glBreakdown = glExpenseAccounts
    .map((acc) => {
      const raw = balMap.get(String(acc._id)) || { debitPaisa: 0, creditPaisa: 0 };
      return {
        code: acc.code,
        name: acc.name,
        amountPaisa: raw.debitPaisa - raw.creditPaisa,
      };
    })
    .filter((r) => r.amountPaisa !== 0);

  return {
    startDate: startDateInput || null,
    endDate: endDateInput || null,
    categories: byCategory.map((c) => ({
      categoryName: c._id.categoryName,
      accountCode: c._id.accountCode,
      count: c.count,
      totalPaisa: c.totalPaisa,
      paidPaisa: c.paidPaisa,
      unpaidPaisa: c.unpaidPaisa,
      prepaidPaisa: c.prepaidPaisa,
    })),
    glBreakdown,
    totalGlExpensePaisa: glBreakdown.reduce((s, r) => s + r.amountPaisa, 0),
  };
}

export async function getPayablesAgingReport(asOfDateInput?: string) {
  await ensureAccountsSeeded();
  const asOf = utcEndOfDay(asOfDateInput);

  const [openBills, payableAcc, balMap] = await Promise.all([
    VendorBill.find({
      isDeleted: false,
      status: { $in: ['Open', 'PartiallyPaid'] },
      duePaisa: { $gt: 0 },
    })
      .sort({ dueDate: 1 })
      .lean(),
    Account.findOne({ systemTag: 'VENDOR_PAYABLE' }).lean(),
    aggregatePostedBalancesByAccount({ $lte: asOf }),
  ]);

  const buckets = {
    currentPaisa: 0,
    days0to30Paisa: 0,
    days31to60Paisa: 0,
    days61to90Paisa: 0,
    days90PlusPaisa: 0,
    totalDuePaisa: 0,
  };

  const rows = openBills.map((b) => {
    const msDiff = asOf.getTime() - new Date(b.dueDate).getTime();
    const overdueDays = Math.floor(msDiff / (24 * 60 * 60 * 1000));
    let bucket: string;
    if (overdueDays <= 0) {
      bucket = 'Current';
      buckets.currentPaisa += b.duePaisa;
    } else if (overdueDays <= 30) {
      bucket = '1-30 Days';
      buckets.days0to30Paisa += b.duePaisa;
    } else if (overdueDays <= 60) {
      bucket = '31-60 Days';
      buckets.days31to60Paisa += b.duePaisa;
    } else if (overdueDays <= 90) {
      bucket = '61-90 Days';
      buckets.days61to90Paisa += b.duePaisa;
    } else {
      bucket = '90+ Days';
      buckets.days90PlusPaisa += b.duePaisa;
    }
    buckets.totalDuePaisa += b.duePaisa;
    return {
      ...b,
      overdueDays: Math.max(0, overdueDays),
      bucket,
    };
  });

  const glRaw = payableAcc ? balMap.get(String(payableAcc._id)) : undefined;
  const glPayableBalancePaisa = glRaw ? glRaw.creditPaisa - glRaw.debitPaisa : 0;

  return {
    asOfDate: asOf.toISOString(),
    buckets,
    glPayableBalancePaisa,
    rows,
  };
}

