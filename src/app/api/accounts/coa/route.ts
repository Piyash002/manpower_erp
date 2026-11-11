import { NextRequest, NextResponse } from 'next/server';
import { createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Account, getNormalBalanceForType } from '@/models/Account';
import { JournalLine } from '@/models/JournalLine';
import { ensureAccountsSeeded } from '@/lib/accounts-seed';
import {
  ACCOUNTS_READ_ROLES,
  ACCOUNTS_WRITE_ROLES,
  badRequestResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import { createAccountSchema } from '@/lib/accounts-validators';

export async function GET(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensureAccountsSeeded();

    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const leafOnly = searchParams.get('leafOnly') === 'true';

    const filter: Record<string, any> = { isDeleted: { $ne: true } };
    if (!includeInactive) filter.active = true;
    if (leafOnly) filter.isGroup = false;

    const [accounts, balancesAgg] = await Promise.all([
      Account.find(filter).sort({ code: 1 }).lean(),
      JournalLine.aggregate([
        { $match: { status: { $in: ['Posted', 'Reversed'] }, isDeleted: { $ne: true } } },
        {
          $group: {
            _id: '$accountId',
            debitPaisa: { $sum: '$debitPaisa' },
            creditPaisa: { $sum: '$creditPaisa' },
          },
        },
      ]),
    ]);

    const balMap = new Map<string, { debitPaisa: number; creditPaisa: number }>();
    for (const b of balancesAgg) {
      balMap.set(String(b._id), {
        debitPaisa: Math.round(b.debitPaisa || 0),
        creditPaisa: Math.round(b.creditPaisa || 0),
      });
    }

    const enriched = accounts.map((acc: any) => {
      const b = balMap.get(acc._id.toString()) || { debitPaisa: 0, creditPaisa: 0 };
      const balancePaisa =
        acc.normalBalance === 'Debit'
          ? b.debitPaisa - b.creditPaisa
          : b.creditPaisa - b.debitPaisa;
      return {
        ...acc,
        debitPaisa: b.debitPaisa,
        creditPaisa: b.creditPaisa,
        balancePaisa,
      };
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch Chart of Accounts' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const raw = await req.json();
    const parsed = createAccountSchema.safeParse(raw);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message || 'Invalid account payload');
    }

    await connectDB();
    await ensureAccountsSeeded();

    const data = parsed.data;
    const cleanCode = data.code.toUpperCase();
    const existing = await Account.findOne({ code: cleanCode, isDeleted: { $ne: true } }).lean();
    if (existing) {
      return NextResponse.json(
        { success: false, message: `Account code ${cleanCode} already exists.` },
        { status: 409 }
      );
    }

    if (data.parentId) {
      const parent = await Account.findOne({ _id: data.parentId, isDeleted: { $ne: true } }).lean();
      if (!parent) {
        return badRequestResponse('Selected parent account does not exist.');
      }
      if (!parent.isGroup) {
        return badRequestResponse('Parent account must be a Group account.');
      }
      if (parent.type !== data.type) {
        return badRequestResponse(`Child account type must match parent group (${parent.type}).`);
      }
    }

    const created = await Account.create({
      code: cleanCode,
      name: data.name,
      type: data.type,
      normalBalance: getNormalBalanceForType(data.type),
      parentId: data.parentId || null,
      isGroup: data.isGroup,
      description: data.description || '',
      active: data.active,
      createdBy: auth.user.name,
    });

    await createAuditLog({
      user: auth.user,
      action: 'COA_ACCOUNT_CREATED',
      entity: 'Account',
      entityId: created._id.toString(),
      newValues: {
        code: created.code,
        name: created.name,
        type: created.type,
        isGroup: created.isGroup,
      },
    });

    return NextResponse.json(
      { success: true, message: `Account ${created.code} - ${created.name} created.`, data: created },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create account' },
      { status: 500 }
    );
  }
}

