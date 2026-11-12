import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import {
  ACCOUNTS_ADMIN_ROLES,
  ACCOUNTS_WRITE_ROLES,
  badRequestResponse,
  forbiddenResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import {
  recordVendorBillPayment,
  reverseVendorBillPayment,
} from '@/lib/accounts/bills';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { id } = await context.params;
    const body = await req.json();

    if (body?.action === 'reverse') {
      if (!ACCOUNTS_ADMIN_ROLES.includes(auth.user.role)) {
        return forbiddenResponse('Only Admin can reverse vendor bill payments');
      }
      const data = await reverseVendorBillPayment(
        body.paymentId,
        body.reason || '',
        auth.user
      );
      return NextResponse.json({ success: true, data });
    }

    const data = await recordVendorBillPayment(id, body, auth.user);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return badRequestResponse(err?.message || 'Failed to process vendor bill payment');
  }
}

