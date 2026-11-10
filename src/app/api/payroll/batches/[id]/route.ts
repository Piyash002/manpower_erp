import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { PayslipBatch } from '@/models/PayslipBatch';
import { Payslip } from '@/models/Payslip';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await connectDB();
    const [batch, payslips] = await Promise.all([
      PayslipBatch.findById(id).lean(),
      Payslip.find({ batch_id: id })
        .populate('employee_id', 'employee_id firstName lastName department designation')
        .sort({ payslip_no: 1 })
        .lean(),
    ]);

    if (!batch) {
      return NextResponse.json({ success: false, message: 'Batch not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: { batch, payslips },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load batch details' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    const body = await req.json();
    const action = body.action as 'confirm' | 'pay' | 'cancel';

    if (!['confirm', 'pay', 'cancel'].includes(action)) {
      return NextResponse.json(
        { success: false, message: 'Invalid batch action. Use confirm, pay, or cancel.' },
        { status: 400 }
      );
    }

    await connectDB();
    const batch = await PayslipBatch.findById(id);
    if (!batch) {
      return NextResponse.json({ success: false, message: 'Batch not found' }, { status: 404 });
    }

    const oldStatus = batch.status;
    let updatedPayslips = 0;

    if (action === 'confirm') {
      if (batch.status !== 'Draft') {
        return NextResponse.json(
          { success: false, message: `Only Draft batches can be confirmed (current: ${batch.status}).` },
          { status: 400 }
        );
      }
      const res = await Payslip.updateMany(
        { batch_id: id, status: 'Draft' },
        { $set: { status: 'Confirmed', confirmed_at: new Date() } }
      );
      updatedPayslips = res.modifiedCount;
      batch.status = 'Confirmed';
      batch.confirmed_at = new Date();
    } else if (action === 'pay') {
      if (batch.status !== 'Confirmed') {
        return NextResponse.json(
          { success: false, message: `Batch must be Confirmed before marking Paid.` },
          { status: 400 }
        );
      }
      const res = await Payslip.updateMany(
        { batch_id: id, status: 'Confirmed' },
        { $set: { status: 'Paid', paid_at: new Date() } }
      );
      updatedPayslips = res.modifiedCount;
      batch.status = 'Paid';
      batch.paid_at = new Date();
    } else if (action === 'cancel') {
      if (batch.status === 'Paid') {
        return NextResponse.json(
          { success: false, message: 'Cannot cancel an already Paid batch.' },
          { status: 400 }
        );
      }
      const res = await Payslip.updateMany(
        { batch_id: id, status: { $in: ['Draft', 'Confirmed'] } },
        { $set: { status: 'Cancelled' } }
      );
      updatedPayslips = res.modifiedCount;
      batch.status = 'Cancelled';
    }

    await batch.save();

    await createAuditLog({
      user: auth.user,
      action: `PAYSLIP_BATCH_${action.toUpperCase()}`,
      entity: 'PayslipBatch',
      entityId: batch._id.toString(),
      oldValues: { status: oldStatus },
      newValues: { status: batch.status, updatedPayslips },
    });

    return NextResponse.json({
      success: true,
      message: `Batch ${batch.batch_code} marked as ${batch.status} (${updatedPayslips} payslips updated).`,
      data: batch,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update payslip batch' },
      { status: 500 }
    );
  }
}

