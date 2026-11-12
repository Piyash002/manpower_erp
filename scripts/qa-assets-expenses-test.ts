import fs from 'fs';
import path from 'path';

for (const fname of ['.env', '.env.local']) {
  const envPath = path.resolve(process.cwd(), fname);
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8')
      .split('\n')
      .forEach((line) => {
        const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (m) process.env[m[1]] = (m[2] || '').trim().replace(/^['"](.*)['"]$/, '$1');
      });
  }
}

import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db';
import { ensureAccountsSeeded, ensureFiscalYearWithPeriods } from '../src/lib/accounts-seed';
import { AccountingPeriod } from '../src/models/AccountingPeriod';
import { FiscalYear } from '../src/models/FiscalYear';
import { JournalEntry } from '../src/models/JournalEntry';
import { JournalLine } from '../src/models/JournalLine';
import { FixedAsset } from '../src/models/FixedAsset';
import { DepreciationRun } from '../src/models/DepreciationRun';
import { ExpenseRecord } from '../src/models/ExpenseRecord';
import { VendorBill } from '../src/models/VendorBill';
import { VendorBillPayment } from '../src/models/VendorBillPayment';
import { Loan } from '../src/models/Loan';
import {
  registerFixedAsset,
  disposeFixedAsset,
  reverseAssetPurchase,
} from '../src/lib/accounts/assets';
import { runMonthlyDepreciation, reverseDepreciationRun } from '../src/lib/accounts/depreciation';
import {
  listExpenseCategories,
  createExpenseRecord,
  reverseExpenseRecord,
} from '../src/lib/accounts/expenses';
import {
  recordVendorBillPayment,
  reverseVendorBillPayment,
  createLoan,
} from '../src/lib/accounts/bills';
import { getBalanceSheetReport } from '../src/lib/accounts/reports';
import { getSystemAccountId } from '../src/lib/accounts/posting';

const ADMIN = { userId: 'qa-admin', name: 'QA Admin', username: 'qa-admin', role: 'Admin' };

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  await connectDB();
  await ensureAccountsSeeded();

  const fiscalYear = await ensureFiscalYearWithPeriods(2097);
  const periods = await AccountingPeriod.find({ fiscalYearId: fiscalYear._id })
    .sort({ month: 1 })
    .lean();
  const janPeriod = periods[0];
  const febPeriod = periods[1];
  const marPeriod = periods[2];

  const createdAssetIds: string[] = [];
  const createdDepRunIds: string[] = [];
  const createdExpenseIds: string[] = [];
  const createdBillIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdLoanIds: string[] = [];
  const createdEntryIds: string[] = [];

  let passed = 0;

  try {
    // 1. Asset purchase (paid and on-credit) posts balanced entries
    console.log('1. Testing Asset Purchase (Paid & Credit)...');
    const paidAsset = await registerFixedAsset(
      {
        name: 'QA Welding Machine',
        categoryTag: 'FA_TRAINING_EQUIPMENT',
        purchaseDate: '2097-01-10',
        costPaisa: 1000000, // 10,000 BDT
        salvageValuePaisa: 100000, // 1,000 BDT
        usefulLifeMonths: 3, // 3,000 BDT/month
        paymentType: 'Paid',
        paymentMethod: 'Bank',
        location: 'Lab A',
      },
      ADMIN
    );
    createdAssetIds.push(String(paidAsset.asset._id));
    createdEntryIds.push(String(paidAsset.entry._id));
    assert(paidAsset.entry.totalDebitPaisa === 1000000, 'Paid asset debit matches cost');
    assert(paidAsset.entry.totalCreditPaisa === 1000000, 'Paid asset credit matches cost');

    const creditAsset = await registerFixedAsset(
      {
        name: 'QA Training Computers',
        categoryTag: 'FA_COMPUTER',
        purchaseDate: '2097-01-12',
        costPaisa: 500000, // 5,000 BDT
        salvageValuePaisa: 500000, // 0 depreciable so it won't interfere with salvage test
        usefulLifeMonths: 12,
        paymentType: 'Credit',
        supplier: 'QA Tech Supply',
      },
      ADMIN
    );
    createdAssetIds.push(String(creditAsset.asset._id));
    createdEntryIds.push(String(creditAsset.entry._id));
    const creditBill = 'bill' in creditAsset ? creditAsset.bill : null;
    if (creditBill) createdBillIds.push(String(creditBill._id));
    assert(Boolean(creditBill), 'Credit asset purchase created a VendorBill');
    assert(creditBill!.duePaisa === 500000, 'VendorBill due matches cost');
    passed++;
    console.log('   PASS');

    // 2. Depreciation is idempotent per period and stops at salvage value
    console.log('2. Testing Monthly Depreciation (Idempotency & Salvage Stop)...');
    const depJan = await runMonthlyDepreciation(String(janPeriod._id), ADMIN);
    createdDepRunIds.push(String(depJan.run._id));
    createdEntryIds.push(String(depJan.entry._id));
    assert(depJan.run.totalPaisa >= 300000, 'Jan depreciation includes 3,000 BDT for QA Welding Machine');

    let dupBlocked = false;
    try {
      await runMonthlyDepreciation(String(janPeriod._id), ADMIN);
    } catch {
      dupBlocked = true;
    }
    assert(dupBlocked, 'Duplicate depreciation run for same open period must be blocked');

    const depFeb = await runMonthlyDepreciation(String(febPeriod._id), ADMIN);
    createdDepRunIds.push(String(depFeb.run._id));
    createdEntryIds.push(String(depFeb.entry._id));

    const depMar = await runMonthlyDepreciation(String(marPeriod._id), ADMIN);
    createdDepRunIds.push(String(depMar.run._id));
    createdEntryIds.push(String(depMar.entry._id));

    const weldingAfter3 = await FixedAsset.findById(paidAsset.asset._id).lean();
    assert(
      weldingAfter3!.accumulatedDepreciationPaisa === 900000,
      'Depreciation stopped at salvage value (10,000 - 1,000 = 9,000 BDT)'
    );
    passed++;
    console.log('   PASS');

    // 3. Expense paid / unpaid / prepaid post to correct accounts
    console.log('3. Testing Expense Paid / Unpaid / Prepaid...');
    const cats = await listExpenseCategories(true);
    const elecCat = cats.find((c) => c.accountCode === '5250') || cats[0];
    const rentCat = cats.find((c) => c.accountCode === '5260') || cats[0];

    const expPaid = await createExpenseRecord(
      {
        date: '2097-01-15',
        categoryId: String(elecCat._id),
        amountPaisa: 250000,
        payeeName: 'DESCO',
        description: 'QA Jan Electricity',
        paymentStatus: 'Paid',
        paymentMethod: 'Cash',
      },
      ADMIN
    );
    createdExpenseIds.push(String(expPaid.expense._id));
    createdEntryIds.push(String(expPaid.entry._id));

    const expUnpaid = await createExpenseRecord(
      {
        date: '2097-01-16',
        categoryId: String(elecCat._id),
        amountPaisa: 150000,
        payeeName: 'Titas Gas',
        description: 'QA Jan Gas Unpaid',
        paymentStatus: 'Unpaid',
      },
      ADMIN
    );
    createdExpenseIds.push(String(expUnpaid.expense._id));
    createdEntryIds.push(String(expUnpaid.entry._id));
    if (expUnpaid.bill) createdBillIds.push(String(expUnpaid.bill._id));
    assert(Boolean(expUnpaid.bill), 'Unpaid expense created VendorBill');

    const expPrepaid = await createExpenseRecord(
      {
        date: '2097-01-17',
        categoryId: String(rentCat._id),
        amountPaisa: 400000,
        payeeName: 'Landlord',
        description: 'QA Advance Rent',
        paymentStatus: 'Prepaid',
        paymentMethod: 'Bank',
      },
      ADMIN
    );
    createdExpenseIds.push(String(expPrepaid.expense._id));
    createdEntryIds.push(String(expPrepaid.entry._id));

    const prepayAccId = await getSystemAccountId('PREPAYMENTS');
    const prepayLines = await JournalLine.find({
      entryId: expPrepaid.entry._id,
      accountId: prepayAccId,
    }).lean();
    assert(
      prepayLines.length === 1 && prepayLines[0].debitPaisa === 400000,
      'Prepaid expense debited 1230 Prepayments'
    );
    passed++;
    console.log('   PASS');

    // 4. Bill payment rejects overpayment and updates status
    console.log('4. Testing Bill Payment & Overpayment Rejection...');
    const targetBillId = String(expUnpaid.bill!._id);
    let overpayBlocked = false;
    try {
      await recordVendorBillPayment(
        targetBillId,
        { paymentDate: '2097-01-20', amountPaisa: 200000, method: 'Bank' },
        ADMIN
      );
    } catch {
      overpayBlocked = true;
    }
    assert(overpayBlocked, 'Overpayment exceeding bill duePaisa must be rejected');

    const partPay = await recordVendorBillPayment(
      targetBillId,
      { paymentDate: '2097-01-20', amountPaisa: 50000, method: 'Cash' },
      ADMIN
    );
    createdPaymentIds.push(String(partPay.payment._id));
    createdEntryIds.push(String(partPay.entry._id));
    assert(partPay.bill.status === 'PartiallyPaid', 'Bill status updated to PartiallyPaid');
    assert(partPay.bill.duePaisa === 100000, 'Bill duePaisa reduced to 1,000 BDT');
    passed++;
    console.log('   PASS');

    // 5. Period lock blocks asset, expense, and depreciation postings
    console.log('5. Testing Period Lock Enforcement...');
    await AccountingPeriod.updateOne({ _id: janPeriod._id }, { $set: { status: 'Locked' } });
    const aprPeriod = periods[3];
    await AccountingPeriod.updateOne({ _id: aprPeriod._id }, { $set: { status: 'Locked' } });

    let assetLockBlocked = false;
    try {
      await registerFixedAsset(
        {
          name: 'Blocked Asset',
          categoryTag: 'FA_FURNITURE',
          purchaseDate: '2097-01-25',
          costPaisa: 100000,
          usefulLifeMonths: 12,
          paymentType: 'Paid',
          paymentMethod: 'Cash',
        },
        ADMIN
      );
    } catch {
      assetLockBlocked = true;
    }
    assert(assetLockBlocked, 'Locked period blocks asset purchase');

    let expLockBlocked = false;
    try {
      await createExpenseRecord(
        {
          date: '2097-01-25',
          categoryId: String(elecCat._id),
          amountPaisa: 10000,
          description: 'Blocked Exp',
          paymentStatus: 'Paid',
          paymentMethod: 'Cash',
        },
        ADMIN
      );
    } catch {
      expLockBlocked = true;
    }
    assert(expLockBlocked, 'Locked period blocks expense creation');

    let depLockBlocked = false;
    try {
      await runMonthlyDepreciation(String(aprPeriod._id), ADMIN);
    } catch {
      depLockBlocked = true;
    }
    assert(depLockBlocked, 'Locked period blocks depreciation run');

    // Re-open Jan so reversals can post if needed
    await AccountingPeriod.updateOne({ _id: janPeriod._id }, { $set: { status: 'Open' } });
    await AccountingPeriod.updateOne({ _id: aprPeriod._id }, { $set: { status: 'Open' } });
    passed++;
    console.log('   PASS');

    // 6. Reversals work and update downstream statuses/balances
    console.log('6. Testing Reversals (Payment, Expense, Depreciation) & Disposal...');
    const revPay = await reverseVendorBillPayment(String(partPay.payment._id), 'QA test reverse payment', ADMIN);
    createdEntryIds.push(String(revPay.reversal._id));
    assert(revPay.bill.status === 'Open', 'Bill reverted to Open after payment reversal');
    assert(revPay.bill.duePaisa === 150000, 'Bill duePaisa restored after payment reversal');

    const revExp = await reverseExpenseRecord(String(expUnpaid.expense._id), 'QA test reverse unpaid exp', ADMIN);
    createdEntryIds.push(String(revExp.reversal._id));
    const billAfterExpRev = await VendorBill.findById(targetBillId).lean();
    assert(billAfterExpRev!.status === 'Reversed', 'Linked VendorBill marked Reversed');

    const revDep = await reverseDepreciationRun(String(depMar.run._id), 'QA test reverse dep', ADMIN);
    createdEntryIds.push(String(revDep.reversal._id));
    const weldingAfterRev = await FixedAsset.findById(paidAsset.asset._id).lean();
    assert(
      weldingAfterRev!.accumulatedDepreciationPaisa === 600000,
      'Accumulated depreciation rolled back after run reversal'
    );

    const disp = await disposeFixedAsset(
      String(paidAsset.asset._id),
      {
        disposalType: 'Disposed',
        disposalDate: '2097-03-20',
        proceedsPaisa: 450000,
        paymentMethod: 'Bank',
        note: 'Sold in QA',
      },
      ADMIN
    );
    createdEntryIds.push(String(disp.entry._id));
    assert(disp.asset.status === 'Disposed', 'Asset marked Disposed');

    const loanRes = await createLoan(
      {
        lenderName: 'QA Bank',
        loanType: 'Bank',
        principalPaisa: 500000,
        receivedDate: '2097-01-18',
        depositMethod: 'Bank',
      },
      ADMIN
    );
    createdLoanIds.push(String(loanRes.loan._id));
    createdEntryIds.push(String(loanRes.entry._id));
    passed++;
    console.log('   PASS');

    // 7. Phase 2 — Cheque Payment Details
    console.log('7. Testing Phase 2: Paid Now with Cheque details...');
    const chequeAsset = await registerFixedAsset(
      {
        name: 'QA Cheque Drill',
        categoryTag: 'FA_TRAINING_EQUIPMENT',
        purchaseDate: '2097-04-05',
        unitCostPaisa: 300000,
        quantity: 1,
        usefulLifeMonths: 12,
        paymentType: 'Paid',
        paymentMethod: 'Cheque',
        bankName: 'Dutch-Bangla Bank',
        chequeNo: 'CHQ-998877',
        chequeDate: '2097-04-05',
        reference: 'REF-CHQ-1',
      },
      ADMIN
    );
    createdAssetIds.push(String(chequeAsset.asset._id));
    createdEntryIds.push(String(chequeAsset.entry._id));
    assert(chequeAsset.asset.bankName === 'Dutch-Bangla Bank', 'Cheque bankName stored');
    assert(chequeAsset.asset.chequeNo === 'CHQ-998877', 'Cheque chequeNo stored');
    const bankAccId = await getSystemAccountId('BANK_MAIN');
    const chequeBankLines = await JournalLine.find({
      entryId: chequeAsset.entry._id,
      accountId: bankAccId,
    }).lean();
    assert(
      chequeBankLines.length === 1 && chequeBankLines[0].creditPaisa === 300000,
      'Cheque purchase credited BANK_MAIN'
    );
    passed++;
    console.log('   PASS');

    // 8. Phase 2 — On Credit with Advance Paid, later settlement, overpayment & reversal guard
    console.log('8. Testing Phase 2: On Credit with Advance Paid & Reversal Guard...');
    let advRejected = false;
    try {
      await registerFixedAsset(
        {
          name: 'Invalid Advance Asset',
          categoryTag: 'FA_COMPUTER',
          purchaseDate: '2097-04-06',
          unitCostPaisa: 200000,
          quantity: 1,
          usefulLifeMonths: 12,
          paymentType: 'Credit',
          dueDate: '2097-05-06',
          advancePaidPaisa: 200000, // >= totalCost must fail
          paymentMethod: 'Cash',
        },
        ADMIN
      );
    } catch {
      advRejected = true;
    }
    assert(advRejected, 'Advance >= totalCost must be rejected');

    const advAsset = await registerFixedAsset(
      {
        name: 'QA Credit Advance Generator',
        categoryTag: 'FA_TRAINING_EQUIPMENT',
        purchaseDate: '2097-04-08',
        unitCostPaisa: 600000,
        quantity: 1,
        usefulLifeMonths: 24,
        paymentType: 'Credit',
        supplier: 'PowerCo',
        dueDate: '2097-05-08',
        advancePaidPaisa: 200000,
        paymentMethod: 'Bank',
        bankName: 'BRAC Bank',
        reference: 'ADV-TXN-1',
      },
      ADMIN
    );
    createdAssetIds.push(String(advAsset.asset._id));
    createdEntryIds.push(String(advAsset.entry._id));
    if (advAsset.bill) createdBillIds.push(String(advAsset.bill._id));
    if (advAsset.advancePayment) createdPaymentIds.push(String(advAsset.advancePayment._id));
    assert(advAsset.bill?.status === 'PartiallyPaid', 'Credit+Advance bill is PartiallyPaid');
    assert(advAsset.bill?.duePaisa === 400000, 'Bill duePaisa = total - advance');
    assert(Boolean(advAsset.advancePayment), 'Advance VendorBillPayment created');

    const remPay = await recordVendorBillPayment(
      String(advAsset.bill!._id),
      { paymentDate: '2097-04-12', amountPaisa: 400000, method: 'Cash' },
      ADMIN
    );
    createdPaymentIds.push(String(remPay.payment._id));
    createdEntryIds.push(String(remPay.entry._id));
    assert(remPay.bill.status === 'Paid' && remPay.bill.duePaisa === 0, 'Remainder payment marks bill Paid');

    let revWithLaterPayBlocked = false;
    try {
      await reverseAssetPurchase(String(advAsset.asset._id), 'Should fail', ADMIN);
    } catch {
      revWithLaterPayBlocked = true;
    }
    assert(revWithLaterPayBlocked, 'Asset reversal blocked while later bill payment exists');

    const revLaterPay = await reverseVendorBillPayment(
      String(remPay.payment._id),
      'Undo later pay',
      ADMIN
    );
    createdEntryIds.push(String(revLaterPay.reversal._id));
    const revAdvAsset = await reverseAssetPurchase(
      String(advAsset.asset._id),
      'Reverse after later payment undone',
      ADMIN
    );
    createdEntryIds.push(String(revAdvAsset.reversal._id));
    const advPayAfterRev = await VendorBillPayment.findById(advAsset.advancePayment!._id).lean();
    assert(advPayAfterRev?.status === 'Reversed', 'Advance payment marked Reversed');
    passed++;
    console.log('   PASS');

    // 9. Phase 2 — Separate Record Per Unit (Atomic, Serials, Group Reversal)
    console.log('9. Testing Phase 2: Separate-Record Mode (N units, 1 voucher)...');
    let serialMismatchRejected = false;
    try {
      await registerFixedAsset(
        {
          name: 'QA Mismatch Laptops',
          categoryTag: 'FA_COMPUTER',
          purchaseDate: '2097-04-15',
          unitCostPaisa: 100000,
          quantity: 3,
          separateUnits: true,
          serialNumbers: ['SN-1', 'SN-2'], // mismatch count
          usefulLifeMonths: 12,
          paymentType: 'Paid',
          paymentMethod: 'Cash',
        },
        ADMIN
      );
    } catch {
      serialMismatchRejected = true;
    }
    assert(serialMismatchRejected, 'Mismatched serial count must be rejected');

    const sepRes = await registerFixedAsset(
      {
        name: 'QA Welding Helmets',
        categoryTag: 'FA_TRAINING_EQUIPMENT',
        purchaseDate: '2097-04-16',
        unitCostPaisa: 100000,
        quantity: 3,
        separateUnits: true,
        serialNumbers: ['WH-01', 'WH-02', 'WH-03'],
        usefulLifeMonths: 10,
        paymentType: 'Paid',
        paymentMethod: 'Bank',
      },
      ADMIN
    );
    for (const u of sepRes.assets) createdAssetIds.push(String(u._id));
    createdEntryIds.push(String(sepRes.entry._id));
    assert(sepRes.assets.length === 3, 'Created 3 separate FixedAsset records');
    assert(sepRes.assets[0].assetCode.endsWith('-01'), 'First unit suffixed -01');
    assert(sepRes.assets[2].serialNumber === 'WH-03', 'Serial number mapped to unit 3');
    assert(sepRes.entry.totalDebitPaisa === 300000, 'Single voucher posted for total 3x1000');

    const revSep = await reverseAssetPurchase(String(sepRes.assets[0]._id), 'Reverse group', ADMIN);
    createdEntryIds.push(String(revSep.reversal._id));
    assert(revSep.reversedCount === 3, 'Group reversal deleted all 3 units');
    passed++;
    console.log('   PASS');

    // 10. Phase 2 — Opening Asset (3-line voucher, no cash, continues depreciation to salvage)
    console.log('10. Testing Phase 2: Opening Asset & Continued Depreciation...');
    const openAsset = await registerFixedAsset(
      {
        name: 'QA Pre-Owned Lathe',
        categoryTag: 'FA_TRAINING_EQUIPMENT',
        purchaseDate: '2097-05-01',
        depreciationStartDate: '2097-05-01',
        unitCostPaisa: 1000000, // 10,000 BDT
        quantity: 1,
        salvageValuePaisa: 100000, // 1,000 BDT
        usefulLifeMonths: 3, // 3,000 BDT/month
        paymentType: 'Opening',
        openingAccumulatedPaisa: 600000, // 6,000 BDT already depreciated -> 3,000 remaining
      },
      ADMIN
    );
    createdAssetIds.push(String(openAsset.asset._id));
    createdEntryIds.push(String(openAsset.entry._id));
    assert(
      openAsset.entry.idempotencyKey === `ASSET_OPENING:${String(openAsset.asset._id)}`,
      'Opening asset uses ASSET_OPENING:<id> idempotencyKey'
    );
    const openEqId = await getSystemAccountId('OPENING_EQUITY');
    const openEqLines = await JournalLine.find({
      entryId: openAsset.entry._id,
      accountId: openEqId,
    }).lean();
    assert(
      openEqLines.length === 1 && openEqLines[0].creditPaisa === 400000,
      'Opening Equity credited for (cost - accum = 4,000 BDT)'
    );

    const mayPeriod = periods[4];
    const depMay = await runMonthlyDepreciation(String(mayPeriod._id), ADMIN);
    createdDepRunIds.push(String(depMay.run._id));
    createdEntryIds.push(String(depMay.entry._id));
    const latheAfterMay = await FixedAsset.findById(openAsset.asset._id).lean();
    assert(
      latheAfterMay?.accumulatedDepreciationPaisa === 900000,
      'Opening asset continued depreciation from 6,000 to 9,000 (salvage stop)'
    );
    passed++;
    console.log('   PASS');

    // 11. Balance Sheet balances (Assets = Liabilities + Equity) and Trial Balance remains balanced
    console.log('11. Testing Balance Sheet & Global Trial Balance...');
    const bs = await getBalanceSheetReport('2097-12-31');
    assert(
      bs.isBalanced && bs.totalAssetsPaisa === bs.liabilitiesPlusEquityPaisa,
      `Balance sheet must balance (diff=${bs.differencePaisa})`
    );

    const tbAgg = await JournalLine.aggregate<{ debit: number; credit: number }>([
      {
        $lookup: {
          from: 'journalentries',
          localField: 'entryId',
          foreignField: '_id',
          as: 'entry',
        },
      },
      { $unwind: '$entry' },
      { $match: { 'entry.status': 'Posted', 'entry.isDeleted': false } },
      {
        $group: {
          _id: null,
          debit: { $sum: '$debitPaisa' },
          credit: { $sum: '$creditPaisa' },
        },
      },
    ]);
    const tbDebit = tbAgg[0]?.debit || 0;
    const tbCredit = tbAgg[0]?.credit || 0;
    assert(tbDebit === tbCredit, `Global Trial Balance must match: Dr=${tbDebit}, Cr=${tbCredit}`);
    passed++;
    console.log('   PASS');

    console.log(`\nALL ${passed}/11 QA CHECKS PASSED!`);
  } finally {
    // Cleanup isolated FY2097 test records so live DB stays clean
    await Promise.all([
      FixedAsset.deleteMany({ _id: { $in: createdAssetIds } }),
      DepreciationRun.deleteMany({ _id: { $in: createdDepRunIds } }),
      ExpenseRecord.deleteMany({ _id: { $in: createdExpenseIds } }),
      VendorBillPayment.deleteMany({ _id: { $in: createdPaymentIds } }),
      VendorBill.deleteMany({ _id: { $in: createdBillIds } }),
      Loan.deleteMany({ _id: { $in: createdLoanIds } }),
      JournalLine.deleteMany({ entryId: { $in: createdEntryIds } }),
      JournalEntry.deleteMany({ _id: { $in: createdEntryIds } }),
      AccountingPeriod.deleteMany({ fiscalYearId: fiscalYear._id }),
      FiscalYear.deleteOne({ _id: fiscalYear._id }),
    ]);
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

