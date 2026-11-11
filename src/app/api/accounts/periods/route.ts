import { NextRequest, NextResponse } from 'next/server';
import { createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { AccountingPeriod } from '@/models/AccountingPeriod';
import { FiscalYear } from '@/models/FiscalYear';
import { ensureAccountsSeeded } from '@/lib/accounts-seed';
import {
  ACCOUNTS_ADMIN_ROLES,
  ACCOUNTS_READ_ROLES,
  badRequestResponse,
  forbiddenResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import { periodLockSchema } from '@/lib/accounts-validators';

export async function GET(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensureAccountsSeeded();

    const { searchParams } = new URL(req.url);
    const fiscalYearId = searchParams.get('fiscalYearId');

    const filter: Record<string, any> = {};
    if (fiscalYearId && fiscalYearId !== 'all') filter.fiscalYearId = fiscalYearId;

    const [periods, fiscalYears] = await Promise.all([
      AccountingPeriod.find(filter)
        .populate('fiscalYearId', 'code name status')
        .sort({ year: -1, month: 1 })
        .lean(),
      FiscalYear.find({ isDeleted: { $ne: true } }).sort({ startDate: -1 }).lean(),
    ]);

    return NextResponse.json({
      success: true,
      data: { periods, fiscalYears },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch accounting periods' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAccountsAuth(req, ['Admin', 'Accountant']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const raw = await req.json();
    const parsed = periodLockSchema.safeParse(raw);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message || 'Invalid period lock request');
    }

    const { periodId, action, reason } = parsed.data;

    // RBAC Rule: Accountant may NOT unlock periods; Admin owns lock/unlock governance
    if (action === 'unlock' && !ACCOUNTS_ADMIN_ROLES.includes(auth.user.role)) {
      return forbiddenResponse('Only Admin can unlock a locked accounting period.');
    }
    if (action === 'lock' && !ACCOUNTS_ADMIN_ROLES.includes(auth.user.role)) {
      return forbiddenResponse('Only Admin can lock an accounting period.');
    }

    await connectDB();
    const period = await AccountingPeriod.findById(periodId);
    if (!period) {
      return NextResponse.json({ success: false, message: 'Accounting period not found' }, { status: 404 });
    }

    const oldValues = { status: period.status, lockReason: period.lockReason };
    const now = new Date();

    if (action === 'lock') {
      if (period.status === 'Locked') {
        return badRequestResponse(`${period.name} is already Locked.`);
      }
      period.status = 'Locked';
      period.lockedBy = auth.user.name;
      period.lockedAt = now;
      period.lockReason = reason;
    } else {
      if (period.status === 'Open') {
        return badRequestResponse(`${period.name} is already Open.`);
      }
      period.status = 'Open';
      period.unlockedBy = auth.user.name;
      period.unlockedAt = now;
      period.lockReason = `Unlocked: ${reason}`;
    }

    await period.save();

    await createAuditLog({
      user: auth.user,
      action: action === 'lock' ? 'ACCOUNTING_PERIOD_LOCKED' : 'ACCOUNTING_PERIOD_UNLOCKED',
      entity: 'AccountingPeriod',
      entityId: period._id.toString(),
      oldValues,
      newValues: { status: period.status, reason },
    });

    return NextResponse.json({
      success: true,
      message: `${period.name} is now ${period.status}.`,
      data: period,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update period status' },
      { status: 500 }
    );
  }
}

