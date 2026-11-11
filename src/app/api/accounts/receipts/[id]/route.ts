import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { MoneyReceipt } from '@/models/MoneyReceipt';
import { StudentFeePlan } from '@/models/StudentFeePlan';
import { Student } from '@/models/Student';
import { JournalEntry } from '@/models/JournalEntry';
import { Account } from '@/models/Account';
import {
  ACCOUNTS_ADMIN_ROLES,
  ACCOUNTS_READ_ROLES,
  badRequestResponse,
  forbiddenResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import { paisaToTaka } from '@/lib/accounts-money';
import { buildMoneyReceiptPdfBuffer } from '@/lib/export-utils';
import { reverseMoneyReceipt } from '@/lib/accounts/fees';

const reverseReceiptSchema = z.object({
  reason: z.string().trim().min(3, 'Reversal reason is required (min 3 characters)').max(300),
  reversalDate: z.string().trim().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await connectDB();
    void Student;
    void JournalEntry;
    void Account;
    void StudentFeePlan;

    const receipt: any = await MoneyReceipt.findOne({ _id: id, isDeleted: { $ne: true } })
      .populate('studentId', 'student_no name phone trade country_of_interest')
      .populate('feePlanId', 'planNo netPayablePaisa totalPaidPaisa totalDuePaisa')
      .populate('depositAccountId', 'code name')
      .populate('journalEntryId', 'voucherNo status entryDate')
      .lean();

    if (!receipt) {
      return NextResponse.json({ success: false, message: 'Money Receipt not found' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    if (searchParams.get('format') === 'pdf') {
      const pdfBuf = buildMoneyReceiptPdfBuffer({
        receiptNo: receipt.receiptNo,
        voucherNo: receipt.journalEntryId?.voucherNo || '',
        receiptDate: receipt.receiptDate,
        amountTaka: paisaToTaka(receipt.amountPaisa),
        method: receipt.method,
        reference: receipt.reference,
        note: receipt.status === 'Reversed' ? `[REVERSED: ${receipt.reversalReason}] ${receipt.note || ''}` : receipt.note,
        createdBy: receipt.createdBy,
        studentName: receipt.studentId?.name || 'Student',
        studentNo: receipt.studentId?.student_no || '',
        mobile: receipt.studentId?.phone || '',
        tradeName: receipt.studentId?.trade || '',
        country: receipt.studentId?.country_of_interest || '',
        netPayableTaka: paisaToTaka(receipt.feePlanId?.netPayablePaisa || 0),
        totalPaidTaka: paisaToTaka(receipt.feePlanId?.totalPaidPaisa || 0),
        totalDueTaka: paisaToTaka(receipt.feePlanId?.totalDuePaisa || 0),
        allocations: (receipt.allocations || []).map((a: any) => ({
          label: a.label,
          amountTaka: paisaToTaka(a.amountPaisa),
        })),
      });

      return new NextResponse(new Uint8Array(pdfBuf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="Receipt-${receipt.receiptNo}.pdf"`,
        },
      });
    }

    return NextResponse.json({ success: true, data: receipt });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch receipt' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAccountsAuth(req, ACCOUNTS_ADMIN_ROLES);
  if (auth.errorResponse) {
    return forbiddenResponse('Only Admin can reverse a posted Money Receipt.');
  }

  const { id } = await params;

  try {
    const raw = await req.json();
    const parsed = reverseReceiptSchema.safeParse(raw);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message || 'Invalid reversal request');
    }

    const res = await reverseMoneyReceipt({
      receiptId: id,
      reason: parsed.data.reason,
      reversalDate: parsed.data.reversalDate,
      user: auth.user,
    });

    return NextResponse.json({
      success: true,
      data: res,
      message: `Receipt ${res.receipt.receiptNo} reversed (${res.reversal.voucherNo}).`,
    });
  } catch (error: any) {
    return badRequestResponse(error.message || 'Failed to reverse receipt');
  }
}

