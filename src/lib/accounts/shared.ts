import mongoose from 'mongoose';
import { Account } from '@/models/Account';
import { VendorBill } from '@/models/VendorBill';
import { getNextSequence } from '@/models/Counter';

export interface ActorUser {
  userId?: string;
  name?: string;
  username?: string;
  role?: string;
}

export function escapeSearchRegex(search: string): RegExp {
  return new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

export function utcStartOfDay(dateInput: string | Date): Date {
  const d = new Date(dateInput);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function utcEndOfDay(dateInput?: string | Date): Date {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    now.setUTCHours(23, 59, 59, 999);
    return now;
  }
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

export async function resolveActiveExpenseAccount(code: string) {
  const acc = await Account.findOne({
    code: code.trim(),
    type: 'Expense',
    isGroup: false,
    active: true,
    isDeleted: { $ne: true },
  }).lean();
  if (!acc) {
    throw new Error(`Expense account ${code} not found or inactive`);
  }
  return acc;
}

export async function createLinkedVendorBill(
  params: {
    vendorName: string;
    billDate: Date;
    dueDays: number;
    dueDate?: Date;
    itemDescription: string;
    billDescription: string;
    amountPaisa: number;
    paidPaisa?: number;
    accrualEntryId: mongoose.Types.ObjectId;
    kind: 'Expense' | 'AssetPurchase';
    expenseId?: mongoose.Types.ObjectId;
    assetId?: mongoose.Types.ObjectId;
    expenseAccountCode?: string;
    branch: string;
    createdBy: string;
  },
  session: mongoose.ClientSession
) {
  const billSeq = await getNextSequence('vendor_bill_no');
  const billNo = `BILL-${String(billSeq).padStart(5, '0')}`;
  const paidPaisa = params.paidPaisa ?? 0;
  const duePaisa = Math.max(0, params.amountPaisa - paidPaisa);
  const status = duePaisa === 0 ? 'Paid' : paidPaisa > 0 ? 'PartiallyPaid' : 'Open';
  const dueDate =
    params.dueDate || new Date(params.billDate.getTime() + params.dueDays * 24 * 60 * 60 * 1000);
  const [bill] = await VendorBill.create(
    [
      {
        billNo,
        vendorName: params.vendorName,
        billDate: params.billDate,
        dueDate,
        items: [{ description: params.itemDescription, amountPaisa: params.amountPaisa }],
        description: params.billDescription,
        totalPaisa: params.amountPaisa,
        paidPaisa,
        duePaisa,
        status,
        accrualEntryId: params.accrualEntryId,
        kind: params.kind,
        expenseId: params.expenseId || null,
        assetId: params.assetId || null,
        expenseAccountCode: params.expenseAccountCode || '',
        branch: params.branch,
        createdBy: params.createdBy,
      },
    ],
    { session }
  );
  return bill;
}

