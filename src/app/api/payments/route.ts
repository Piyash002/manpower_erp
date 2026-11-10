import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Payment } from '@/models/Payment';
import { Student } from '@/models/Student';
import { Installment } from '@/models/Installment';
import { generateReceiptNo } from '@/models/Counter';

// POST /api/payments - Record a payment
export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { student_id, amount, method, reference, payment_date, note } = await req.json();

    const paymentAmount = Math.round(Number(amount));
    if (!student_id || !paymentAmount || paymentAmount <= 0 || !method) {
      return NextResponse.json(
        { success: false, message: 'Valid student_id, amount (> 0), and payment method are required' },
        { status: 400 }
      );
    }

    await connectDB();
    const student = await Student.findById(student_id);
    if (!student) {
      return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
    }

    // PRD Section 5.3: "A payment cannot exceed the total payable."
    const maxPayable = student.fee_snapshot.total_payable - student.total_paid;
    if (paymentAmount > maxPayable) {
      return NextResponse.json(
        {
          success: false,
          message: `Payment amount (${paymentAmount}) exceeds the remaining due balance of ${maxPayable}.`,
        },
        { status: 400 }
      );
    }

    const receiptNo = await generateReceiptNo();

    const payment = await Payment.create({
      receipt_no: receiptNo,
      student_id,
      amount: paymentAmount,
      method,
      reference: reference ? reference.trim() : '',
      payment_date: payment_date ? new Date(payment_date) : new Date(),
      note: note ? note.trim() : '',
      created_by: auth.user.name,
    });

    // Update student cached financial totals
    student.total_paid += paymentAmount;
    student.total_due = Math.max(0, student.fee_snapshot.total_payable - student.total_paid);
    await student.save();

    // Allocate payment across installments
    let remainingToAllocate = paymentAmount;
    const installments = await Installment.find({ student_id }).sort({ installment_no: 1 });

    for (const inst of installments) {
      if (remainingToAllocate <= 0) break;

      const dueOnInst = inst.amount - inst.paid_amount;
      if (dueOnInst > 0) {
        const allocate = Math.min(remainingToAllocate, dueOnInst);
        inst.paid_amount += allocate;
        remainingToAllocate -= allocate;

        if (inst.paid_amount >= inst.amount) {
          inst.status = 'Paid';
          inst.paid_on = new Date();
        } else {
          inst.status = 'Partial';
        }
        await inst.save();
      }
    }

    await createAuditLog({
      user: auth.user,
      action: 'PAYMENT_RECORDED',
      entity: 'Payment',
      entityId: payment._id.toString(),
      newValues: {
        receipt_no: receiptNo,
        student_no: student.student_no,
        amount: paymentAmount,
        method,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Payment of ৳${paymentAmount} recorded with Receipt #${receiptNo}`,
      payment,
      receipt_no: receiptNo,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to record payment' },
      { status: 500 }
    );
  }
}

