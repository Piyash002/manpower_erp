import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { JournalEntry } from '@/models/JournalEntry';
import { JournalLine } from '@/models/JournalLine';
import { Account } from '@/models/Account';
import { AuditLog } from '@/models/AuditLog';
import {
  ACCOUNTS_ADMIN_ROLES,
  ACCOUNTS_READ_ROLES,
  ACCOUNTS_WRITE_ROLES,
  badRequestResponse,
  forbiddenResponse,
  requireAccountsAuth,
} from '@/lib/accounts-auth';
import { entryActionSchema } from '@/lib/accounts-validators';
import {
  postDraftJournalEntry,
  resolveOpenPeriodForDate,
  reverseJournalEntry,
  runInTransaction,
  softDeleteDraftEntry,
  validateAndNormalizeLines,
} from '@/lib/accounts-engine';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAccountsAuth(req, ACCOUNTS_READ_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await connectDB();
    void Account;
    const [entry, lines] = await Promise.all([
      JournalEntry.findOne({ _id: id, isDeleted: { $ne: true } }).lean(),
      JournalLine.find({ entryId: id, isDeleted: { $ne: true } })
        .populate('accountId', 'code name type')
        .sort({ lineNo: 1 })
        .lean(),
    ]);

    if (!entry) {
      return NextResponse.json({ success: false, message: 'Journal entry not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { entry, lines } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load journal entry' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    const raw = await req.json();
    const parsed = entryActionSchema.safeParse(raw);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0]?.message || 'Invalid journal entry action');
    }

    const payload = parsed.data;

    if (payload.action === 'reverse') {
      if (!ACCOUNTS_ADMIN_ROLES.includes(auth.user.role)) {
        return forbiddenResponse('Only Admin can reverse posted journal entries.');
      }
      const { original, reversal } = await reverseJournalEntry({
        entryId: id,
        reason: payload.reason,
        reversalDate: payload.reversalDate,
        user: auth.user,
      });
      return NextResponse.json({
        success: true,
        message: `Reversed ${original.voucherNo} via mirror voucher ${reversal.voucherNo}.`,
        data: { original, reversal },
      });
    }

    if (payload.action === 'post') {
      const posted = await postDraftJournalEntry(id, auth.user);
      return NextResponse.json({
        success: true,
        message: `Posted voucher ${posted.voucherNo}.`,
        data: posted,
      });
    }

    // update_draft
    await connectDB();
    const updated = await runInTransaction(async (session) => {
      const entry = await JournalEntry.findOne({ _id: id, isDeleted: { $ne: true } }).session(session);
      if (!entry) throw new Error('Journal entry not found.');
      if (entry.status !== 'Draft') {
        throw new Error('Posted or Reversed journal entries are immutable and cannot be edited.');
      }

      const newDate = new Date(payload.entryDate);
      const { period } = await resolveOpenPeriodForDate(newDate, session);
      const { normalized, totalDebitPaisa, totalCreditPaisa } = await validateAndNormalizeLines(
        payload.lines,
        session
      );

      const oldSnap = {
        entryDate: entry.entryDate,
        description: entry.description,
        totalDebitPaisa: entry.totalDebitPaisa,
      };

      entry.entryDate = newDate;
      entry.fiscalYearId = period.fiscalYearId;
      entry.periodId = period._id;
      entry.description = payload.description;
      entry.reference = payload.reference || '';
      entry.totalDebitPaisa = totalDebitPaisa;
      entry.totalCreditPaisa = totalCreditPaisa;
      await entry.save({ session });

      await JournalLine.deleteMany({ entryId: entry._id }, { session });
      await JournalLine.insertMany(
        normalized.map((l) => ({
          ...l,
          entryId: entry._id,
          entryDate: newDate,
          status: 'Draft',
          reconciled: false,
          isDeleted: false,
        })),
        { session }
      );

      await AuditLog.create(
        [
          {
            userId: auth.user.userId,
            userName: auth.user.name,
            userRole: auth.user.role,
            action: 'JOURNAL_ENTRY_DRAFT_UPDATED',
            entity: 'JournalEntry',
            entityId: entry._id.toString(),
            oldValues: oldSnap,
            newValues: {
              entryDate: newDate,
              description: entry.description,
              totalDebitPaisa,
            },
            timestamp: new Date(),
          },
        ],
        { session }
      );

      return entry;
    });

    return NextResponse.json({
      success: true,
      message: `Draft ${updated.voucherNo} updated.`,
      data: updated,
    });
  } catch (error: any) {
    const isClient =
      error.message?.includes('immutable') ||
      error.message?.includes('Locked') ||
      error.message?.includes('Closed') ||
      error.message?.includes('balance') ||
      error.message?.includes('Draft') ||
      error.message?.includes('Reversed') ||
      error.message?.includes('reversal');
    return NextResponse.json(
      { success: false, message: error.message || 'Action failed' },
      { status: isClient ? 400 : 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAccountsAuth(req, ACCOUNTS_WRITE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await softDeleteDraftEntry(id, auth.user);
    return NextResponse.json({
      success: true,
      message: 'Draft journal entry archived (soft-deleted).',
    });
  } catch (error: any) {
    const isClient = error.message?.includes('immutable') || error.message?.includes('not found');
    return NextResponse.json(
      { success: false, message: error.message || 'Delete failed' },
      { status: isClient ? 400 : 500 }
    );
  }
}

