import { NextRequest, NextResponse } from 'next/server';
import { createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { JournalLine } from '@/models/JournalLine';
import {
  ACCOUNTS_ADMIN_ROLES,
  ACCOUNTS_WRITE_ROLES,
  badRequestResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import { updateAccountSchema } from '@/lib/accounts-validators';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    const raw = await req.json();
    const parsed = updateAccountSchema.safeParse(raw);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message || 'Invalid update payload');
    }

    await connectDB();
    const account = await Account.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!account) {
      return NextResponse.json({ success: false, message: 'Account not found' }, { status: 404 });
    }

    const oldValues = {
      name: account.name,
      parentId: account.parentId,
      description: account.description,
      active: account.active,
    };

    if (parsed.data.parentId !== undefined) {
      if (parsed.data.parentId === id) {
        return badRequestResponse('An account cannot be its own parent.');
      }
      if (parsed.data.parentId) {
        const parent = await Account.findOne({
          _id: parsed.data.parentId,
          isDeleted: { $ne: true },
        }).lean();
        if (!parent || !parent.isGroup || parent.type !== account.type) {
          return badRequestResponse('Parent must be an active Group account of the same type.');
        }
      }
      account.parentId = (parsed.data.parentId || null) as any;
    }

    if (parsed.data.name !== undefined) account.name = parsed.data.name;
    if (parsed.data.description !== undefined) account.description = parsed.data.description;
    if (parsed.data.active !== undefined) account.active = parsed.data.active;

    await account.save();

    await createAuditLog({
      user: auth.user,
      action: 'COA_ACCOUNT_UPDATED',
      entity: 'Account',
      entityId: account._id.toString(),
      oldValues,
      newValues: {
        name: account.name,
        parentId: account.parentId,
        description: account.description,
        active: account.active,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Account ${account.code} updated.`,
      data: account,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update account' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAccountsAuth(req, ACCOUNTS_ADMIN_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await connectDB();
    const account = await Account.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!account) {
      return NextResponse.json({ success: false, message: 'Account not found' }, { status: 404 });
    }
    if (account.systemTag) {
      return badRequestResponse('System-tagged COA accounts cannot be deleted; you may deactivate if unused.');
    }

    const childCount = await Account.countDocuments({ parentId: account._id, isDeleted: { $ne: true } });
    if (childCount > 0) {
      return badRequestResponse('Archive child accounts before archiving this group.');
    }

    const usedCount = await JournalLine.countDocuments({
      accountId: account._id,
      isDeleted: { $ne: true },
    });
    if (usedCount > 0) {
      return badRequestResponse(
        `Account ${account.code} has ${usedCount} journal line(s) and cannot be archived. Deactivate instead.`
      );
    }

    account.isDeleted = true;
    account.active = false;
    account.deletedAt = new Date();
    account.deletedBy = auth.user.name;
    await account.save();

    await createAuditLog({
      user: auth.user,
      action: 'COA_ACCOUNT_SOFT_DELETED',
      entity: 'Account',
      entityId: account._id.toString(),
      oldValues: { code: account.code, name: account.name },
      newValues: { isDeleted: true },
    });

    return NextResponse.json({
      success: true,
      message: `Account ${account.code} archived (soft-deleted).`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to archive account' },
      { status: 500 }
    );
  }
}

