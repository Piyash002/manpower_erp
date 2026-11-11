/**
 * Central Accounting Posting Service (Single Source of Truth).
 * Every module that moves or accrues money MUST post through this boundary.
 * No external module may write JournalEntry or JournalLine documents directly.
 */
import { Account } from '@/models/Account';
import {
  createJournalEntry,
  postDraftJournalEntry,
  reverseJournalEntry,
  postOpeningBalances,
  softDeleteDraftEntry,
  resolveOpenPeriodForDate,
  getAccountLedger,
  runInTransaction,
  nextVoucherNumber,
  validateAndNormalizeLines,
  type CreateEntryParams,
  type JournalLineInput,
} from '@/lib/accounts-engine';
import { connectDB } from '@/lib/db';
import { ensureAccountsSeeded } from '@/lib/accounts-seed';

export {
  createJournalEntry,
  postDraftJournalEntry,
  reverseJournalEntry,
  postOpeningBalances,
  softDeleteDraftEntry,
  resolveOpenPeriodForDate,
  getAccountLedger,
  runInTransaction,
  nextVoucherNumber,
  validateAndNormalizeLines,
};
export type { CreateEntryParams, JournalLineInput };

export async function getSystemAccountId(systemTag: string): Promise<string> {
  await connectDB();
  await ensureAccountsSeeded();
  const acc = await Account.findOne({
    systemTag: systemTag.toUpperCase(),
    isDeleted: { $ne: true },
    active: true,
  }).lean();
  if (!acc) {
    throw new Error(`System account with tag "${systemTag}" is missing or inactive in COA.`);
  }
  return acc._id.toString();
}

export function resolveDepositSystemTag(method: string): string {
  const m = (method || '').trim().toLowerCase();
  if (m === 'bkash') return 'BKASH';
  if (m === 'nagad' || m === 'rocket') return 'NAGAD';
  if (m === 'bank transfer' || m === 'bank' || m === 'cheque' || m === 'card') return 'BANK_MAIN';
  return 'CASH';
}

export interface PostBalancedParams {
  journalType: 'JV' | 'RV' | 'PV' | 'CV';
  entryDate: Date | string;
  description: string;
  reference?: string;
  sourceModule: string;
  sourceId: string;
  idempotencyKey: string;
  lines: JournalLineInput[];
  session?: import('mongoose').ClientSession;
  user: CreateEntryParams['user'];
}

/**
 * Post an immutable double-entry transaction cleanly with idempotency guarantee.
 */
export async function postTransactionEntry(params: PostBalancedParams) {
  return createJournalEntry({
    ...params,
    postImmediately: true,
  });
}
