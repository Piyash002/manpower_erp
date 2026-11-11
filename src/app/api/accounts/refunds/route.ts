import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { FeeRefund } from '@/models/FeeRefund';
import { Student } from '@/models/Student';
import { JournalEntry } from '@/models/JournalEntry';
import {
  ACCOUNTS_READ_ROLES,
  ACCOUNTS_WRITE_ROLES,
  badRequestResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import { ensureAccountsSeeded } from '@/lib/accounts-seed';
import { createFeeRefundRequest } from '@/lib/accounts/fees';

const createRefundSchema = z.object({
  studentId: z.string().trim().min(1, 'studentId is required'),
  kind: z.enum(['Refund', 'CreditNote']),
  amountPaisa: z.number().int().positive('Amount must be positive integer paisa'),
  refundRule: z.enum([
    'VISA_REJECTED',
    'MEDICAL_UNFIT',
    'CANDIDATE_WITHDREW',
    'PACKAGE_DOWNGRADE',
    'OVERPAYMENT',
    'OTHER',
  ]),
  reason: z.string().trim().min(3, 'Reason is required (min 3 characters)').max(300),
  method: z
    .enum(['', 'Cash', 'bKash', 'Nagad', 'Rocket', 'Bank transfer', 'Cheque', 'Card'])
    .optional(),
  payoutAccountId: z.string().trim().nullable().optional(),
  reference: z.string().trim().max(120).optional(),
  refundDate: z.string().trim().optional(),
});

export async function GET(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensureAccountsSeeded();
    void Student;
    void JournalEntry;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'all';
    const filter: Record<string, any> = { isDeleted: { $ne: true } };
    if (status !== 'all') filter.status = status;

    const list = await FeeRefund.find(filter)
      .populate('studentId', 'student_no name phone trade country_of_interest')
      .populate('journalEntryId', 'voucherNo status entryDate')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load refunds' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const raw = await req.json();
    const parsed = createRefundSchema.safeParse(raw);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message || 'Invalid refund payload');
    }

    const d = parsed.data;
    const refund = await createFeeRefundRequest({
      studentId: d.studentId,
      kind: d.kind,
      amountPaisa: d.amountPaisa,
      refundRule: d.refundRule,
      reason: d.reason,
      method: d.method,
      payoutAccountId: d.payoutAccountId,
      reference: d.reference,
      refundDate: d.refundDate,
      user: auth.user,
    });

    return NextResponse.json(
      {
        success: true,
        data: refund,
        message: `${refund.kind === 'CreditNote' ? 'Credit Note' : 'Refund'} ${refund.refundNo} submitted for Admin approval.`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return badRequestResponse(error.message || 'Failed to create refund request');
  }
}

