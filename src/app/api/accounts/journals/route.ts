import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Journal } from '@/models/Journal';
import { ensureAccountsSeeded } from '@/lib/accounts-seed';
import { ACCOUNTS_READ_ROLES, requireAccountsAuth } from '@/lib/accounts-auth';

export async function GET(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensureAccountsSeeded();
    const journals = await Journal.find({ active: true }).sort({ code: 1 }).lean();
    return NextResponse.json({ success: true, data: journals });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch journals' },
      { status: 500 }
    );
  }
}

