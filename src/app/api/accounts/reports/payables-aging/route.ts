import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import {
  ACCOUNTS_READ_ROLES,
  badRequestResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import { getPayablesAgingReport } from '@/lib/accounts/reports';

export async function GET(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const asOfDate = searchParams.get('asOfDate') || undefined;
    const data = await getPayablesAgingReport(asOfDate);
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return badRequestResponse(err?.message || 'Failed to generate payables aging');
  }
}

