import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Payment } from '@/models/Payment';
import { MoneyReceipt } from '@/models/MoneyReceipt';
import { StudentFeePlan } from '@/models/StudentFeePlan';
import { Student } from '@/models/Student';
import { Installment } from '@/models/Installment';
import { amountInWords } from '@/lib/formatters';
import { paisaToTaka } from '@/lib/accounts-money';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ receiptNo: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { receiptNo } = await params;
    await connectDB();

    // Authoritative Accounts MoneyReceipt lookup first
    const accReceipt = await MoneyReceipt.findOne({
      receiptNo: receiptNo.toUpperCase(),
      isDeleted: { $ne: true },
    }).lean();

    if (accReceipt) {
      const student = await Student.findById(accReceipt.studentId).populate('trade_id', 'name').lean();
      if (!student) {
        return NextResponse.json(
          { success: false, message: 'Student associated with receipt not found' },
          { status: 404 }
        );
      }
      const plan = await StudentFeePlan.findById(accReceipt.feePlanId).lean();
      const nextStage = plan?.stages?.find((s) => s.amountPaisa - s.paidPaisa > 0);
      const amountTaka = paisaToTaka(accReceipt.amountPaisa);

      return NextResponse.json({
        success: true,
        receipt: {
          _id: accReceipt._id,
          receipt_no: accReceipt.receiptNo,
          payment_date: accReceipt.receiptDate,
          amount: amountTaka,
          amount_in_words: amountInWords(amountTaka),
          method: accReceipt.method,
          reference: accReceipt.reference || '',
          note:
            accReceipt.status === 'Reversed'
              ? `[REVERSED: ${accReceipt.reversalReason}] ${accReceipt.note || ''}`
              : accReceipt.note || '',
          status: accReceipt.status,
          created_by: accReceipt.createdBy,
          next_due_date: nextStage ? nextStage.dueDate : null,
          student: {
            _id: student._id,
            student_no: student.student_no,
            name: student.name,
            father_name: student.father_name,
            mobile: student.mobile || '',
            passport_no: student.passport_no,
            trade_name: student.trade_name || '',
            batch: student.batch,
            destination_country: student.destination_country || '',
            fee_snapshot: {
              total_payable: plan ? paisaToTaka(plan.netPayablePaisa) : student.fee_snapshot?.total_payable || 0,
            },
            total_paid: plan ? paisaToTaka(plan.totalPaidPaisa) : student.total_paid,
            total_due: plan ? paisaToTaka(plan.totalDuePaisa) : student.total_due,
          },
        },
      });
    }

    const payment = await Payment.findOne({ receipt_no: receiptNo });
    if (!payment) {
      return NextResponse.json({ success: false, message: 'Receipt not found' }, { status: 404 });
    }

    const student = await Student.findById(payment.student_id).populate('trade_id', 'name');
    if (!student) {
      return NextResponse.json({ success: false, message: 'Student associated with receipt not found' }, { status: 404 });
    }

    // Look up upcoming installment if dues remain
    const nextInst = await Installment.findOne({
      student_id: student._id,
      status: { $in: ['Pending', 'Partial'] },
    }).sort({ installment_no: 1 });

    const inWords = amountInWords(payment.amount);

    return NextResponse.json({
      success: true,
      receipt: {
        receipt_no: payment.receipt_no,
        payment_date: payment.payment_date,
        amount: payment.amount,
        amount_in_words: inWords,
        method: payment.method,
        reference: payment.reference,
        note: payment.note,
        created_by: payment.created_by,
        next_due_date: nextInst ? nextInst.due_date : null,
        student: {
          _id: student._id,
          student_no: student.student_no,
          name: student.name,
          father_name: student.father_name,
          mobile: student.mobile,
          passport_no: student.passport_no,
          trade_name: student.trade_name,
          batch: student.batch,
          destination_country: student.destination_country,
          fee_snapshot: student.fee_snapshot,
          total_paid: student.total_paid,
          total_due: student.total_due,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch receipt' },
      { status: 500 }
    );
  }
}

