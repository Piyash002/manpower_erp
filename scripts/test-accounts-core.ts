import fs from 'fs';
import path from 'path';

for (const fname of ['.env', '.env.local']) {
  const envPath = path.resolve(process.cwd(), fname);
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8')
      .split('\n')
      .forEach((line) => {
        const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (m) {
          process.env[m[1]] = (m[2] || '').trim().replace(/^['"](.*)['"]$/, '$1');
        }
      });
  }
}

import { connectDB } from '../src/lib/db';
import { ensureAccountsSeeded, ensureFiscalYearWithPeriods } from '../src/lib/accounts-seed';
import {
  assertIntPaisa,
  formatPaisaBDT,
  paisaToTaka,
  sumPaisa,
  takaToPaisa,
} from '../src/lib/accounts-money';
import {
  createJournalEntry,
  getAccountLedger,
  postDraftJournalEntry,
  reverseJournalEntry,
  softDeleteDraftEntry,
} from '../src/lib/accounts-engine';
import { Account } from '../src/models/Account';
import { AccountingPeriod } from '../src/models/AccountingPeriod';
import { FiscalYear } from '../src/models/FiscalYear';
import { JournalEntry } from '../src/models/JournalEntry';
import { JournalLine } from '../src/models/JournalLine';
import { VoucherSequence } from '../src/models/VoucherSequence';

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string, detail?: string) {
  if (cond) {
    console.log(`✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function expectThrows(fn: () => Promise<any>, expectedMsgSubstr: string, name: string) {
  try {
    await fn();
    console.error(`❌ FAIL: ${name} (expected error containing "${expectedMsgSubstr}", succeeded instead)`);
    failed++;
  } catch (err: any) {
    if (String(err?.message || '').toLowerCase().includes(expectedMsgSubstr.toLowerCase())) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name} (wrong error: "${err?.message}")`);
      failed++;
    }
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('DREAMS ERP - PHASE 1 ACCOUNTS CORE LEDGER TESTS');
  console.log('====================================================\n');

  // 1. Pure Integer Paisa Money Math
  assert(
    takaToPaisa(0.1) + takaToPaisa(0.2) === 30 &&
      paisaToTaka(150050) === 1500.5 &&
      sumPaisa([10000, 25050, 50]) === 35100 &&
      formatPaisaBDT(15000000) === '৳1,50,000.00',
    'Integer paisa arithmetic avoids floating point drift and formats BDT cleanly'
  );

  await expectThrows(
    async () => assertIntPaisa(12.34, 'Test'),
    'integer value in paisa',
    'assertIntPaisa rejects float amounts'
  );

  // Connect DB & seed COA
  await connectDB();
  await ensureAccountsSeeded();

  // Use isolated future Fiscal Year 2098 so live FY2026 sequences/balances remain spotless!
  const testFyYear = 2098;
  await ensureFiscalYearWithPeriods(testFyYear, 'QA-Runner');
  const testUser = { userId: 'qa-admin', name: 'QA Admin', username: 'qaadmin', role: 'Admin' };

  const [cashAcc, expenseAcc, groupAcc] = await Promise.all([
    Account.findOne({ systemTag: 'CASH' }).lean(),
    Account.findOne({ systemTag: 'ADMIN_EXPENSE' }).lean(),
    Account.findOne({ code: '1000' }).lean(),
  ]);

  assert(
    Boolean(cashAcc && expenseAcc && groupAcc && groupAcc.isGroup),
    'COA default manpower accounts seeded cleanly (Cash 1110, Admin Expense 5240, Asset Group 1000)'
  );

  const cashId = cashAcc!._id.toString();
  const expId = expenseAcc!._id.toString();
  const groupId = groupAcc!._id.toString();

  // Cleanup any leftover 2098 test data before starting
  const testStart = new Date(Date.UTC(2098, 0, 1));
  const testEnd = new Date(Date.UTC(2098, 11, 31, 23, 59, 59, 999));
  const oldTestEntries = await JournalEntry.find({ entryDate: { $gte: testStart, $lte: testEnd } }).select('_id');
  if (oldTestEntries.length > 0) {
    const oldIds = oldTestEntries.map((e) => e._id);
    await JournalLine.deleteMany({ entryId: { $in: oldIds } });
    await JournalEntry.deleteMany({ _id: { $in: oldIds } });
  }
  await VoucherSequence.deleteMany({ fiscalYearCode: 'FY2098' });
  await AccountingPeriod.updateMany({ year: 2098 }, { $set: { status: 'Open', lockReason: '' } });

  try {
    // 2. Reject unbalanced journal entry
    await expectThrows(
      () =>
        createJournalEntry({
          journalType: 'JV',
          entryDate: '2098-03-10',
          description: 'Unbalanced test',
          postImmediately: true,
          lines: [
            { accountId: expId, debitPaisa: 100000, creditPaisa: 0, branch: 'Main', department: 'General' },
            { accountId: cashId, debitPaisa: 0, creditPaisa: 90000, branch: 'Main', department: 'General' },
          ],
          user: testUser,
        }),
      'does not balance',
      'Unbalanced journal entry rejected strictly'
    );

    // 3. Reject posting to Group account
    await expectThrows(
      () =>
        createJournalEntry({
          journalType: 'JV',
          entryDate: '2098-03-10',
          description: 'Group post attempt',
          postImmediately: true,
          lines: [
            { accountId: expId, debitPaisa: 50000, creditPaisa: 0 },
            { accountId: groupId, debitPaisa: 0, creditPaisa: 50000 },
          ],
          user: testUser,
        }),
      'Group header',
      'Posting to Group header account rejected'
    );

    // 4. Draft creation -> edit/post -> Fiscal-year voucher numbering
    const draftRes = await createJournalEntry({
      journalType: 'PV',
      entryDate: '2098-03-12',
      description: 'Office stationery draft',
      postImmediately: false,
      lines: [
        { accountId: expId, debitPaisa: 250000, creditPaisa: 0, branch: 'Dhaka', department: 'Administration' },
        { accountId: cashId, debitPaisa: 0, creditPaisa: 250000, branch: 'Dhaka', department: 'Administration' },
      ],
      user: testUser,
    });
    assert(
      draftRes.entry.status === 'Draft' && draftRes.entry.voucherNo.startsWith('DRF-PV-'),
      'Draft voucher created with DRF-PV prefix'
    );

    const postedEntry = await postDraftJournalEntry(draftRes.entry._id.toString(), testUser);
    assert(
      postedEntry.status === 'Posted' && postedEntry.voucherNo === 'PV-FY2098-00001',
      'Posting Draft assigns gapless fiscal-year voucher number PV-FY2098-00001'
    );

    // 5. Idempotency check
    const idemKey = `TEST-IDEM-2098-${Date.now()}`;
    const firstIdem = await createJournalEntry({
      journalType: 'JV',
      entryDate: '2098-03-15',
      description: 'Idempotent voucher',
      idempotencyKey: idemKey,
      postImmediately: true,
      lines: [
        { accountId: expId, debitPaisa: 100000, creditPaisa: 0 },
        { accountId: cashId, debitPaisa: 0, creditPaisa: 100000 },
      ],
      user: testUser,
    });
    const secondIdem = await createJournalEntry({
      journalType: 'JV',
      entryDate: '2098-03-15',
      description: 'Idempotent voucher duplicate call',
      idempotencyKey: idemKey,
      postImmediately: true,
      lines: [
        { accountId: expId, debitPaisa: 100000, creditPaisa: 0 },
        { accountId: cashId, debitPaisa: 0, creditPaisa: 100000 },
      ],
      user: testUser,
    });
    assert(
      !firstIdem.duplicate &&
        secondIdem.duplicate &&
        firstIdem.entry._id.toString() === secondIdem.entry._id.toString(),
      'Idempotency key prevents duplicate journal posting'
    );

    // 6. Period Lock enforcement
    await AccountingPeriod.updateOne(
      { year: 2098, month: 4 },
      { $set: { status: 'Locked', lockReason: 'QA period lock check' } }
    );
    await expectThrows(
      () =>
        createJournalEntry({
          journalType: 'JV',
          entryDate: '2098-04-05',
          description: 'Locked period attempt',
          postImmediately: true,
          lines: [
            { accountId: expId, debitPaisa: 50000, creditPaisa: 0 },
            { accountId: cashId, debitPaisa: 0, creditPaisa: 50000 },
          ],
          user: testUser,
        }),
      'Locked',
      'Locked accounting period blocks posting'
    );

    // 7. Reversal immutability & General Ledger running balance net zero
    await expectThrows(
      () => softDeleteDraftEntry(postedEntry._id.toString(), testUser),
      'immutable',
      'Posted journal entry cannot be deleted'
    );

    const revRes = await reverseJournalEntry({
      entryId: postedEntry._id.toString(),
      reason: 'Wrong amount entered',
      reversalDate: '2098-03-16',
      user: testUser,
    });
    assert(
      revRes.original.status === 'Reversed' &&
        revRes.reversal.isReversal &&
        revRes.reversal.status === 'Posted' &&
        revRes.reversal.voucherNo === 'PV-FY2098-00002',
      'Reversal marks original Reversed and posts mirror voucher PV-FY2098-00002'
    );

    // Double-reversal blocked
    await expectThrows(
      () =>
        reverseJournalEntry({
          entryId: postedEntry._id.toString(),
          reason: 'Second attempt',
          reversalDate: '2098-03-16',
          user: testUser,
        }),
      'already been reversed',
      'Reversing an already-reversed entry is blocked'
    );

    // General Ledger verification for Admin Expense in March 2098 (250,000 + 100,000 - 250,000 = 100,000)
    const gl = await getAccountLedger({
      accountId: expId,
      startDate: '2098-03-01',
      endDate: '2098-03-31',
    });
    assert(
      gl.periodDebitPaisa === 350000 &&
        gl.periodCreditPaisa === 250000 &&
        gl.closingBalancePaisa === 100000,
      'General Ledger running balance reflects posted entries and mirror reversal accurately',
      `dr=${gl.periodDebitPaisa}, cr=${gl.periodCreditPaisa}, closing=${gl.closingBalancePaisa}`
    );

    // Draft soft-delete works cleanly
    const delDraft = await createJournalEntry({
      journalType: 'JV',
      entryDate: '2098-03-20',
      description: 'Disposable draft',
      postImmediately: false,
      lines: [
        { accountId: expId, debitPaisa: 10000, creditPaisa: 0 },
        { accountId: cashId, debitPaisa: 0, creditPaisa: 10000 },
      ],
      user: testUser,
    });
    await softDeleteDraftEntry(delDraft.entry._id.toString(), testUser);
    const softDeletedDoc = await JournalEntry.findById(delDraft.entry._id).lean();
    assert(Boolean(softDeletedDoc?.isDeleted), 'Draft entry soft-deleted cleanly (never hard-deleted)');
  } finally {
    // Cleanup 2098 QA records so live database stays clean
    const cleanupEntries = await JournalEntry.find({ entryDate: { $gte: testStart, $lte: testEnd } }).select('_id');
    if (cleanupEntries.length > 0) {
      const cleanupIds = cleanupEntries.map((e) => e._id);
      await JournalLine.deleteMany({ entryId: { $in: cleanupIds } });
      await JournalEntry.deleteMany({ _id: { $in: cleanupIds } });
    }
    await VoucherSequence.deleteMany({ fiscalYearCode: { $in: ['FY2098', 'DRAFT'] } });
    await AccountingPeriod.deleteMany({ year: testFyYear });
    await FiscalYear.deleteMany({ code: 'FY2098' });
  }

  console.log('\n====================================================');
  console.log(`PHASE 1 ACCOUNTS TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});

