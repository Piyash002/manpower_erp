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
import { createJournalEntrySchema } from '@/lib/accounts-validators';
import { createJournalEntry } from '@/lib/accounts-engine';
import { invalidateDashboardCache } from '@/lib/redis';

export async function GET(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensureAccountsSeeded();
    void Account;

    const { searchParams } = new URL(req.url);
    const journalType = searchParams.get('journalType') || 'all';
    const status = searchParams.get('status') || 'all';
    const search = searchParams.get('search')?.trim().toLowerCase() || '';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30', 10)));

    const filter: Record<string, any> = {
      isDeleted: { $ne: true },
      voucherNo: { $exists: true, $ne: '' },
    };
    if (journalType !== 'all') filter.journalType = journalType;
    if (status !== 'all') filter.status = status;
    if (startDate || endDate) {
      filter.entryDate = {};
      if (startDate) {
        const s = new Date(startDate);
        s.setUTCHours(0, 0, 0, 0);
        filter.entryDate.$gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setUTCHours(23, 59, 59, 999);
        filter.entryDate.$lte = e;
      }
    }
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ voucherNo: rx }, { description: rx }, { reference: rx }];
    }

    const [entries, total] = await Promise.all([
      JournalEntry.find(filter)
        .sort({ entryDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      JournalEntry.countDocuments(filter),
    ]);

    const entryIds = entries.map((e: any) => e._id);
    const lines = await JournalLine.find({
      entryId: { $in: entryIds },
      isDeleted: { $ne: true },
    })
      .populate('accountId', 'code name type')
      .sort({ lineNo: 1 })
      .lean();

    const lineMap = new Map<string, any[]>();
    for (const l of lines) {
      const k = l.entryId.toString();
      if (!lineMap.has(k)) lineMap.set(k, []);
      lineMap.get(k)!.push(l);
    }

    const enriched = entries.map((e: any) => ({
      ...e,
      lines: lineMap.get(e._id.toString()) || [],
    }));

    return NextResponse.json({
      success: true,
      data: {
        entries: enriched,
        pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load journal entries' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const raw = await req.json();
    const parsed = createJournalEntrySchema.safeParse(raw);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message || 'Invalid journal entry payload');
    }

    const result = await createJournalEntry({
      ...parsed.data,
      user: auth.user,
    });

    await invalidateDashboardCache();

    return NextResponse.json(
      {
        success: true,
        message: result.duplicate
          ? `Idempotent hit: returned existing voucher ${result.entry.voucherNo}.`
          : `${result.entry.voucherNo} (${result.entry.status}) saved.`,
        data: { entry: result.entry, lines: result.lines, duplicate: result.duplicate },
      },
      { status: result.duplicate ? 200 : 201 }
    );
  } catch (error: any) {
    const isClientErr =
      error.message?.includes('balance') ||
      error.message?.includes('Locked') ||
      error.message?.includes('Closed') ||
      error.message?.includes('Group') ||
      error.message?.includes('paisa') ||
      error.message?.includes('inactive');
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to save journal entry' },
      { status: isClientErr ? 400 : 500 }
    );
  }
}
