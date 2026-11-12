import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import {
  ACCOUNTS_READ_ROLES,
  ACCOUNTS_WRITE_ROLES,
  badRequestResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import {
  createExpenseCategory,
  listExpenseCategories,
  updateExpenseCategory,
} from '@/lib/accounts/expenses';

export async function GET(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('activeOnly') === 'true';
    const data = await listExpenseCategories(activeOnly);
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return badRequestResponse(err?.message || 'Failed to load expense categories');
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const body = await req.json();
    const data = await createExpenseCategory(body, auth.user);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return badRequestResponse(err?.message || 'Failed to create expense category');
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const body = await req.json();
    const { id, ...patch } = body || {};
    const data = await updateExpenseCategory(id, patch);
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return badRequestResponse(err?.message || 'Failed to update expense category');
  }
}

