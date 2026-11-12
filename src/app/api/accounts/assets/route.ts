import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import {
  ACCOUNTS_READ_ROLES,
  ACCOUNTS_WRITE_ROLES,
  badRequestResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import { listFixedAssets, registerFixedAsset } from '@/lib/accounts/assets';

export async function GET(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const data = await listFixedAssets({
      status: searchParams.get('status') || undefined,
      categoryTag: searchParams.get('categoryTag') || undefined,
      search: searchParams.get('search') || undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return badRequestResponse(err?.message || 'Failed to load fixed assets');
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const body = await req.json();
    if (body?.paymentType === 'Credit' && !body?.dueDate) {
      return badRequestResponse('Due Date is required for On Credit asset purchases');
    }
    const hasPayment =
      body?.paymentType === 'Paid' ||
      (body?.paymentType === 'Credit' && Number(body?.advancePaidPaisa || 0) > 0);
    if (hasPayment && body?.paymentMethod === 'Cheque' && !String(body?.chequeNo || '').trim()) {
      return badRequestResponse('Cheque No is required when Payment Method is Cheque');
    }
    const result = await registerFixedAsset(body, auth.user);
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (err: any) {
    return badRequestResponse(err?.message || 'Failed to register fixed asset');
  }
}

