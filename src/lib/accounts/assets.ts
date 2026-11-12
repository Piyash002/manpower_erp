import mongoose from 'mongoose';
import {
  FixedAsset,
  FixedAssetCategoryTag,
  FixedAssetCondition,
  IFixedAsset,
} from '@/models/FixedAsset';
import { VendorBill } from '@/models/VendorBill';
import { VendorBillPayment } from '@/models/VendorBillPayment';
import { DepreciationRun } from '@/models/DepreciationRun';
import { getNextSequence } from '@/models/Counter';
import { ensureAccountsSeeded } from '@/lib/accounts-seed';
import { assertIntPaisa } from '@/lib/accounts-money';
import {
  getSystemAccountId,
  postTransactionEntry,
  resolveDepositSystemTag,
  resolveOpenPeriodForDate,
  reverseJournalEntry,
  runInTransaction,
} from '@/lib/accounts/posting';
import {
  ActorUser,
  createLinkedVendorBill,
  escapeSearchRegex,
} from '@/lib/accounts/shared';

export type { ActorUser };

export interface RegisterFixedAssetInput {
  name: string;
  categoryTag: FixedAssetCategoryTag;
  quantity?: number;
  unitCostPaisa?: number;
  costPaisa?: number;
  purchaseDate: string | Date;
  depreciationStartDate?: string | Date;
  supplier?: string;
  location?: string;
  condition?: FixedAssetCondition;
  usefulLifeMonths: number;
  salvageValuePaisa?: number;
  paymentType: 'Paid' | 'Credit' | 'Opening';
  paymentMethod?: string;
  bankName?: string;
  chequeNo?: string;
  chequeDate?: string | Date | null;
  reference?: string;
  attachmentUrl?: string;
  dueDate?: string | Date;
  advancePaidPaisa?: number;
  openingAccumulatedPaisa?: number;
  separateUnits?: boolean;
  serialNumbers?: string[];
  serialNumber?: string;
  branch?: string;
}

export interface DisposeFixedAssetInput {
  disposalType: 'Disposed' | 'WrittenOff';
  disposalDate: string | Date;
  proceedsPaisa?: number;
  paymentMethod?: string;
  note?: string;
}

const VALID_CATEGORY_TAGS: FixedAssetCategoryTag[] = [
  'FA_TRAINING_EQUIPMENT',
  'FA_FURNITURE',
  'FA_COMPUTER',
  'FA_LEASEHOLD',
];

const VALID_PAYMENT_METHODS = ['Cash', 'Bank', 'Cheque', 'bKash', 'Nagad'] as const;

export async function listFixedAssets(filters?: {
  status?: string;
  categoryTag?: string;
  search?: string;
}) {
  await ensureAccountsSeeded();
  const query: Record<string, unknown> = { isDeleted: false };
  if (filters?.status && filters.status !== 'All') {
    query.status = filters.status;
  }
  if (filters?.categoryTag && filters.categoryTag !== 'All') {
    query.categoryTag = filters.categoryTag;
  }
  if (filters?.search?.trim()) {
    const rx = escapeSearchRegex(filters.search);
    query.$or = [
      { assetCode: rx },
      { name: rx },
      { supplier: rx },
      { location: rx },
      { serialNumber: rx },
    ];
  }
  return FixedAsset.find(query).sort({ purchaseDate: -1, createdAt: -1 }).lean();
}

export async function getFixedAssetById(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid fixed asset ID');
  }
  const asset = await FixedAsset.findOne({ _id: id, isDeleted: false }).lean();
  if (!asset) {
    throw new Error('Fixed asset not found');
  }
  return asset;
}

function splitIntegerAcrossUnits(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const rem = total - base * count;
  return Array.from({ length: count }, (_, idx) => (idx === count - 1 ? base + rem : base));
}

export async function registerFixedAsset(input: RegisterFixedAssetInput, user: ActorUser) {
  await ensureAccountsSeeded();

  const name = (input.name || '').trim();
  if (!name) throw new Error('Asset name is required');
  if (!VALID_CATEGORY_TAGS.includes(input.categoryTag)) {
    throw new Error('Invalid fixed asset category');
  }

  const quantity = Math.floor(Number(input.quantity ?? 1));
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new Error('Quantity must be at least 1');
  }

  let totalCostPaisa: number;
  let unitCostPaisa: number;
  if (input.unitCostPaisa !== undefined && input.unitCostPaisa !== null) {
    unitCostPaisa = assertIntPaisa(input.unitCostPaisa, 'unitCostPaisa');
    if (unitCostPaisa <= 0) throw new Error('Unit cost must be greater than zero');
    totalCostPaisa = unitCostPaisa * quantity;
  } else {
    totalCostPaisa = assertIntPaisa(input.costPaisa ?? 0, 'costPaisa');
    if (totalCostPaisa <= 0) throw new Error('Asset cost must be greater than zero');
    unitCostPaisa = Math.floor(totalCostPaisa / quantity);
  }

  const salvageValuePaisa = assertIntPaisa(input.salvageValuePaisa ?? 0, 'salvageValuePaisa');
  if (salvageValuePaisa < 0 || salvageValuePaisa > totalCostPaisa) {
    throw new Error('Salvage value must be between 0 and total asset cost');
  }

  const usefulLifeMonths = Math.floor(Number(input.usefulLifeMonths));
  if (!Number.isFinite(usefulLifeMonths) || usefulLifeMonths < 1) {
    throw new Error('Useful life (months) must be at least 1');
  }

  const purchaseDate = new Date(input.purchaseDate);
  if (Number.isNaN(purchaseDate.getTime())) {
    throw new Error('Invalid purchase / cutover date');
  }

  const depreciationStartDate = input.depreciationStartDate
    ? new Date(input.depreciationStartDate)
    : purchaseDate;
  if (Number.isNaN(depreciationStartDate.getTime())) {
    throw new Error('Invalid depreciation start date');
  }

  const separateUnits = Boolean(input.separateUnits) && quantity > 1;
  const serialNumbers = Array.isArray(input.serialNumbers)
    ? input.serialNumbers.map((s) => String(s || '').trim())
    : [];
  const hasAnySerial = serialNumbers.some((s) => s.length > 0);
  if (separateUnits && hasAnySerial && serialNumbers.length !== quantity) {
    throw new Error(`Serial numbers count (${serialNumbers.length}) must match quantity (${quantity}) or be left empty`);
  }

  const branch = input.branch || 'Main';
  const createdBy = user.name || user.username || 'system';
  const seq = await getNextSequence('fixed_asset_code');
  const baseCode = `FA-${String(seq).padStart(4, '0')}`;

  // Validate acquisition-mode specific fields before starting transaction
  let advancePaidPaisa = 0;
  let creditDueDate: Date | undefined;
  let openingAccumPaisa = 0;

  if (input.paymentType === 'Credit') {
    advancePaidPaisa = assertIntPaisa(input.advancePaidPaisa ?? 0, 'advancePaidPaisa');
    if (advancePaidPaisa < 0) {
      throw new Error('Advance paid cannot be negative');
    }
    if (advancePaidPaisa >= totalCostPaisa) {
      throw new Error('Advance paid must be less than total cost (use Paid Now for full payment)');
    }
    if (input.dueDate) {
      creditDueDate = new Date(input.dueDate);
      if (Number.isNaN(creditDueDate.getTime())) {
        throw new Error('Invalid due date for On Credit purchase');
      }
    } else {
      creditDueDate = new Date(purchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
  } else if (input.paymentType === 'Opening') {
    openingAccumPaisa = assertIntPaisa(
      input.openingAccumulatedPaisa ?? 0,
      'openingAccumulatedPaisa'
    );
    const maxDepreciable = totalCostPaisa - salvageValuePaisa;
    if (openingAccumPaisa < 0 || openingAccumPaisa > maxDepreciable) {
      throw new Error('Opening accumulated depreciation cannot exceed (total cost - salvage value)');
    }
  }

  const hasCashOrBankMovement =
    input.paymentType === 'Paid' ||
    (input.paymentType === 'Credit' && advancePaidPaisa > 0);

  const rawMethod = (input.paymentMethod || 'Cash') as (typeof VALID_PAYMENT_METHODS)[number];
  const paymentMethod = hasCashOrBankMovement
    ? VALID_PAYMENT_METHODS.includes(rawMethod)
      ? rawMethod
      : 'Cash'
    : input.paymentType;

  const bankName = hasCashOrBankMovement ? (input.bankName || '').trim() : '';
  const chequeNo = hasCashOrBankMovement && paymentMethod === 'Cheque' ? (input.chequeNo || '').trim() : '';
  const reference = hasCashOrBankMovement ? (input.reference || '').trim() : '';
  let chequeDate: Date | null = null;
  if (hasCashOrBankMovement && paymentMethod === 'Cheque' && input.chequeDate) {
    chequeDate = new Date(input.chequeDate);
    if (Number.isNaN(chequeDate.getTime())) {
      throw new Error('Invalid cheque date');
    }
  }

  return runInTransaction(async (session) => {
    await resolveOpenPeriodForDate(purchaseDate, session);

    const assetAccountId = await getSystemAccountId(input.categoryTag);
    const purchaseGroupId = separateUnits ? new mongoose.Types.ObjectId().toString() : '';

    // Build 1 or N FixedAsset documents
    const unitCount = separateUnits ? quantity : 1;
    const unitCosts = separateUnits
      ? input.unitCostPaisa !== undefined
        ? Array.from({ length: unitCount }, () => unitCostPaisa)
        : splitIntegerAcrossUnits(totalCostPaisa, unitCount)
      : [totalCostPaisa];
    const unitSalvages = separateUnits
      ? splitIntegerAcrossUnits(salvageValuePaisa, unitCount)
      : [salvageValuePaisa];
    const unitOpeningAccums = separateUnits
      ? splitIntegerAcrossUnits(openingAccumPaisa, unitCount)
      : [openingAccumPaisa];

    const docsToInsert = Array.from({ length: unitCount }, (_, idx) => {
      const code = separateUnits
        ? `${baseCode}-${String(idx + 1).padStart(2, '0')}`
        : baseCode;
      const serial = separateUnits
        ? serialNumbers[idx] || ''
        : (input.serialNumber || '').trim();
      return {
        assetCode: code,
        name,
        categoryTag: input.categoryTag,
        quantity: separateUnits ? 1 : quantity,
        purchaseDate,
        depreciationStartDate,
        unitCostPaisa: unitCosts[idx],
        costPaisa: unitCosts[idx],
        serialNumber: serial,
        purchaseGroupId,
        supplier: (input.supplier || '').trim(),
        location: (input.location || '').trim(),
        condition: input.condition || 'Good',
        usefulLifeMonths,
        salvageValuePaisa: unitSalvages[idx],
        depreciationMethod: 'StraightLine' as const,
        accumulatedDepreciationPaisa: input.paymentType === 'Opening' ? unitOpeningAccums[idx] : 0,
        status: 'Active' as const,
        isPreExisting: input.paymentType === 'Opening',
        paymentType: input.paymentType,
        paymentMethod,
        advancePaidPaisa: input.paymentType === 'Credit' ? advancePaidPaisa : 0,
        bankName,
        chequeNo,
        chequeDate,
        reference,
        attachmentUrl: (input.attachmentUrl || '').trim(),
        branch,
        createdBy,
      };
    });

    const createdAssets = await FixedAsset.create(docsToInsert, { session, ordered: true });
    const primaryAsset = createdAssets[0];
    const primaryAssetIdStr = String(primaryAsset._id);
    const sharedSourceId = separateUnits ? purchaseGroupId : primaryAssetIdStr;

    // Build balanced journal entry depending on acquisition mode
    let journalType: 'PV' | 'JV' = 'PV';
    let idempotencyKey = `ASSET_PURCHASE:${sharedSourceId}`;
    let description = `Fixed Asset Purchase (${baseCode}): ${name}`;
    const lines: Array<{
      accountId: string;
      description: string;
      debitPaisa: number;
      creditPaisa: number;
      branch?: string;
    }> = [
      {
        accountId: assetAccountId,
        description: `${baseCode} - ${name}${separateUnits ? ` (${unitCount} units)` : ''}`,
        debitPaisa: totalCostPaisa,
        creditPaisa: 0,
        branch,
      },
    ];

    if (input.paymentType === 'Opening') {
      journalType = 'JV';
      idempotencyKey = `ASSET_OPENING:${sharedSourceId}`;
      description = `Opening Fixed Asset (${baseCode}): ${name}`;

      if (openingAccumPaisa > 0) {
        const accumAccountId = await getSystemAccountId('ACCUM_DEPRECIATION');
        lines.push({
          accountId: accumAccountId,
          description: `Opening accumulated depreciation (${baseCode})`,
          debitPaisa: 0,
          creditPaisa: openingAccumPaisa,
          branch,
        });
      }

      const netEquityPaisa = totalCostPaisa - openingAccumPaisa;
      if (netEquityPaisa > 0) {
        const openingEquityId = await getSystemAccountId('OPENING_EQUITY');
        lines.push({
          accountId: openingEquityId,
          description: `Opening balance equity (${baseCode})`,
          debitPaisa: 0,
          creditPaisa: netEquityPaisa,
          branch,
        });
      }
    } else if (input.paymentType === 'Credit') {
      journalType = 'JV';
      if (advancePaidPaisa > 0) {
        const depositAccountId = await getSystemAccountId(resolveDepositSystemTag(paymentMethod));
        lines.push({
          accountId: depositAccountId,
          description: `Advance paid for ${baseCode} via ${paymentMethod}`,
          debitPaisa: 0,
          creditPaisa: advancePaidPaisa,
          branch,
        });
      }
      const payableAccountId = await getSystemAccountId('VENDOR_PAYABLE');
      lines.push({
        accountId: payableAccountId,
        description: `Payable for ${baseCode} (${input.supplier || 'Vendor'})`,
        debitPaisa: 0,
        creditPaisa: totalCostPaisa - advancePaidPaisa,
        branch,
      });
    } else {
      journalType = 'PV';
      const depositAccountId = await getSystemAccountId(resolveDepositSystemTag(paymentMethod));
      lines.push({
        accountId: depositAccountId,
        description: `Payment for ${baseCode} via ${paymentMethod}`,
        debitPaisa: 0,
        creditPaisa: totalCostPaisa,
        branch,
      });
    }

    const posted = await postTransactionEntry({
      journalType,
      entryDate: purchaseDate,
      description,
      reference: reference || chequeNo || baseCode,
      sourceModule: 'ASSET',
      sourceId: sharedSourceId,
      idempotencyKey,
      lines,
      session,
      user,
    });

    let createdBill = null;
    let createdAdvancePayment = null;

    if (input.paymentType === 'Credit') {
      const bill = await createLinkedVendorBill(
        {
          vendorName: (input.supplier || 'Asset Supplier').trim(),
          billDate: purchaseDate,
          dueDays: 30,
          dueDate: creditDueDate,
          itemDescription: `${baseCode} - ${name}${separateUnits ? ` (${unitCount} units)` : ''}`,
          billDescription: `Asset purchase on credit: ${baseCode} - ${name}`,
          amountPaisa: totalCostPaisa,
          paidPaisa: advancePaidPaisa,
          accrualEntryId: posted.entry._id as mongoose.Types.ObjectId,
          kind: 'AssetPurchase',
          assetId: primaryAsset._id as mongoose.Types.ObjectId,
          branch,
          createdBy,
        },
        session
      );
      createdBill = bill.toObject();

      if (advancePaidPaisa > 0) {
        const paySeq = await getNextSequence('vendor_bill_payment_no');
        const paymentNo = `BPAY-${String(paySeq).padStart(5, '0')}`;
        const [advPayment] = await VendorBillPayment.create(
          [
            {
              paymentNo,
              billId: bill._id,
              paymentDate: purchaseDate,
              amountPaisa: advancePaidPaisa,
              method: paymentMethod as 'Cash' | 'Bank' | 'Cheque' | 'bKash' | 'Nagad',
              reference: reference || chequeNo || baseCode,
              bankName,
              chequeNo,
              chequeDate,
              entryId: posted.entry._id,
              status: 'Posted',
              createdBy,
            },
          ],
          { session }
        );
        createdAdvancePayment = advPayment.toObject();
      }
    }

    const updateFields: Record<string, unknown> = {
      purchaseEntryId: posted.entry._id,
    };
    if (createdBill) {
      updateFields.vendorBillId = createdBill._id;
    }

    await FixedAsset.updateMany(
      { _id: { $in: createdAssets.map((a) => a._id) } },
      { $set: updateFields },
      { session }
    );

    const refreshed = await FixedAsset.find({
      _id: { $in: createdAssets.map((a) => a._id) },
    })
      .sort({ assetCode: 1 })
      .session(session)
      .lean();

    return {
      asset: refreshed[0],
      assets: refreshed,
      entry: posted.entry,
      bill: createdBill,
      advancePayment: createdAdvancePayment,
    };
  });
}

export async function updateFixedAssetMeta(
  id: string,
  patch: Partial<
    Pick<IFixedAsset, 'name' | 'supplier' | 'location' | 'condition' | 'branch' | 'serialNumber'>
  >
) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('Invalid fixed asset ID');
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined && patch.name.trim()) update.name = patch.name.trim();
  if (patch.supplier !== undefined) update.supplier = patch.supplier.trim();
  if (patch.location !== undefined) update.location = patch.location.trim();
  if (patch.condition !== undefined) update.condition = patch.condition;
  if (patch.branch !== undefined && patch.branch.trim()) update.branch = patch.branch.trim();
  if (patch.serialNumber !== undefined) update.serialNumber = patch.serialNumber.trim();

  const updated = await FixedAsset.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: update },
    { new: true }
  ).lean();
  if (!updated) throw new Error('Fixed asset not found');
  return updated;
}

export async function disposeFixedAsset(
  id: string,
  input: DisposeFixedAssetInput,
  user: ActorUser
) {
  await ensureAccountsSeeded();
  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('Invalid fixed asset ID');

  const disposalDate = new Date(input.disposalDate);
  if (Number.isNaN(disposalDate.getTime())) throw new Error('Invalid disposal date');

  const proceedsPaisa =
    input.disposalType === 'WrittenOff'
      ? 0
      : assertIntPaisa(input.proceedsPaisa ?? 0, 'proceedsPaisa');
  if (proceedsPaisa < 0) throw new Error('Proceeds cannot be negative');

  return runInTransaction(async (session) => {
    const asset = await FixedAsset.findOne({ _id: id, isDeleted: false }).session(session);
    if (!asset) throw new Error('Fixed asset not found');
    if (asset.status !== 'Active') {
      throw new Error(`Asset is already ${asset.status}`);
    }

    await resolveOpenPeriodForDate(disposalDate, session);

    const cost = asset.costPaisa;
    const accum = asset.accumulatedDepreciationPaisa || 0;
    const netBookValue = cost - accum;
    const gainOrLoss = proceedsPaisa - netBookValue;

    const assetAccountId = await getSystemAccountId(asset.categoryTag);
    const accumAccountId = await getSystemAccountId('ACCUM_DEPRECIATION');
    const lines = [];

    if (proceedsPaisa > 0) {
      const depositTag = resolveDepositSystemTag(input.paymentMethod || 'Cash');
      const depositAccountId = await getSystemAccountId(depositTag);
      lines.push({
        accountId: depositAccountId,
        description: `Disposal proceeds for ${asset.assetCode}`,
        debitPaisa: proceedsPaisa,
        creditPaisa: 0,
        branch: asset.branch,
      });
    }

    if (accum > 0) {
      lines.push({
        accountId: accumAccountId,
        description: `Clear accumulated depreciation (${asset.assetCode})`,
        debitPaisa: accum,
        creditPaisa: 0,
        branch: asset.branch,
      });
    }

    lines.push({
      accountId: assetAccountId,
      description: `Remove asset cost (${asset.assetCode})`,
      debitPaisa: 0,
      creditPaisa: cost,
      branch: asset.branch,
    });

    if (gainOrLoss > 0) {
      const otherIncomeId = await getSystemAccountId('OTHER_INCOME');
      lines.push({
        accountId: otherIncomeId,
        description: `Gain on disposal of ${asset.assetCode}`,
        debitPaisa: 0,
        creditPaisa: gainOrLoss,
        branch: asset.branch,
      });
    } else if (gainOrLoss < 0) {
      const miscExpId = await getSystemAccountId('EXP_MISC');
      lines.push({
        accountId: miscExpId,
        description: `Loss on ${input.disposalType.toLowerCase()} of ${asset.assetCode}`,
        debitPaisa: Math.abs(gainOrLoss),
        creditPaisa: 0,
        branch: asset.branch,
      });
    }

    const posted = await postTransactionEntry({
      journalType: 'JV',
      entryDate: disposalDate,
      description: `Fixed Asset ${input.disposalType} (${asset.assetCode}): ${asset.name}`,
      reference: asset.assetCode,
      sourceModule: 'ASSET',
      sourceId: String(asset._id),
      idempotencyKey: `ASSET_DISPOSAL:${String(asset._id)}`,
      lines,
      session,
      user,
    });

    asset.status = input.disposalType;
    asset.disposalEntryId = posted.entry._id as mongoose.Types.ObjectId;
    asset.disposalDate = disposalDate;
    asset.disposalProceedsPaisa = proceedsPaisa;
    asset.disposalNote = (input.note || '').trim();
    await asset.save({ session });

    return { asset: asset.toObject(), entry: posted.entry };
  });
}

export async function reverseAssetPurchase(id: string, reason: string, user: ActorUser) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('Invalid fixed asset ID');
  if (!reason || reason.trim().length < 3) {
    throw new Error('Reversal reason (min 3 characters) is required');
  }

  return runInTransaction(async (session) => {
    const asset = await FixedAsset.findOne({ _id: id, isDeleted: false }).session(session);
    if (!asset) throw new Error('Fixed asset not found');
    if (!asset.purchaseEntryId) {
      throw new Error('Asset has no linked purchase journal entry');
    }

    // If part of a separate-units group, validate all units in the group
    const groupUnits = asset.purchaseGroupId
      ? await FixedAsset.find({
          purchaseGroupId: asset.purchaseGroupId,
          isDeleted: false,
        }).session(session)
      : [asset];

    for (const unit of groupUnits) {
      if (unit.status !== 'Active') {
        throw new Error(`Cannot reverse: unit ${unit.assetCode} is ${unit.status}`);
      }
      if ((unit.accumulatedDepreciationPaisa || 0) > 0 && !unit.isPreExisting) {
        throw new Error(
          `Reverse posted depreciation runs for ${unit.assetCode} before reversing purchase`
        );
      }
    }

    const hasPostedDepRun = await DepreciationRun.exists({
      'items.assetId': { $in: groupUnits.map((u) => u._id) },
      status: 'Posted',
      isDeleted: false,
    }).session(session);
    if (hasPostedDepRun) {
      throw new Error('Reverse posted depreciation runs for this asset before reversing purchase');
    }

    if (asset.vendorBillId) {
      const bill = await VendorBill.findById(asset.vendorBillId).session(session);
      if (bill) {
        const activePayments = await VendorBillPayment.find({
          billId: bill._id,
          status: 'Posted',
          isDeleted: false,
        }).session(session);

        const hasLaterPayments = activePayments.some(
          (p) => String(p.entryId) !== String(asset.purchaseEntryId)
        );
        if (hasLaterPayments) {
          throw new Error(
            'Reverse later vendor bill payments before reversing this asset purchase'
          );
        }
      }
    }

    const res = await reverseJournalEntry({
      entryId: String(asset.purchaseEntryId),
      reason: reason.trim(),
      session,
      user,
    });

    if (asset.vendorBillId) {
      await VendorBill.updateOne(
        { _id: asset.vendorBillId },
        {
          $set: {
            status: 'Reversed',
            duePaisa: 0,
            reversalEntryId: res.reversal._id,
          },
        },
        { session }
      );
      await VendorBillPayment.updateMany(
        {
          billId: asset.vendorBillId,
          entryId: asset.purchaseEntryId,
          status: 'Posted',
        },
        {
          $set: {
            status: 'Reversed',
            reversalEntryId: res.reversal._id,
          },
        },
        { session }
      );
    }

    await FixedAsset.updateMany(
      { _id: { $in: groupUnits.map((u) => u._id) } },
      {
        $set: {
          isDeleted: true,
          disposalNote: `Purchase Reversed: ${reason.trim()}`,
        },
      },
      { session }
    );

    return {
      asset: { ...asset.toObject(), isDeleted: true },
      reversedCount: groupUnits.length,
      reversal: res.reversal,
    };
  });
}
