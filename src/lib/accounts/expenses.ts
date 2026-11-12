import mongoose from 'mongoose';
import { ExpenseCategory } from '@/models/ExpenseCategory';
import { ExpenseRecord, ExpensePaymentMethod, ExpensePaymentStatus } from '@/models/ExpenseRecord';
import { VendorBill } from '@/models/VendorBill';
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
  resolveActiveExpenseAccount,
  utcEndOfDay,
  utcStartOfDay,
} from '@/lib/accounts/shared';

const DEFAULT_CATEGORIES = [
  { name: 'Electricity', accountCode: '5250', systemTag: 'EXP_ELECTRICITY', description: 'Electricity & power bills' },
  { name: 'Gas', accountCode: '5255', systemTag: 'EXP_GAS', description: 'Gas & utility fuel' },
  { name: 'Office / House Rent', accountCode: '5260', systemTag: 'EXP_RENT', description: 'Office, hostel & training center rent' },
  { name: 'Transport & Conveyance', accountCode: '5265', systemTag: 'EXP_TRANSPORT', description: 'Local travel, fuel & conveyance' },
  { name: 'Internet & Phone', accountCode: '5270', systemTag: 'EXP_INTERNET', description: 'Broadband, mobile & telephone bills' },
  { name: 'Repairs & Maintenance', accountCode: '5275', systemTag: 'EXP_REPAIRS', description: 'Equipment & facility maintenance' },
  { name: 'Stationery & Office Supplies', accountCode: '5280', systemTag: 'EXP_STATIONERY', description: 'Paper, printing & consumables' },
  { name: 'Miscellaneous Expense', accountCode: '5299', systemTag: 'EXP_MISC', description: 'Other general operating expenses' },
];

export async function ensureDefaultExpenseCategories() {
  await ensureAccountsSeeded();
  const existing = await ExpenseCategory.find({ isDeleted: false }).select('name accountCode').lean();
  const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));
  const toCreate = DEFAULT_CATEGORIES.filter((d) => !existingNames.has(d.name.toLowerCase()));
  if (toCreate.length > 0) {
    await ExpenseCategory.insertMany(
      toCreate.map((c) => ({ ...c, active: true, isDeleted: false, createdBy: 'system' })),
      { ordered: false }
    ).catch(() => {});
  }
}

export async function listExpenseCategories(activeOnly = false) {
  await ensureDefaultExpenseCategories();
  const query: Record<string, unknown> = { isDeleted: false };
  if (activeOnly) query.active = true;
  return ExpenseCategory.find(query).sort({ accountCode: 1, name: 1 }).lean();
}

export async function createExpenseCategory(
  input: { name: string; accountCode: string; description?: string },
  user: ActorUser
) {
  await ensureAccountsSeeded();
  const name = (input.name || '').trim();
  if (!name) throw new Error('Category name is required');
  const account = await resolveActiveExpenseAccount(input.accountCode || '');

  const dup = await ExpenseCategory.findOne({
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    isDeleted: false,
  }).lean();
  if (dup) throw new Error(`Expense category "${name}" already exists`);

  const created = await ExpenseCategory.create({
    name,
    accountCode: account.code,
    systemTag: account.systemTag || '',
    description: (input.description || '').trim(),
    active: true,
    createdBy: user.name || user.username || 'system',
  });
  return created.toObject();
}

export async function updateExpenseCategory(
  id: string,
  patch: { name?: string; accountCode?: string; description?: string; active?: boolean }
) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('Invalid category ID');
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined && patch.name.trim()) update.name = patch.name.trim();
  if (patch.description !== undefined) update.description = patch.description.trim();
  if (patch.active !== undefined) update.active = Boolean(patch.active);
  if (patch.accountCode !== undefined && patch.accountCode.trim()) {
    const account = await resolveActiveExpenseAccount(patch.accountCode);
    update.accountCode = account.code;
    update.systemTag = account.systemTag || '';
  }

  const updated = await ExpenseCategory.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: update },
    { new: true }
  ).lean();
  if (!updated) throw new Error('Expense category not found');
  return updated;
}

export async function listExpenses(filters?: {
  status?: string;
  paymentStatus?: string;
  categoryId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}) {
  await ensureDefaultExpenseCategories();
  const query: Record<string, unknown> = { isDeleted: false };
  if (filters?.status && filters.status !== 'All') query.status = filters.status;
  if (filters?.paymentStatus && filters.paymentStatus !== 'All') {
    query.paymentStatus = filters.paymentStatus;
  }
  if (filters?.categoryId && filters.categoryId !== 'All' && mongoose.Types.ObjectId.isValid(filters.categoryId)) {
    query.categoryId = new mongoose.Types.ObjectId(filters.categoryId);
  }
  if (filters?.startDate || filters?.endDate) {
    const dateFilter: Record<string, Date> = {};
    if (filters.startDate) dateFilter.$gte = utcStartOfDay(filters.startDate);
    if (filters.endDate) dateFilter.$lte = utcEndOfDay(filters.endDate);
    query.date = dateFilter;
  }
  if (filters?.search?.trim()) {
    const rx = escapeSearchRegex(filters.search);
    query.$or = [
      { expenseNo: rx },
      { categoryName: rx },
      { payeeName: rx },
      { description: rx },
      { reference: rx },
    ];
  }
  return ExpenseRecord.find(query).sort({ date: -1, createdAt: -1 }).lean();
}

export interface CreateExpenseInput {
  date: string | Date;
  categoryId: string;
  amountPaisa: number;
  payeeName?: string;
  description: string;
  paymentStatus: ExpensePaymentStatus;
  paymentMethod?: ExpensePaymentMethod;
  reference?: string;
  attachmentUrl?: string;
  branch?: string;
  department?: string;
}

export async function createExpenseRecord(input: CreateExpenseInput, user: ActorUser) {
  await ensureDefaultExpenseCategories();

  if (!mongoose.Types.ObjectId.isValid(input.categoryId)) {
    throw new Error('Valid expense category is required');
  }
  const amountPaisa = assertIntPaisa(input.amountPaisa, 'amountPaisa');
  if (amountPaisa <= 0) throw new Error('Expense amount must be greater than zero');

  const date = new Date(input.date);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid expense date');

  const description = (input.description || '').trim();
  if (!description) throw new Error('Expense description is required');

  const category = await ExpenseCategory.findOne({ _id: input.categoryId, isDeleted: false }).lean();
  if (!category) throw new Error('Expense category not found');

  const expAccount = await resolveActiveExpenseAccount(category.accountCode);

  const seq = await getNextSequence('expense_record_no');
  const expenseNo = `EXP-${String(seq).padStart(5, '0')}`;
  const branch = input.branch || 'Main';
  const department = input.department || 'General';
  const paymentMethod: ExpensePaymentMethod =
    input.paymentStatus === 'Unpaid' ? 'None' : input.paymentMethod || 'Cash';

  return runInTransaction(async (session) => {
    await resolveOpenPeriodForDate(date, session);

    const [record] = await ExpenseRecord.create(
      [
        {
          expenseNo,
          date,
          categoryId: category._id,
          categoryName: category.name,
          accountCode: category.accountCode,
          amountPaisa,
          payeeName: (input.payeeName || '').trim(),
          description,
          paymentStatus: input.paymentStatus,
          paymentMethod,
          reference: (input.reference || '').trim(),
          attachmentUrl: (input.attachmentUrl || '').trim(),
          branch,
          department,
          status: 'Posted',
          createdBy: user.name || user.username || 'system',
        },
      ],
      { session }
    );

    const recordIdStr = String(record._id);
    let debitAccountId: string;
    let creditAccountId: string;
    let journalType: 'PV' | 'JV' = 'PV';

    if (input.paymentStatus === 'Paid') {
      debitAccountId = String(expAccount._id);
      creditAccountId = await getSystemAccountId(resolveDepositSystemTag(paymentMethod));
      journalType = 'PV';
    } else if (input.paymentStatus === 'Unpaid') {
      debitAccountId = String(expAccount._id);
      creditAccountId = await getSystemAccountId('VENDOR_PAYABLE');
      journalType = 'JV';
    } else {
      // Prepaid / advance (Dr 1230 Security Deposits & Prepayments / Cr Cash/Bank/MFS)
      debitAccountId = await getSystemAccountId('PREPAYMENTS');
      creditAccountId = await getSystemAccountId(resolveDepositSystemTag(paymentMethod));
      journalType = 'PV';
    }

    const posted = await postTransactionEntry({
      journalType,
      entryDate: date,
      description: `${input.paymentStatus} Expense (${expenseNo}) — ${category.name}: ${description}`,
      reference: input.reference || expenseNo,
      sourceModule: 'EXPENSE',
      sourceId: recordIdStr,
      idempotencyKey: `EXPENSE:${recordIdStr}`,
      lines: [
        {
          accountId: debitAccountId,
          description: `${category.name} — ${description}`,
          debitPaisa: amountPaisa,
          creditPaisa: 0,
          branch,
          department,
        },
        {
          accountId: creditAccountId,
          description:
            input.paymentStatus === 'Unpaid'
              ? `Payable to ${input.payeeName || 'Vendor'} (${expenseNo})`
              : `Paid via ${paymentMethod} (${expenseNo})`,
          debitPaisa: 0,
          creditPaisa: amountPaisa,
          branch,
          department,
        },
      ],
      session,
      user,
    });

    record.entryId = posted.entry._id as mongoose.Types.ObjectId;

    let createdBill = null;
    if (input.paymentStatus === 'Unpaid') {
      const bill = await createLinkedVendorBill(
        {
          vendorName: (input.payeeName || 'Vendor').trim(),
          billDate: date,
          dueDays: 15,
          itemDescription: `${category.name}: ${description}`,
          billDescription: `Unpaid expense ${expenseNo}: ${description}`,
          amountPaisa,
          accrualEntryId: posted.entry._id as mongoose.Types.ObjectId,
          kind: 'Expense',
          expenseId: record._id as mongoose.Types.ObjectId,
          expenseAccountCode: category.accountCode,
          branch,
          createdBy: user.name || user.username || 'system',
        },
        session
      );
      record.vendorBillId = bill._id as mongoose.Types.ObjectId;
      createdBill = bill.toObject();
    }

    await record.save({ session });
    return { expense: record.toObject(), entry: posted.entry, bill: createdBill };
  });
}

export async function reverseExpenseRecord(id: string, reason: string, user: ActorUser) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('Invalid expense ID');
  if (!reason || reason.trim().length < 3) {
    throw new Error('Reversal reason (min 3 characters) is required');
  }

  return runInTransaction(async (session) => {
    const exp = await ExpenseRecord.findOne({ _id: id, isDeleted: false }).session(session);
    if (!exp) throw new Error('Expense record not found');
    if (exp.status !== 'Posted') throw new Error(`Expense is already ${exp.status}`);
    if (!exp.entryId) throw new Error('Expense has no linked journal entry');

    if (exp.vendorBillId) {
      const bill = await VendorBill.findById(exp.vendorBillId).session(session);
      if (bill && bill.paidPaisa > 0) {
        throw new Error('Reverse vendor bill payments before reversing this unpaid expense');
      }
    }

    const res = await reverseJournalEntry({
      entryId: String(exp.entryId),
      reason: reason.trim(),
      session,
      user,
    });

    exp.status = 'Reversed';
    exp.reversalEntryId = res.reversal._id as mongoose.Types.ObjectId;
    exp.reversedBy = user.name || user.username || 'system';
    exp.reversedAt = new Date();
    await exp.save({ session });

    if (exp.vendorBillId) {
      await VendorBill.updateOne(
        { _id: exp.vendorBillId },
        {
          $set: {
            status: 'Reversed',
            duePaisa: 0,
            reversalEntryId: res.reversal._id,
          },
        },
        { session }
      );
    }

    return { expense: exp.toObject(), reversal: res.reversal };
  });
}

