import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { MoneyReceipt } from '@/models/MoneyReceipt';
import { Student } from '@/models/Student';
import { JournalEntry } from '@/models/JournalEntry';
import { Account } from '@/models/Account';
import { AccountsSettings } from '@/models/AccountsSettings';
import {
  ACCOUNTS_READ_ROLES,
  badRequestResponse,
  forbiddenResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import { ensureAccountsSeeded } from '@/lib/accounts-seed';
import { collectStudentReceipt } from '@/lib/accounts/fees';
import { invalidateDashboardCache } from '@/lib/redis';

const createReceiptSchema = z.object({
  studentId: z.string().trim().min(1, 'studentId is required'),
  amountPaisa: z.number().int().positive('Receipt amount must be positive integer paisa'),
  method: z.enum(['Cash', 'bKash', 'Nagad', 'Rocket', 'Bank transfer', 'Cheque', 'Card']),
  depositAccountId: z.string().trim().optional(),
  reference: z.string().trim().max(120).optional(),
  bankName: z.string().trim().max(120).optional(),
  chequeNo: z.string().trim().max(80).optional(),
  chequeDate: z.string().trim().optional(),
  proofUrl: z.string().trim().max(500).optional(),
  receiptDate: z.string().trim().optional(),
  note: z.string().trim().max(300).optional(),
  targetStageNo: z.number().int().positive().nullable().optional(),
  branch: z.string().trim().default('Main'),
  department: z.string().trim().default('Counseling'),
});

export async function GET(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensureAccountsSeeded();
    void Student;
    void JournalEntry;
    void Account;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim().toLowerCase() || '';

    let receipts = await MoneyReceipt.find({ isDeleted: { $ne: true } })
      .populate(
        'studentId',
        'student_no name phone mobile trade trade_name country_of_interest destination_country'
      )
      .populate('depositAccountId', 'code name')
      .populate('journalEntryId', 'voucherNo status entryDate')
      .sort({ receiptDate: -1, createdAt: -1 })
      .limit(200)
      .lean();

    if (search) {
      receipts = receipts.filter((r: any) => {
        const stName = String(r.studentId?.name || '').toLowerCase();
        const stNo = String(r.studentId?.student_no || '').toLowerCase();
        const rNo = String(r.receiptNo || '').toLowerCase();
        return stName.includes(search) || stNo.includes(search) || rNo.includes(search);
      });
    }

    return NextResponse.json({ success: true, data: receipts });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch money receipts' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAccountsAuth(req, ['Admin', 'Accountant', 'Counselor']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensureAccountsSeeded();

    if (auth.user.role === 'Counselor') {
      const settings = await AccountsSettings.findOne({}).lean();
      if (!settings?.allow_counselor_collection) {
        return forbiddenResponse(
          'Forbidden. Counselors cannot collect payments unless explicitly permitted in Accounts Settings.'
        );
      }
    }

    const raw = await req.json();
    const parsed = createReceiptSchema.safeParse(raw);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message || 'Invalid receipt payload');
    }

    const { receipt, entry } = await collectStudentReceipt({
      ...parsed.data,
      user: auth.user,
    });

    await invalidateDashboardCache();

    return NextResponse.json(
      {
        success: true,
        message: `Receipt ${receipt.receiptNo} posted with voucher ${entry.voucherNo}.`,
        data: { receipt, entry },
      },
      { status: 201 }
    );
  } catch (error: any) {
    const isClient =
      error.message?.includes('exceeds') ||
      error.message?.includes('Locked') ||
      error.message?.includes('Invalid') ||
      error.message?.includes('Deposit account') ||
      error.message?.includes('No Student Fee Plan');
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to collect receipt' },
      { status: isClient ? 400 : 500 }
    );
  }
}

