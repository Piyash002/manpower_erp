import mongoose from 'mongoose';
import { AccountingPeriod } from '@/models/AccountingPeriod';
import { FixedAsset } from '@/models/FixedAsset';
import { DepreciationRun, IDepreciationRunItem } from '@/models/DepreciationRun';
import { ensureAccountsSeeded } from '@/lib/accounts-seed';
import {
  getSystemAccountId,
  postTransactionEntry,
  resolveOpenPeriodForDate,
  reverseJournalEntry,
  runInTransaction,
} from '@/lib/accounts/posting';
import type { ActorUser } from '@/lib/accounts/assets';

export async function listDepreciationRuns() {
  await ensureAccountsSeeded();
  return DepreciationRun.find({ isDeleted: false })
    .sort({ runDate: -1, createdAt: -1 })
    .lean();
}

export async function runMonthlyDepreciation(periodId: string, user: ActorUser) {
  await ensureAccountsSeeded();
  if (!mongoose.Types.ObjectId.isValid(periodId)) {
    throw new Error('Invalid accounting period ID');
  }

  return runInTransaction(async (session) => {
    const period = await AccountingPeriod.findById(periodId).session(session);
    if (!period) throw new Error('Accounting period not found');
    if (period.status !== 'Open') {
      throw new Error(`Accounting period "${period.name}" is ${period.status}. Depreciation blocked.`);
    }

    const { fiscalYearCode } = await resolveOpenPeriodForDate(period.endDate, session);

    const existing = await DepreciationRun.findOne({
      periodId: period._id,
      status: 'Posted',
      isDeleted: false,
    }).session(session);
    if (existing) {
      throw new Error(`Depreciation already posted for period "${period.name}"`);
    }

    const activeAssets = await FixedAsset.find({
      status: 'Active',
      isDeleted: false,
    }).session(session);

    const items: IDepreciationRunItem[] = [];
    let totalPaisa = 0;

    for (const asset of activeAssets) {
      const depStart = asset.depreciationStartDate || asset.purchaseDate;
      if (depStart > period.endDate) continue;
      const depreciableBase = asset.costPaisa - (asset.salvageValuePaisa || 0);
      const currentAccum = asset.accumulatedDepreciationPaisa || 0;
      const remaining = depreciableBase - currentAccum;
      if (remaining <= 0) continue;

      const life = Math.max(1, asset.usefulLifeMonths || 1);
      let monthly = Math.floor(depreciableBase / life);
      if (monthly <= 0) monthly = remaining;
      const amountPaisa = Math.min(monthly, remaining);
      if (amountPaisa <= 0) continue;

      const newAccum = currentAccum + amountPaisa;
      items.push({
        assetId: asset._id as mongoose.Types.ObjectId,
        assetCode: asset.assetCode,
        assetName: asset.name,
        amountPaisa,
        prevAccumPaisa: currentAccum,
        newAccumPaisa: newAccum,
      });
      totalPaisa += amountPaisa;
    }

    if (items.length === 0 || totalPaisa <= 0) {
      throw new Error('No eligible active assets with remaining depreciable value for this period');
    }

    const depExpAccountId = await getSystemAccountId('DEPRECIATION_EXPENSE');
    const accumDepAccountId = await getSystemAccountId('ACCUM_DEPRECIATION');
    const runDocId = new mongoose.Types.ObjectId();

    const posted = await postTransactionEntry({
      journalType: 'JV',
      entryDate: period.endDate,
      description: `Monthly Depreciation — ${period.name} (${items.length} asset${items.length > 1 ? 's' : ''})`,
      reference: `DEP-${period.year}-${String(period.month).padStart(2, '0')}`,
      sourceModule: 'DEPRECIATION',
      sourceId: String(runDocId),
      idempotencyKey: `DEPRECIATION:${String(period._id)}:${String(runDocId)}`,
      lines: [
        {
          accountId: depExpAccountId,
          description: `Depreciation expense for ${period.name}`,
          debitPaisa: totalPaisa,
          creditPaisa: 0,
        },
        {
          accountId: accumDepAccountId,
          description: `Accumulated depreciation for ${period.name}`,
          debitPaisa: 0,
          creditPaisa: totalPaisa,
        },
      ],
      session,
      user,
    });

    for (const item of items) {
      await FixedAsset.updateOne(
        { _id: item.assetId },
        { $set: { accumulatedDepreciationPaisa: item.newAccumPaisa } },
        { session }
      );
    }

    const [run] = await DepreciationRun.create(
      [
        {
          _id: runDocId,
          periodId: period._id,
          periodName: period.name,
          fiscalYearCode,
          runDate: period.endDate,
          totalPaisa,
          entryId: posted.entry._id,
          status: 'Posted',
          items,
          createdBy: user.name || user.username || 'system',
        },
      ],
      { session }
    );

    return { run: run.toObject(), entry: posted.entry };
  });
}

export async function reverseDepreciationRun(runId: string, reason: string, user: ActorUser) {
  if (!mongoose.Types.ObjectId.isValid(runId)) {
    throw new Error('Invalid depreciation run ID');
  }
  if (!reason || reason.trim().length < 3) {
    throw new Error('Reversal reason (min 3 characters) is required');
  }

  return runInTransaction(async (session) => {
    const run = await DepreciationRun.findOne({ _id: runId, isDeleted: false }).session(session);
    if (!run) throw new Error('Depreciation run not found');
    if (run.status !== 'Posted') {
      throw new Error(`Depreciation run is already ${run.status}`);
    }

    const res = await reverseJournalEntry({
      entryId: String(run.entryId),
      reason: reason.trim(),
      session,
      user,
    });

    for (const item of run.items) {
      const asset = await FixedAsset.findById(item.assetId).session(session);
      if (asset) {
        asset.accumulatedDepreciationPaisa = Math.max(
          0,
          (asset.accumulatedDepreciationPaisa || 0) - item.amountPaisa
        );
        await asset.save({ session });
      }
    }

    run.status = 'Reversed';
    run.reversalEntryId = res.reversal._id as mongoose.Types.ObjectId;
    run.reversedBy = user.name || user.username || 'system';
    run.reversedAt = new Date();
    await run.save({ session });

    return { run: run.toObject(), reversal: res.reversal };
  });
}

