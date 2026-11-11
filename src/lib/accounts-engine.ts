import mongoose from 'mongoose';
import { Account, IAccount } from '@/models/Account';
import { Journal, JournalTypeCode } from '@/models/Journal';
import { FiscalYear } from '@/models/FiscalYear';
import { AccountingPeriod, IAccountingPeriod } from '@/models/AccountingPeriod';
import { VoucherSequence } from '@/models/VoucherSequence';
import { JournalEntry, IJournalEntry } from '@/models/JournalEntry';
import { JournalLine, IJournalLine } from '@/models/JournalLine';
import { connectDB } from '@/lib/db';
import { ensureAccountsSeeded, ensureFiscalYearWithPeriods } from '@/lib/accounts-seed';
import { assertIntPaisa, sumPaisa } from '@/lib/accounts-money';
import { AuditLog } from '@/models/AuditLog';

export interface JournalLineInput {
  accountId: string;
  description?: string;
  debitPaisa: number;
  creditPaisa: number;
  branch?: string;
  department?: string;
  studentId?: string | null;
  employeeId?: string | null;
  agentId?: string | null;
  vendorId?: string | null;
}

export interface CreateEntryParams {
  journalType: JournalTypeCode;
  entryDate: Date | string;
  description: string;
  reference?: string;
  sourceModule?: string;
  sourceId?: string;
  idempotencyKey?: string;
  postImmediately?: boolean;
  lines: JournalLineInput[];
  session?: mongoose.ClientSession;
  user: {
    userId?: string;
    name?: string;
    username?: string;
    role?: string;
  };
}

export async function runInTransaction<T>(
  work: (session: mongoose.ClientSession) => Promise<T>
): Promise<T> {
  const conn = await connectDB();
  const session = await conn.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function writeAuditWithSession(
  params: {
    user: CreateEntryParams['user'];
    action: string;
    entity: string;
    entityId?: string;
    oldValues?: any;
    newValues?: any;
  },
  session?: mongoose.ClientSession
) {
  await AuditLog.create(
    [
      {
        userId: params.user?.userId || 'system',
        userName: params.user?.name || params.user?.username || 'System',
        userRole: params.user?.role || 'System',
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.parse(JSON.stringify(params.oldValues)) : undefined,
        newValues: params.newValues ? JSON.parse(JSON.stringify(params.newValues)) : undefined,
        timestamp: new Date(),
      },
    ],
    session ? { session } : undefined
  );
}

/**
 * Resolve FiscalYear & AccountingPeriod covering entryDate, asserting the period is Open.
 */
export async function resolveOpenPeriodForDate(
  dateInput: Date | string,
  session?: mongoose.ClientSession
): Promise<{ period: IAccountingPeriod; fiscalYearCode: string }> {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid entry date.');
  }
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;

  let period = await AccountingPeriod.findOne({ year, month }).session(session || null);
  if (!period) {
    // Only auto-create if FiscalYear already exists; otherwise enforce FiscalYear existence
    const existingFy = await FiscalYear.findOne({ code: `FY${year}`, isDeleted: { $ne: true } }).session(
      session || null
    );
    if (!existingFy) {
      await ensureFiscalYearWithPeriods(year, 'System');
    }
    period = await AccountingPeriod.findOne({ year, month }).session(session || null);
  }
  if (!period) {
    throw new Error(`No accounting period found covering ${month}/${year}. Create the fiscal year first.`);
  }

  const fy = await FiscalYear.findById(period.fiscalYearId).session(session || null);
  if (!fy || fy.isDeleted) {
    throw new Error(`Fiscal year for ${month}/${year} is missing.`);
  }
  if (fy.status === 'Closed') {
    throw new Error(`Fiscal year ${fy.code} is Closed. Posting into closed fiscal years is forbidden.`);
  }
  if (period.status === 'Locked') {
    throw new Error(`Accounting period ${period.name} is Locked. Unlock the period (Admin) before posting.`);
  }

  return { period, fiscalYearCode: fy.code };
}

export async function nextVoucherNumber(
  fiscalYearCode: string,
  journalType: JournalTypeCode,
  session: mongoose.ClientSession
): Promise<string> {
  const seriesKey = `${fiscalYearCode}:${journalType}`.toUpperCase();
  const doc = await VoucherSequence.findOneAndUpdate(
    { seriesKey },
    {
      $inc: { lastSeq: 1 },
      $setOnInsert: {
        fiscalYearCode: fiscalYearCode.toUpperCase(),
        journalType,
      },
    },
    { returnDocument: 'after', upsert: true, session }
  );
  const seq = doc?.lastSeq || 1;
  return `${journalType}-${fiscalYearCode.toUpperCase()}-${String(seq).padStart(5, '0')}`;
}

export async function nextDraftNumber(
  journalType: JournalTypeCode,
  session: mongoose.ClientSession
): Promise<string> {
  const seriesKey = `DRAFT:${journalType}`.toUpperCase();
  const doc = await VoucherSequence.findOneAndUpdate(
    { seriesKey },
    {
      $inc: { lastSeq: 1 },
      $setOnInsert: {
        fiscalYearCode: 'DRAFT',
        journalType,
      },
    },
    { returnDocument: 'after', upsert: true, session }
  );
  const seq = doc?.lastSeq || 1;
  return `DRF-${journalType}-${String(seq).padStart(5, '0')}`;
}

export async function validateAndNormalizeLines(
  rawLines: JournalLineInput[],
  session?: mongoose.ClientSession
) {
  if (!Array.isArray(rawLines) || rawLines.length < 2) {
    throw new Error('A journal entry must contain at least 2 lines (debit and credit).');
  }

  const accountIds = Array.from(new Set(rawLines.map((l) => String(l.accountId || '').trim()).filter(Boolean)));
  if (accountIds.length === 0) {
    throw new Error('Valid accountId is required on every journal line.');
  }

  const accounts = await Account.find({
    _id: { $in: accountIds },
    isDeleted: { $ne: true },
  }).session(session || null);

  const accountMap = new Map<string, IAccount>();
  for (const a of accounts) {
    accountMap.set(a._id.toString(), a);
  }

  const normalized: Array<{
    lineNo: number;
    accountId: mongoose.Types.ObjectId;
    description: string;
    debitPaisa: number;
    creditPaisa: number;
    branch: string;
    department: string;
    studentId: mongoose.Types.ObjectId | null;
    employeeId: mongoose.Types.ObjectId | null;
    agentId: mongoose.Types.ObjectId | null;
    vendorId: mongoose.Types.ObjectId | null;
  }> = [];

  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i];
    const acc = accountMap.get(String(l.accountId || ''));
    if (!acc) {
      throw new Error(`Line ${i + 1}: Account does not exist or has been archived.`);
    }
    if (!acc.active) {
      throw new Error(`Line ${i + 1}: Account "${acc.code} - ${acc.name}" is inactive.`);
    }
    if (acc.isGroup) {
      throw new Error(
        `Line ${i + 1}: "${acc.code} - ${acc.name}" is a Group header. Post only to leaf accounts.`
      );
    }

    const debitPaisa = assertIntPaisa(l.debitPaisa ?? 0, `Line ${i + 1} Debit`);
    const creditPaisa = assertIntPaisa(l.creditPaisa ?? 0, `Line ${i + 1} Credit`);

    if (debitPaisa < 0 || creditPaisa < 0) {
      throw new Error(`Line ${i + 1}: Debit and credit amounts cannot be negative.`);
    }
    if (debitPaisa > 0 && creditPaisa > 0) {
      throw new Error(`Line ${i + 1}: A line cannot have both debit and credit > 0.`);
    }
    if (debitPaisa === 0 && creditPaisa === 0) {
      throw new Error(`Line ${i + 1}: Line amount must be greater than zero.`);
    }

    normalized.push({
      lineNo: i + 1,
      accountId: acc._id as mongoose.Types.ObjectId,
      description: String(l.description || '').trim(),
      debitPaisa,
      creditPaisa,
      branch: String(l.branch || 'Main').trim() || 'Main',
      department: String(l.department || 'General').trim() || 'General',
      studentId: l.studentId ? new mongoose.Types.ObjectId(l.studentId) : null,
      employeeId: l.employeeId ? new mongoose.Types.ObjectId(l.employeeId) : null,
      agentId: l.agentId ? new mongoose.Types.ObjectId(l.agentId) : null,
      vendorId: l.vendorId ? new mongoose.Types.ObjectId(l.vendorId) : null,
    });
  }

  const totalDebitPaisa = sumPaisa(normalized.map((l) => l.debitPaisa));
  const totalCreditPaisa = sumPaisa(normalized.map((l) => l.creditPaisa));

  if (totalDebitPaisa <= 0 || totalDebitPaisa !== totalCreditPaisa) {
    throw new Error(
      `Journal entry does not balance: Debit (${totalDebitPaisa} paisa) ≠ Credit (${totalCreditPaisa} paisa).`
    );
  }

  return { normalized, totalDebitPaisa, totalCreditPaisa };
}

/**
 * Transactional Journal Entry creator (Draft or immediately Posted) with idempotency support.
 */
export async function createJournalEntry(params: CreateEntryParams): Promise<{
  entry: IJournalEntry;
  lines: IJournalLine[];
  duplicate: boolean;
}> {
  await connectDB();
  await ensureAccountsSeeded();

  if (params.idempotencyKey) {
    const existing = await JournalEntry.findOne({
      idempotencyKey: params.idempotencyKey,
      isDeleted: { $ne: true },
    });
    if (existing) {
      const existingLines = await JournalLine.find({
        entryId: existing._id,
        isDeleted: { $ne: true },
      }).sort({ lineNo: 1 });
      return { entry: existing, lines: existingLines, duplicate: true };
    }
  }

  const entryDateObj = new Date(params.entryDate);
  if (Number.isNaN(entryDateObj.getTime())) {
    throw new Error('Valid entryDate is required.');
  }

  const postImmediately = Boolean(params.postImmediately);
  const createdBy = params.user?.name || params.user?.username || 'System';

  const execute = async (session: mongoose.ClientSession) => {
    if (params.idempotencyKey) {
      const dupInTx = await JournalEntry.findOne({
        idempotencyKey: params.idempotencyKey,
        isDeleted: { $ne: true },
      }).session(session);
      if (dupInTx) {
        const dupLines = await JournalLine.find({
          entryId: dupInTx._id,
          isDeleted: { $ne: true },
        })
          .sort({ lineNo: 1 })
          .session(session);
        return { entry: dupInTx, lines: dupLines, duplicate: true };
      }
    }

    const journal = await Journal.findOne({ code: params.journalType, active: true }).session(session);
    if (!journal) {
      throw new Error(`Journal type "${params.journalType}" not found or inactive.`);
    }

    const { period, fiscalYearCode } = await resolveOpenPeriodForDate(entryDateObj, session);
    const { normalized, totalDebitPaisa, totalCreditPaisa } = await validateAndNormalizeLines(
      params.lines,
      session
    );

    const voucherNo = postImmediately
      ? await nextVoucherNumber(fiscalYearCode, params.journalType, session)
      : await nextDraftNumber(params.journalType, session);

    const status = postImmediately ? 'Posted' : 'Draft';
    const now = new Date();

    const [entry] = await JournalEntry.create(
      [
        {
          voucherNo,
          journalId: journal._id,
          journalType: params.journalType,
          fiscalYearId: period.fiscalYearId,
          periodId: period._id,
          entryDate: entryDateObj,
          description: params.description.trim(),
          reference: String(params.reference || '').trim(),
          status,
          isReversal: false,
          sourceModule: (params.sourceModule || 'MANUAL').toUpperCase(),
          sourceId: params.sourceId || '',
          ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
          totalDebitPaisa,
          totalCreditPaisa,
          postedBy: postImmediately ? createdBy : '',
          postedAt: postImmediately ? now : null,
          createdBy,
          isDeleted: false,
        },
      ],
      { session }
    );

    const lineDocs = await JournalLine.insertMany(
      normalized.map((l) => ({
        ...l,
        entryId: entry._id,
        entryDate: entryDateObj,
        status,
        reconciled: false,
        isDeleted: false,
      })),
      { session }
    );

    await writeAuditWithSession(
      {
        user: params.user,
        action: postImmediately ? 'JOURNAL_ENTRY_POSTED' : 'JOURNAL_ENTRY_DRAFT_CREATED',
        entity: 'JournalEntry',
        entityId: entry._id.toString(),
        newValues: {
          voucherNo: entry.voucherNo,
          journalType: entry.journalType,
          status: entry.status,
          entryDate: entry.entryDate,
          totalDebitPaisa,
          totalCreditPaisa,
          lineCount: lineDocs.length,
        },
      },
      session
    );

    return { entry, lines: lineDocs, duplicate: false };
  };

  if (params.session) {
    return execute(params.session);
  }
  return runInTransaction(execute);
}

/**
 * Post an existing Draft JournalEntry transactionally, assigning its fiscal-year voucher number.
 */
export async function postDraftJournalEntry(
  entryId: string,
  user: CreateEntryParams['user']
): Promise<IJournalEntry> {
  await connectDB();
  await ensureAccountsSeeded();

  const actor = user?.name || user?.username || 'System';

  return runInTransaction(async (session) => {
    const entry = await JournalEntry.findOne({ _id: entryId, isDeleted: { $ne: true } }).session(
      session
    );
    if (!entry) {
      throw new Error('Journal entry not found.');
    }
    if (entry.status !== 'Draft') {
      throw new Error(`Only Draft entries can be posted (current status: ${entry.status}).`);
    }

    const { period, fiscalYearCode } = await resolveOpenPeriodForDate(entry.entryDate, session);
    const lines = await JournalLine.find({
      entryId: entry._id,
      isDeleted: { $ne: true },
    }).session(session);

    await validateAndNormalizeLines(
      lines.map((l) => ({
        accountId: l.accountId.toString(),
        description: l.description,
        debitPaisa: l.debitPaisa,
        creditPaisa: l.creditPaisa,
        branch: l.branch,
        department: l.department,
      })),
      session
    );

    const oldVoucher = entry.voucherNo;
    const postedVoucherNo = await nextVoucherNumber(fiscalYearCode, entry.journalType, session);
    const now = new Date();

    entry.voucherNo = postedVoucherNo;
    entry.fiscalYearId = period.fiscalYearId;
    entry.periodId = period._id;
    entry.status = 'Posted';
    entry.postedBy = actor;
    entry.postedAt = now;
    await entry.save({ session });

    await JournalLine.updateMany(
      { entryId: entry._id, isDeleted: { $ne: true } },
      { $set: { status: 'Posted' } },
      { session }
    );

    await writeAuditWithSession(
      {
        user,
        action: 'JOURNAL_ENTRY_POSTED',
        entity: 'JournalEntry',
        entityId: entry._id.toString(),
        oldValues: { status: 'Draft', voucherNo: oldVoucher },
        newValues: { status: 'Posted', voucherNo: postedVoucherNo, totalDebitPaisa: entry.totalDebitPaisa },
      },
      session
    );

    return entry;
  });
}

/**
 * Reverse an immutable Posted JournalEntry by creating an atomic mirror entry.
 */
export async function reverseJournalEntry(params: {
  entryId: string;
  reason: string;
  reversalDate?: Date | string;
  session?: mongoose.ClientSession;
  user: CreateEntryParams['user'];
}): Promise<{ original: IJournalEntry; reversal: IJournalEntry }> {
  await connectDB();
  await ensureAccountsSeeded();

  const reason = String(params.reason || '').trim();
  if (reason.length < 3) {
    throw new Error('A clear reversal reason (minimum 3 characters) is required.');
  }
  const actor = params.user?.name || params.user?.username || 'System';

  const execute = async (session: mongoose.ClientSession) => {
    const orig = await JournalEntry.findOne({
      _id: params.entryId,
      isDeleted: { $ne: true },
    }).session(session);

    if (!orig) {
      throw new Error('Journal entry not found.');
    }
    if (orig.isReversal) {
      throw new Error('A reversal entry cannot itself be reversed.');
    }
    if (orig.status === 'Reversed' || orig.reversedById) {
      throw new Error(`Entry ${orig.voucherNo} has already been reversed.`);
    }
    if (orig.status !== 'Posted') {
      throw new Error(`Only Posted journal entries can be reversed (current status: ${orig.status}).`);
    }

    const revDate = params.reversalDate ? new Date(params.reversalDate) : new Date();
    const { period, fiscalYearCode } = await resolveOpenPeriodForDate(revDate, session);
    const revVoucherNo = await nextVoucherNumber(fiscalYearCode, orig.journalType, session);

    const origLines = await JournalLine.find({
      entryId: orig._id,
      isDeleted: { $ne: true },
    })
      .sort({ lineNo: 1 })
      .session(session);

    const revTime = new Date();
    const [reversal] = await JournalEntry.create(
      [
        {
          voucherNo: revVoucherNo,
          journalId: orig.journalId,
          journalType: orig.journalType,
          fiscalYearId: period.fiscalYearId,
          periodId: period._id,
          entryDate: revDate,
          description: `REVERSAL of ${orig.voucherNo}: ${reason}`,
          reference: orig.voucherNo,
          status: 'Posted',
          isReversal: true,
          reversalOfId: orig._id,
          reversalReason: reason,
          sourceModule: orig.sourceModule,
          sourceId: orig.sourceId,
          totalDebitPaisa: orig.totalCreditPaisa,
          totalCreditPaisa: orig.totalDebitPaisa,
          postedBy: actor,
          postedAt: revTime,
          createdBy: actor,
          isDeleted: false,
        },
      ],
      { session }
    );

    await JournalLine.insertMany(
      origLines.map((l) => ({
        entryId: reversal._id,
        lineNo: l.lineNo,
        accountId: l.accountId,
        description: `Reversal (${orig.voucherNo}): ${l.description || orig.description}`,
        debitPaisa: l.creditPaisa,
        creditPaisa: l.debitPaisa,
        branch: l.branch,
        department: l.department,
        studentId: l.studentId,
        employeeId: l.employeeId,
        agentId: l.agentId,
        vendorId: l.vendorId,
        entryDate: revDate,
        status: 'Posted',
        reconciled: false,
        isDeleted: false,
      })),
      { session }
    );

    orig.status = 'Reversed';
    orig.reversedById = reversal._id as mongoose.Types.ObjectId;
    orig.reversalReason = reason;
    orig.reversedBy = actor;
    orig.reversedAt = revTime;
    await orig.save({ session });

    // Original lines stay active in GL as 'Reversed' so original + reversal net cleanly to zero.
    await JournalLine.updateMany(
      { entryId: orig._id, isDeleted: { $ne: true } },
      { $set: { status: 'Reversed' } },
      { session }
    );

    await writeAuditWithSession(
      {
        user: params.user,
        action: 'JOURNAL_ENTRY_REVERSED',
        entity: 'JournalEntry',
        entityId: orig._id.toString(),
        oldValues: { status: 'Posted', voucherNo: orig.voucherNo },
        newValues: {
          status: 'Reversed',
          reversalVoucherNo: reversal.voucherNo,
          reversalId: reversal._id.toString(),
          reason,
        },
      },
      session
    );

    return { original: orig, reversal };
  };

  return params.session ? execute(params.session) : runInTransaction(execute);
}

/**
 * Soft-delete ONLY Draft entries; Posted/Reversed entries are strictly immutable.
 */
export async function softDeleteDraftEntry(
  entryId: string,
  user: CreateEntryParams['user']
): Promise<void> {
  await connectDB();
  const actor = user?.name || user?.username || 'System';

  await runInTransaction(async (session) => {
    const entry = await JournalEntry.findOne({ _id: entryId, isDeleted: { $ne: true } }).session(
      session
    );
    if (!entry) {
      throw new Error('Journal entry not found.');
    }
    if (entry.status !== 'Draft') {
      throw new Error(
        `Posted or Reversed journal entries are immutable and cannot be deleted (status: ${entry.status}). Use Reversal instead.`
      );
    }

    const now = new Date();
    entry.isDeleted = true;
    entry.deletedBy = actor;
    entry.deletedAt = now;
    await entry.save({ session });

    await JournalLine.updateMany(
      { entryId: entry._id },
      { $set: { isDeleted: true } },
      { session }
    );

    await writeAuditWithSession(
      {
        user,
        action: 'JOURNAL_ENTRY_DRAFT_SOFT_DELETED',
        entity: 'JournalEntry',
        entityId: entry._id.toString(),
        oldValues: { voucherNo: entry.voucherNo, status: entry.status },
        newValues: { isDeleted: true },
      },
      session
    );
  });
}

/**
 * Post Opening Balances as a single balanced JV entry (optionally auto-balancing via Opening Balance Equity 3900).
 */
export async function postOpeningBalances(params: {
  asOfDate: Date | string;
  description?: string;
  autoBalanceWithEquity?: boolean;
  lines: Array<{
    accountId: string;
    debitPaisa: number;
    creditPaisa: number;
    branch?: string;
    department?: string;
  }>;
  user: CreateEntryParams['user'];
}) {
  await connectDB();
  await ensureAccountsSeeded();

  const linesCopy: JournalLineInput[] = params.lines
    .filter((l) => (l.debitPaisa || 0) > 0 || (l.creditPaisa || 0) > 0)
    .map((l) => ({
      accountId: l.accountId,
      description: 'Opening Balance',
      debitPaisa: assertIntPaisa(l.debitPaisa || 0, 'Opening Debit'),
      creditPaisa: assertIntPaisa(l.creditPaisa || 0, 'Opening Credit'),
      branch: l.branch || 'Main',
      department: l.department || 'General',
    }));

  if (linesCopy.length === 0) {
    throw new Error('Enter at least one opening balance line.');
  }

  const totalDr = sumPaisa(linesCopy.map((l) => l.debitPaisa));
  const totalCr = sumPaisa(linesCopy.map((l) => l.creditPaisa));

  if (totalDr !== totalCr) {
    if (!params.autoBalanceWithEquity) {
      throw new Error(
        `Opening balances must balance (Debit=${totalDr} paisa, Credit=${totalCr} paisa), or enable Auto-balance with Opening Balance Equity.`
      );
    }
    const equityAcc = await Account.findOne({
      systemTag: 'OPENING_EQUITY',
      isDeleted: { $ne: true },
      active: true,
    }).lean();
    if (!equityAcc) {
      throw new Error('Opening Balance Equity (3900) account not found.');
    }
    const diff = totalDr - totalCr;
    linesCopy.push({
      accountId: equityAcc._id.toString(),
      description: 'Opening Balance Equity Offset',
      debitPaisa: diff < 0 ? Math.abs(diff) : 0,
      creditPaisa: diff > 0 ? diff : 0,
      branch: 'Main',
      department: 'General',
    });
  }

  return createJournalEntry({
    journalType: 'JV',
    entryDate: params.asOfDate,
    description: params.description?.trim() || 'Opening Balances Entry',
    reference: 'OPENING-BALANCE',
    sourceModule: 'OPENING_BALANCE',
    postImmediately: true,
    lines: linesCopy,
    user: params.user,
  });
}

/**
 * General Ledger query with opening balance before startDate and line-by-line running balance.
 */
export async function getAccountLedger(params: {
  accountId: string;
  startDate?: string;
  endDate?: string;
  branch?: string;
  department?: string;
}) {
  await connectDB();
  await ensureAccountsSeeded();

  const account = await Account.findOne({
    _id: params.accountId,
    isDeleted: { $ne: true },
  }).lean();
  if (!account) {
    throw new Error('Account not found.');
  }

  const baseMatch: Record<string, any> = {
    accountId: account._id,
    status: { $in: ['Posted', 'Reversed'] },
    isDeleted: { $ne: true },
  };
  if (params.branch && params.branch !== 'all') baseMatch.branch = params.branch;
  if (params.department && params.department !== 'all') baseMatch.department = params.department;

  let openingBalancePaisa = 0;
  const dateFilter: Record<string, any> = {};

  if (params.startDate) {
    const startDt = new Date(params.startDate);
    startDt.setUTCHours(0, 0, 0, 0);
    dateFilter.$gte = startDt;

    const priorLines = await JournalLine.find({
      ...baseMatch,
      entryDate: { $lt: startDt },
    })
      .select('debitPaisa creditPaisa')
      .lean();

    for (const pl of priorLines) {
      openingBalancePaisa +=
        account.normalBalance === 'Debit'
          ? (pl.debitPaisa || 0) - (pl.creditPaisa || 0)
          : (pl.creditPaisa || 0) - (pl.debitPaisa || 0);
    }
  }

  if (params.endDate) {
    const endDt = new Date(params.endDate);
    endDt.setUTCHours(23, 59, 59, 999);
    dateFilter.$lte = endDt;
  }

  const rangeMatch = {
    ...baseMatch,
    ...(Object.keys(dateFilter).length > 0 ? { entryDate: dateFilter } : {}),
  };

  const lines = await JournalLine.find(rangeMatch)
    .populate({
      path: 'entryId',
      select: 'voucherNo journalType entryDate description reference status isReversal sourceModule',
    })
    .sort({ entryDate: 1, createdAt: 1, lineNo: 1 })
    .lean();

  let runningBalancePaisa = openingBalancePaisa;
  let periodDebitPaisa = 0;
  let periodCreditPaisa = 0;

  const ledgerRows = lines.map((line: any) => {
    const dr = line.debitPaisa || 0;
    const cr = line.creditPaisa || 0;
    periodDebitPaisa += dr;
    periodCreditPaisa += cr;
    runningBalancePaisa +=
      account.normalBalance === 'Debit' ? dr - cr : cr - dr;

    return {
      _id: line._id.toString(),
      entryId: line.entryId?._id?.toString() || String(line.entryId),
      voucherNo: line.entryId?.voucherNo || '',
      journalType: line.entryId?.journalType || 'JV',
      entryStatus: line.entryId?.status || line.status,
      isReversal: Boolean(line.entryId?.isReversal),
      entryDate: line.entryDate,
      reference: line.entryId?.reference || '',
      description: line.description || line.entryId?.description || '',
      branch: line.branch,
      department: line.department,
      debitPaisa: dr,
      creditPaisa: cr,
      runningBalancePaisa,
    };
  });

  return {
    account,
    openingBalancePaisa,
    periodDebitPaisa,
    periodCreditPaisa,
    closingBalancePaisa: runningBalancePaisa,
    rows: ledgerRows,
  };
}

