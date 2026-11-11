import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { StudentFeePlan } from '@/models/StudentFeePlan';
import { Student } from '@/models/Student';

/**
 * Read-only financial badge endpoint for Admission / Student Directory by studentId.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  const { studentId } = await params;

  try {
    await connectDB();
    const plan = await StudentFeePlan.findOne({
      studentId,
      isDeleted: { $ne: true },
    }).lean();

    if (plan) {
      const totalRefundedPaisa = plan.totalRefundedPaisa || 0;
      const netCollectedPaisa = Math.max(0, plan.totalPaidPaisa - totalRefundedPaisa);
      return NextResponse.json({
        success: true,
        data: {
          source: 'Accounts',
          planId: plan._id.toString(),
          planNo: plan.planNo,
          totalBilledPaisa: plan.totalBilledPaisa,
          discountPaisa: plan.discountPaisa || 0,
          pendingDiscountPaisa: plan.pendingDiscountPaisa || 0,
          discountStatus: plan.discountStatus || 'None',
          creditNotePaisa: plan.creditNotePaisa || 0,
          netPayablePaisa: plan.netPayablePaisa,
          totalPaidPaisa: plan.totalPaidPaisa,
          totalRefundedPaisa,
          netCollectedPaisa,
          totalDuePaisa: plan.totalDuePaisa,
          stages: plan.stages || [],
          status: plan.status,
          badge:
            plan.status === 'Refunded'
              ? 'Refunded'
              : plan.totalDuePaisa <= 0
              ? 'Paid'
              : plan.totalPaidPaisa > 0
              ? 'Partial'
              : 'Due',
        },
      });
    }

    const st = await Student.findById(studentId).select('fee_snapshot total_paid total_due').lean();
    if (!st) {
      return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
    }

    const payablePaisa = Math.round((st.fee_snapshot?.total_payable || 0) * 100);
    const paidPaisa = Math.round((st.total_paid || 0) * 100);
    const duePaisa = Math.round((st.total_due || 0) * 100);

    return NextResponse.json({
      success: true,
      data: {
        source: 'LegacyCache',
        netPayablePaisa: payablePaisa,
        totalPaidPaisa: paidPaisa,
        totalDuePaisa: duePaisa,
        badge: duePaisa <= 0 ? 'Paid' : paidPaisa > 0 ? 'Partial' : 'Due',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to read student fee status' },
      { status: 500 }
    );
  }
}

