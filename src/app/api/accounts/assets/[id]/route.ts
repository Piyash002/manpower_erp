import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import {
  ACCOUNTS_ADMIN_ROLES,
  ACCOUNTS_READ_ROLES,
  ACCOUNTS_WRITE_ROLES,
  badRequestResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import {
  getFixedAssetById,
  reverseAssetPurchase,
  updateFixedAssetMeta,
} from '@/lib/accounts/assets';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { id } = await context.params;
    const data = await getFixedAssetById(id);
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return badRequestResponse(err?.message || 'Fixed asset not found');
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { id } = await context.params;
    const body = await req.json();
    const data = await updateFixedAssetMeta(id, body);
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return badRequestResponse(err?.message || 'Failed to update fixed asset');
  }
}

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
    if (body?.action !== 'reverse') {
      return badRequestResponse('Unsupported action');
    }
    const data = await reverseAssetPurchase(id, body?.reason || '', auth.user);
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return badRequestResponse(err?.message || 'Failed to reverse asset purchase');
  }
}

