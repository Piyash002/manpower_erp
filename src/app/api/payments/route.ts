import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { AccountsSettings } from '@/models/AccountsSettings';
import { collectStudentReceipt } from '@/lib/accounts/fees';
import { takaToPaisa, paisaToTaka } from '@/lib/accounts-money';

// POST /api/payments - Front-desk thin bridge delegating strictly to Accounts Money Receipt posting
export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();

    if (auth.user.role === 'Counselor') {
      const settings = await AccountsSettings.findOne({}).lean();
      if (!settings?.allow_counselor_collection) {
        return NextResponse.json(
          {
            success: false,
            message: 'Forbidden. Counselors are not permitted to collect payments (enable in Accounts Settings).',
          },
          { status: 403 }
        );
      }
    }

    const { student_id, amount, method, reference, payment_date, note } = await req.json();
    const amountPaisa = takaToPaisa(amount);

    if (!student_id || amountPaisa <= 0 || !method) {
      return NextResponse.json(
        { success: false, message: 'Valid student_id, amount (> 0), and payment method are required.' },
        { status: 400 }
      );
    }

    const { receipt, entry } = await collectStudentReceipt({
      studentId: String(student_id),
      amountPaisa,
      method,
      reference,
      receiptDate: payment_date || new Date(),
      note,
      user: auth.user,
    });

    return NextResponse.json({
      success: true,
      message: `Receipt ${receipt.receiptNo} (${entry.voucherNo}) posted cleanly in Accounts.`,
      receipt: {
        receipt_no: receipt.receiptNo,
        amount: paisaToTaka(receipt.amountPaisa),
        method: receipt.method,
        journal_voucher_no: entry.voucherNo,
      },
    });
  } catch (error: any) {
    const isClient =
      error.message?.includes('exceeds') ||
      error.message?.includes('No Student Fee Plan') ||
      error.message?.includes('Locked');
    return NextResponse.json(
      { success: false, message: error.message || 'Payment collection failed' },
      { status: isClient ? 400 : 500 }
    );
  }
}
