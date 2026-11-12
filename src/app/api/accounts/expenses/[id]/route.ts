import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { ExpenseRecord } from '@/models/ExpenseRecord';
import {
  ACCOUNTS_ADMIN_ROLES,
  ACCOUNTS_READ_ROLES,
  badRequestResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import { reverseExpenseRecord } from '@/lib/accounts/expenses';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return badRequestResponse('Invalid expense ID');
    }
    const exp = await ExpenseRecord.findOne({ _id: id, isDeleted: false }).lean();
    if (!exp) return badRequestResponse('Expense record not found');
    return NextResponse.json({ success: true, data: exp });
  } catch (err: any) {
    return badRequestResponse(err?.message || 'Failed to load expense record');
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
    const data = await reverseExpenseRecord(id, body?.reason || '', auth.user);
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return badRequestResponse(err?.message || 'Failed to reverse expense record');
  }
}

