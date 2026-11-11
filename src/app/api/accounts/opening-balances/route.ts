import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { JournalEntry } from '@/models/JournalEntry';
import { JournalLine } from '@/models/JournalLine';
import { Account } from '@/models/Account';
import { ensureAccountsSeeded } from '@/lib/accounts-seed';
import {
  ACCOUNTS_READ_ROLES,
  ACCOUNTS_WRITE_ROLES,
  badRequestResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import { openingBalanceSchema } from '@/lib/accounts-validators';
import { postOpeningBalances } from '@/lib/accounts-engine';

export async function GET(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensureAccountsSeeded();
    void Account;

    const entries = await JournalEntry.find({
      sourceModule: 'OPENING_BALANCE',
      isDeleted: { $ne: true },
    })
      .sort({ entryDate: -1, createdAt: -1 })
      .limit(20)
      .lean();

    const ids = entries.map((e: any) => e._id);
    const lines = await JournalLine.find({ entryId: { $in: ids }, isDeleted: { $ne: true } })
      .populate('accountId', 'code name type')
      .sort({ lineNo: 1 })
      .lean();

    const byEntry = new Map<string, any[]>();
    for (const l of lines) {
      const k = l.entryId.toString();
      if (!byEntry.has(k)) byEntry.set(k, []);
      byEntry.get(k)!.push(l);
    }

    return NextResponse.json({
      success: true,
      data: entries.map((e: any) => ({ ...e, lines: byEntry.get(e._id.toString()) || [] })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch opening balances' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const raw = await req.json();
    const parsed = openingBalanceSchema.safeParse(raw);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message || 'Invalid opening balance payload');
    }

    const result = await postOpeningBalances({
      ...parsed.data,
      user: auth.user,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Opening balance voucher ${result.entry.voucherNo} posted cleanly.`,
        data: result.entry,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to post opening balances' },
      { status: 400 }
    );
  }
}

