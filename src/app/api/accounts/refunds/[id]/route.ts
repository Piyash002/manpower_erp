import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ACCOUNTS_ADMIN_ROLES,
  badRequestResponse,
  forbiddenResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import { processFeeRefundApproval } from '@/lib/accounts/fees';

const approvalSchema = z.object({
  decision: z.enum(['Approve', 'Reject']),
  rejectionReason: z.string().trim().max(300).optional(),
  approvalDate: z.string().trim().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAccountsAuth(req, ACCOUNTS_ADMIN_ROLES);
  if (auth.errorResponse) {
    return forbiddenResponse('Only Admin can approve or reject Fee Refunds and Credit Notes.');
  }

  const { id } = await params;

  try {
    const raw = await req.json();
    const parsed = approvalSchema.safeParse(raw);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message || 'Invalid approval payload');
    }

    const res = await processFeeRefundApproval({
      refundId: id,
      decision: parsed.data.decision,
      rejectionReason: parsed.data.rejectionReason,
      approvalDate: parsed.data.approvalDate,
      user: auth.user,
    });

    return NextResponse.json({
      success: true,
      data: res,
      message:
        parsed.data.decision === 'Approve'
          ? `${res.refund.refundNo} approved and posted (${res.entry?.voucherNo}).`
          : `${res.refund.refundNo} rejected.`,
    });
  } catch (error: any) {
    return badRequestResponse(error.message || 'Failed to process refund decision');
  }
}

