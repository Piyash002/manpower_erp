import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { StudentFeePlan } from '@/models/StudentFeePlan';
import {
  ACCOUNTS_ADMIN_ROLES,
  ACCOUNTS_READ_ROLES,
  ACCOUNTS_WRITE_ROLES,
  badRequestResponse,
  forbiddenResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import {
  getStudentFeeStatement,
  processStudentDiscountApproval,
  requestStudentDiscount,
} from '@/lib/accounts/fees';

const discountActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('request_discount'),
    discountPaisa: z.number().int().positive('Discount must be a positive integer paisa amount'),
    reason: z.string().trim().min(3, 'Reason is required (min 3 characters)').max(300),
  }),
  z.object({
    action: z.literal('approve_discount'),
    adjustmentDate: z.string().trim().optional(),
  }),
  z.object({
    action: z.literal('reject_discount'),
    rejectionReason: z.string().trim().max(300).optional(),
  }),
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await connectDB();
    const plan = await StudentFeePlan.findOne({ _id: id, isDeleted: { $ne: true } }).lean();
    if (!plan) {
      return NextResponse.json({ success: false, message: 'Student Fee Plan not found' }, { status: 404 });
    }

    const statement = await getStudentFeeStatement(plan.studentId.toString());
    return NextResponse.json({ success: true, data: statement });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load student fee plan' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    const raw = await req.json();
    const parsed = discountActionSchema.safeParse(raw);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message || 'Invalid discount action payload');
    }

    const d = parsed.data;
    if (d.action === 'request_discount') {
      const plan = await requestStudentDiscount({
        planId: id,
        discountPaisa: d.discountPaisa,
        reason: d.reason,
        user: auth.user,
      });
      return NextResponse.json({
        success: true,
        data: plan,
        message: 'Discount request submitted for Admin approval.',
      });
    }

    if (!ACCOUNTS_ADMIN_ROLES.includes(auth.user.role)) {
      return forbiddenResponse('Only Admin can approve or reject student fee discounts.');
    }

    const res = await processStudentDiscountApproval({
      planId: id,
      decision: d.action === 'approve_discount' ? 'Approve' : 'Reject',
      rejectionReason: d.action === 'reject_discount' ? d.rejectionReason : undefined,
      adjustmentDate: d.action === 'approve_discount' ? d.adjustmentDate : undefined,
      user: auth.user,
    });

    return NextResponse.json({
      success: true,
      data: res,
      message:
        d.action === 'approve_discount'
          ? `Discount approved and posted (${res.entry?.voucherNo}).`
          : 'Discount request rejected.',
    });
  } catch (error: any) {
    return badRequestResponse(error.message || 'Failed to process discount action');
  }
}

