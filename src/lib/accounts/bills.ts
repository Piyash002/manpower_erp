import mongoose from 'mongoose';
import { VendorBill } from '@/models/VendorBill';
import { VendorBillPayment } from '@/models/VendorBillPayment';
import { Loan } from '@/models/Loan';
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
  escapeSearchRegex,
  resolveActiveExpenseAccount,
} from '@/lib/accounts/shared';

export async function listVendorBills(filters?: { status?: string; search?: string }) {
  await ensureAccountsSeeded();
  const query: Record<string, unknown> = { isDeleted: false };
  if (filters?.status && filters.status !== 'All') {
    query.status = filters.status;
  }
  if (filters?.search?.trim()) {
    const rx = escapeSearchRegex(filters.search);
    query.$or = [{ billNo: rx }, { vendorName: rx }, { description: rx }];
  }
  return VendorBill.find(query).sort({ billDate: -1, createdAt: -1 }).lean();
}

export async function getVendorBillDetail(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('Invalid vendor bill ID');
  const bill = await VendorBill.findOne({ _id: id, isDeleted: false }).lean();
  if (!bill) throw new Error('Vendor bill not found');
  const payments = await VendorBillPayment.find({ billId: bill._id, isDeleted: false })
    .sort({ paymentDate: -1, createdAt: -1 })
    .lean();
  return { bill, payments };
}

export interface CreateVendorBillInput {
  vendorName: string;
  billDate: string | Date;
  dueDate: string | Date;
  description: string;
  expenseAccountCode?: string;
  items?: Array<{ description: string; amountPaisa: number }>;
  totalPaisa?: number;
  attachmentUrl?: string;
  branch?: string;
}

export async function createVendorBill(input: CreateVendorBillInput, user: ActorUser) {
  await ensureAccountsSeeded();
  const vendorName = (input.vendorName || '').trim();
  if (!vendorName) throw new Error('Vendor name is required');
  const billDate = new Date(input.billDate);
  const dueDate = new Date(input.dueDate);
  if (Number.isNaN(billDate.getTime()) || Number.isNaN(dueDate.getTime())) {
    throw new Error('Valid bill date and due date are required');
  }

  const items =
    Array.isArray(input.items) && input.items.length > 0
      ? input.items.map((it) => ({
          description: (it.description || input.description || 'Item').trim(),
          amountPaisa: assertIntPaisa(it.amountPaisa, 'item.amountPaisa'),
        }))
      : [
          {
            description: (input.description || 'Vendor Bill').trim(),
            amountPaisa: assertIntPaisa(input.totalPaisa ?? 0, 'totalPaisa'),
          },
        ];

  const totalPaisa = items.reduce((s, it) => s + it.amountPaisa, 0);
  if (totalPaisa <= 0 || items.some((it) => it.amountPaisa <= 0)) {
    throw new Error('Bill total and line amounts must be greater than zero');
  }

  const expCode = (input.expenseAccountCode || '5299').trim();
  const expAccount = await resolveActiveExpenseAccount(expCode);

  const seq = await getNextSequence('vendor_bill_no');
  const billNo = `BILL-${String(seq).padStart(5, '0')}`;
  const branch = input.branch || 'Main';

  return runInTransaction(async (session) => {
    await resolveOpenPeriodForDate(billDate, session);
    const payableAccountId = await getSystemAccountId('VENDOR_PAYABLE');

    const [bill] = await VendorBill.create(
      [
        {
          billNo,
          vendorName,
          billDate,
          dueDate,
          items,
          description: (input.description || items[0].description).trim(),
          totalPaisa,
          paidPaisa: 0,
          duePaisa: totalPaisa,
          status: 'Open',
          kind: 'Expense',
          expenseAccountCode: expAccount.code,
          attachmentUrl: (input.attachmentUrl || '').trim(),
          branch,
          createdBy: user.name || user.username || 'system',
        },
      ],
      { session }
    );

    const billIdStr = String(bill._id);
    const posted = await postTransactionEntry({
      journalType: 'JV',
      entryDate: billDate,
      description: `Vendor Bill (${billNo}) — ${vendorName}: ${bill.description}`,
      reference: billNo,
      sourceModule: 'VENDOR_BILL',
      sourceId: billIdStr,
      idempotencyKey: `BILL:${billIdStr}`,
      lines: [
        {
          accountId: String(expAccount._id),
          description: `${billNo} (${expAccount.name})`,
          debitPaisa: totalPaisa,
          creditPaisa: 0,
          branch,
        },
        {
          accountId: payableAccountId,
          description: `Payable to ${vendorName} (${billNo})`,
          debitPaisa: 0,
          creditPaisa: totalPaisa,
          branch,
        },
      ],
      session,
      user,
    });

    bill.accrualEntryId = posted.entry._id as mongoose.Types.ObjectId;
    await bill.save({ session });
    return { bill: bill.toObject(), entry: posted.entry };
  });
}

export async function recordVendorBillPayment(
  billId: string,
  input: {
    paymentDate: string | Date;
    amountPaisa: number;
    method?: string;
    reference?: string;
    bankName?: string;
    chequeNo?: string;
    chequeDate?: string | Date | null;
    attachmentUrl?: string;
  },
  user: ActorUser
) {
  await ensureAccountsSeeded();
  if (!mongoose.Types.ObjectId.isValid(billId)) throw new Error('Invalid vendor bill ID');

  const amountPaisa = assertIntPaisa(input.amountPaisa, 'amountPaisa');
  if (amountPaisa <= 0) throw new Error('Payment amount must be greater than zero');

  const paymentDate = new Date(input.paymentDate);
  if (Number.isNaN(paymentDate.getTime())) throw new Error('Invalid payment date');
  const method = (input.method || 'Cash') as 'Cash' | 'Bank' | 'Cheque' | 'bKash' | 'Nagad';

  const seq = await getNextSequence('vendor_bill_payment_no');
  const paymentNo = `BPAY-${String(seq).padStart(5, '0')}`;

  return runInTransaction(async (session) => {
    const bill = await VendorBill.findOne({ _id: billId, isDeleted: false }).session(session);
    if (!bill) throw new Error('Vendor bill not found');
    if (bill.status === 'Reversed') throw new Error('Cannot pay a reversed vendor bill');
    if (bill.duePaisa <= 0) throw new Error('Vendor bill is already fully paid');
    if (amountPaisa > bill.duePaisa) {
      throw new Error(
        `Overpayment rejected: payment (${amountPaisa} paisa) exceeds due (${bill.duePaisa} paisa)`
      );
    }

    await resolveOpenPeriodForDate(paymentDate, session);

    const payableAccountId = await getSystemAccountId('VENDOR_PAYABLE');
    const depositAccountId = await getSystemAccountId(resolveDepositSystemTag(method));

    const paymentId = new mongoose.Types.ObjectId();
    const paymentIdStr = String(paymentId);
    const posted = await postTransactionEntry({
      journalType: 'PV',
      entryDate: paymentDate,
      description: `Vendor Bill Payment (${paymentNo}) for ${bill.billNo} — ${bill.vendorName}`,
      reference: input.reference || paymentNo,
      sourceModule: 'BILL_PAYMENT',
      sourceId: paymentIdStr,
      idempotencyKey: `BILL_PAYMENT:${paymentIdStr}`,
      lines: [
        {
          accountId: payableAccountId,
          description: `Settle ${bill.billNo} (${bill.vendorName})`,
          debitPaisa: amountPaisa,
          creditPaisa: 0,
          branch: bill.branch,
        },
        {
          accountId: depositAccountId,
          description: `Paid via ${method} (${paymentNo})`,
          debitPaisa: 0,
          creditPaisa: amountPaisa,
          branch: bill.branch,
        },
      ],
      session,
      user,
    });

    const [payment] = await VendorBillPayment.create(
      [
        {
          _id: paymentId,
          paymentNo,
          billId: bill._id,
          paymentDate,
          amountPaisa,
          method,
          reference: (input.reference || '').trim(),
          bankName: (input.bankName || '').trim(),
          chequeNo: method === 'Cheque' ? (input.chequeNo || '').trim() : '',
          chequeDate:
            method === 'Cheque' && input.chequeDate ? new Date(input.chequeDate) : null,
          attachmentUrl: (input.attachmentUrl || '').trim(),
          entryId: posted.entry._id,
          status: 'Posted',
          createdBy: user.name || user.username || 'system',
        },
      ],
      { session }
    );

    bill.paidPaisa += amountPaisa;
    bill.duePaisa = Math.max(0, bill.totalPaisa - bill.paidPaisa);
    bill.status = bill.duePaisa === 0 ? 'Paid' : 'PartiallyPaid';
    await bill.save({ session });

    return { payment: payment.toObject(), bill: bill.toObject(), entry: posted.entry };
  });
}

export async function reverseVendorBillPayment(
  paymentId: string,
  reason: string,
  user: ActorUser
) {
  if (!mongoose.Types.ObjectId.isValid(paymentId)) throw new Error('Invalid payment ID');
  if (!reason || reason.trim().length < 3) {
    throw new Error('Reversal reason (min 3 characters) is required');
  }

  return runInTransaction(async (session) => {
    const payment = await VendorBillPayment.findOne({ _id: paymentId, isDeleted: false }).session(
      session
    );
    if (!payment) throw new Error('Vendor bill payment not found');
    if (payment.status !== 'Posted') throw new Error('Payment is already reversed');
    if (!payment.entryId) throw new Error('Payment has no linked journal entry');

    const bill = await VendorBill.findById(payment.billId).session(session);
    if (!bill) throw new Error('Parent vendor bill not found');

    const res = await reverseJournalEntry({
      entryId: String(payment.entryId),
      reason: reason.trim(),
      session,
      user,
    });

    payment.status = 'Reversed';
    payment.reversalEntryId = res.reversal._id as mongoose.Types.ObjectId;
    await payment.save({ session });

    bill.paidPaisa = Math.max(0, bill.paidPaisa - payment.amountPaisa);
    bill.duePaisa = Math.max(0, bill.totalPaisa - bill.paidPaisa);
    bill.status = bill.paidPaisa === 0 ? 'Open' : 'PartiallyPaid';
    await bill.save({ session });

    return { payment: payment.toObject(), bill: bill.toObject(), reversal: res.reversal };
  });
}

export async function listLoans() {
  await ensureAccountsSeeded();
  return Loan.find({ isDeleted: false }).sort({ receivedDate: -1, createdAt: -1 }).lean();
}

export async function createLoan(
  input: {
    lenderName: string;
    loanType: 'Bank' | 'Other';
    principalPaisa: number;
    receivedDate: string | Date;
    interestNote?: string;
    depositMethod?: string;
    attachmentUrl?: string;
  },
  user: ActorUser
) {
  await ensureAccountsSeeded();
  const lenderName = (input.lenderName || '').trim();
  if (!lenderName) throw new Error('Lender name is required');
  const principalPaisa = assertIntPaisa(input.principalPaisa, 'principalPaisa');
  if (principalPaisa <= 0) throw new Error('Loan principal must be greater than zero');
  const receivedDate = new Date(input.receivedDate);
  if (Number.isNaN(receivedDate.getTime())) throw new Error('Invalid received date');

  const depositMethod = (input.depositMethod || 'Bank') as
    | 'Cash'
    | 'Bank'
    | 'Cheque'
    | 'bKash'
    | 'Nagad';
  const loanTag = input.loanType === 'Bank' ? 'LOAN_BANK' : 'LOAN_OTHER';
  const seq = await getNextSequence('loan_no');
  const loanNo = `LOAN-${String(seq).padStart(4, '0')}`;

  return runInTransaction(async (session) => {
    await resolveOpenPeriodForDate(receivedDate, session);

    const depositAccountId = await getSystemAccountId(resolveDepositSystemTag(depositMethod));
    const loanAccountId = await getSystemAccountId(loanTag);

    const loanId = new mongoose.Types.ObjectId();
    const loanIdStr = String(loanId);
    const posted = await postTransactionEntry({
      journalType: 'RV',
      entryDate: receivedDate,
      description: `Loan Received (${loanNo}) from ${lenderName}`,
      reference: loanNo,
      sourceModule: 'LOAN',
      sourceId: loanIdStr,
      idempotencyKey: `LOAN:${loanIdStr}`,
      lines: [
        {
          accountId: depositAccountId,
          description: `Loan proceeds (${loanNo}) via ${depositMethod}`,
          debitPaisa: principalPaisa,
          creditPaisa: 0,
        },
        {
          accountId: loanAccountId,
          description: `${input.loanType} loan liability — ${lenderName}`,
          debitPaisa: 0,
          creditPaisa: principalPaisa,
        },
      ],
      session,
      user,
    });

    const [loan] = await Loan.create(
      [
        {
          _id: loanId,
          loanNo,
          lenderName,
          loanType: input.loanType || 'Bank',
          principalPaisa,
          receivedDate,
          outstandingPaisa: principalPaisa,
          interestNote: (input.interestNote || '').trim(),
          depositMethod,
          attachmentUrl: (input.attachmentUrl || '').trim(),
          receiptEntryId: posted.entry._id,
          status: 'Active',
          createdBy: user.name || user.username || 'system',
        },
      ],
      { session }
    );
    return { loan: loan.toObject(), entry: posted.entry };
  });
}

