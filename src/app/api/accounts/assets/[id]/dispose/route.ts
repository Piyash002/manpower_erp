import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import {
  ACCOUNTS_ADMIN_ROLES,
  badRequestResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import { disposeFixedAsset } from '@/lib/accounts/assets';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAccountsAuth(req, ACCOUNTS_ADMIN_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { id } = await context.params;
    const body = await req.json();
    const data = await disposeFixedAsset(id, body, auth.user);
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return badRequestResponse(err?.message || 'Failed to dispose fixed asset');
  }
}

