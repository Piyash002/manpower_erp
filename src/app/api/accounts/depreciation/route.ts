import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import {
  ACCOUNTS_ADMIN_ROLES,
  ACCOUNTS_READ_ROLES,
  badRequestResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import {
  listDepreciationRuns,
  reverseDepreciationRun,
  runMonthlyDepreciation,
} from '@/lib/accounts/depreciation';

export async function GET(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const data = await listDepreciationRuns();
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return badRequestResponse(err?.message || 'Failed to load depreciation runs');
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_ADMIN_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const body = await req.json();
    if (body?.action === 'reverse') {
      const data = await reverseDepreciationRun(body.runId, body.reason || '', auth.user);
      return NextResponse.json({ success: true, data });
    }
    const data = await runMonthlyDepreciation(body.periodId, auth.user);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return badRequestResponse(err?.message || 'Failed to process depreciation');
  }
}

