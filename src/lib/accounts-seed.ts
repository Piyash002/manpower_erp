import { Account, AccountType, NormalBalance, getNormalBalanceForType } from '@/models/Account';
import { Journal, JournalTypeCode } from '@/models/Journal';
import { FiscalYear } from '@/models/FiscalYear';
import { AccountingPeriod } from '@/models/AccountingPeriod';
import { AccountsSettings } from '@/models/AccountsSettings';

export interface SeedAccountDef {
  code: string;
  name: string;
  type: AccountType;
  normalBalance?: NormalBalance;
  parentCode?: string;
  isGroup: boolean;
  systemTag?: string;
  description?: string;
}

export const DEFAULT_MANPOWER_COA: SeedAccountDef[] = [
  // 1000 Assets
  { code: '1000', name: 'Assets', type: 'Asset', isGroup: true, description: 'Root Assets group' },
  { code: '1100', name: 'Cash & Bank Accounts', type: 'Asset', parentCode: '1000', isGroup: true },
  { code: '1110', name: 'Cash in Hand', type: 'Asset', parentCode: '1100', isGroup: false, systemTag: 'CASH' },
  { code: '1120', name: 'Petty Cash', type: 'Asset', parentCode: '1100', isGroup: false, systemTag: 'PETTY_CASH' },
  { code: '1130', name: 'Main Bank Account', type: 'Asset', parentCode: '1100', isGroup: false, systemTag: 'BANK_MAIN' },
  { code: '1140', name: 'bKash Merchant Wallet', type: 'Asset', parentCode: '1100', isGroup: false, systemTag: 'BKASH' },
  { code: '1150', name: 'Nagad Merchant Wallet', type: 'Asset', parentCode: '1100', isGroup: false, systemTag: 'NAGAD' },
  { code: '1200', name: 'Receivables & Advances', type: 'Asset', parentCode: '1000', isGroup: true },
  { code: '1210', name: 'Student Fee Receivable', type: 'Asset', parentCode: '1200', isGroup: false, systemTag: 'STUDENT_RECEIVABLE' },
  { code: '1220', name: 'Staff Salary Advance', type: 'Asset', parentCode: '1200', isGroup: false, systemTag: 'STAFF_ADVANCE' },
  { code: '1230', name: 'Security Deposits & Prepayments', type: 'Asset', parentCode: '1200', isGroup: false, systemTag: 'PREPAYMENTS' },
  { code: '1300', name: 'Fixed Assets', type: 'Asset', parentCode: '1000', isGroup: true, description: 'Long-term tangible fixed assets' },
  { code: '1310', name: 'Training Equipment', type: 'Asset', parentCode: '1300', isGroup: false, systemTag: 'FA_TRAINING_EQUIPMENT' },
  { code: '1320', name: 'Furniture & Fixtures', type: 'Asset', parentCode: '1300', isGroup: false, systemTag: 'FA_FURNITURE' },
  { code: '1330', name: 'Computer & Electronics', type: 'Asset', parentCode: '1300', isGroup: false, systemTag: 'FA_COMPUTER' },
  { code: '1340', name: 'Lease/Building Improvements', type: 'Asset', parentCode: '1300', isGroup: false, systemTag: 'FA_LEASEHOLD' },
  { code: '1390', name: 'Accumulated Depreciation', type: 'Asset', normalBalance: 'Credit', parentCode: '1300', isGroup: false, systemTag: 'ACCUM_DEPRECIATION', description: 'Contra-asset account for accumulated depreciation' },

  // 2000 Liabilities
  { code: '2000', name: 'Liabilities', type: 'Liability', isGroup: true, description: 'Root Liabilities group' },
  { code: '2100', name: 'Current Payables', type: 'Liability', parentCode: '2000', isGroup: true },
  { code: '2110', name: 'Salary Payable', type: 'Liability', parentCode: '2100', isGroup: false, systemTag: 'SALARY_PAYABLE' },
  { code: '2120', name: 'Agent Commission Payable', type: 'Liability', parentCode: '2100', isGroup: false, systemTag: 'AGENT_COMMISSION_PAYABLE' },
  { code: '2130', name: 'Vendor & Supplier Payable', type: 'Liability', parentCode: '2100', isGroup: false, systemTag: 'VENDOR_PAYABLE' },
  { code: '2140', name: 'Candidate Refund Payable', type: 'Liability', parentCode: '2100', isGroup: false, systemTag: 'REFUND_PAYABLE' },
  { code: '2200', name: 'Statutory & Deferred Liabilities', type: 'Liability', parentCode: '2000', isGroup: true },
  { code: '2210', name: 'TDS / Tax Payable', type: 'Liability', parentCode: '2200', isGroup: false, systemTag: 'TAX_PAYABLE' },
  { code: '2220', name: 'Unearned Candidate Advances', type: 'Liability', parentCode: '2200', isGroup: false, systemTag: 'UNEARNED_FEE' },
  { code: '2300', name: 'Loans & Borrowings', type: 'Liability', parentCode: '2000', isGroup: true, description: 'Bank and other borrowings' },
  { code: '2310', name: 'Bank Loan', type: 'Liability', parentCode: '2300', isGroup: false, systemTag: 'LOAN_BANK' },
  { code: '2320', name: 'Other Loans', type: 'Liability', parentCode: '2300', isGroup: false, systemTag: 'LOAN_OTHER' },

  // 3000 Equity
  { code: '3000', name: 'Equity', type: 'Equity', isGroup: true, description: 'Root Equity group' },
  { code: '3100', name: "Owner's Capital", type: 'Equity', parentCode: '3000', isGroup: false, systemTag: 'OWNER_CAPITAL' },
  { code: '3200', name: 'Retained Earnings', type: 'Equity', parentCode: '3000', isGroup: false, systemTag: 'RETAINED_EARNINGS' },
  { code: '3900', name: 'Opening Balance Equity', type: 'Equity', parentCode: '3000', isGroup: false, systemTag: 'OPENING_EQUITY' },

  // 4000 Income
  { code: '4000', name: 'Income', type: 'Income', isGroup: true, description: 'Root Revenue group' },
  { code: '4100', name: 'Training & Recruitment Revenue', type: 'Income', parentCode: '4000', isGroup: true },
  { code: '4110', name: 'Admission & Training Fee Income', type: 'Income', parentCode: '4100', isGroup: false, systemTag: 'FEE_INCOME' },
  { code: '4120', name: 'Visa & Processing Service Income', type: 'Income', parentCode: '4100', isGroup: false, systemTag: 'VISA_INCOME' },
  { code: '4130', name: 'Assessment & Trade Test Income', type: 'Income', parentCode: '4100', isGroup: false, systemTag: 'ASSESSMENT_INCOME' },
  { code: '4200', name: 'Other Income', type: 'Income', parentCode: '4000', isGroup: false, systemTag: 'OTHER_INCOME' },

  // 5000 Expenses
  { code: '5000', name: 'Expenses', type: 'Expense', isGroup: true, description: 'Root Expense group' },
  { code: '5100', name: 'Direct Processing & Candidate Costs', type: 'Expense', parentCode: '5000', isGroup: true },
  { code: '5110', name: 'Medical Center Expenses', type: 'Expense', parentCode: '5100', isGroup: false, systemTag: 'MEDICAL_EXPENSE' },
  { code: '5120', name: 'Embassy & Visa Processing Cost', type: 'Expense', parentCode: '5100', isGroup: false, systemTag: 'VISA_EXPENSE' },
  { code: '5130', name: 'Air Ticket Cost', type: 'Expense', parentCode: '5100', isGroup: false, systemTag: 'TICKET_EXPENSE' },
  { code: '5140', name: 'Agent Commission Expense', type: 'Expense', parentCode: '5100', isGroup: false, systemTag: 'COMMISSION_EXPENSE' },
  { code: '5200', name: 'Payroll & Operating Expenses', type: 'Expense', parentCode: '5000', isGroup: true },
  { code: '5210', name: 'Staff Salary & Allowances', type: 'Expense', parentCode: '5200', isGroup: false, systemTag: 'SALARY_EXPENSE' },
  { code: '5220', name: 'Office Rent & Utilities', type: 'Expense', parentCode: '5200', isGroup: false, systemTag: 'RENT_UTILITIES' },
  { code: '5230', name: 'Training Lab & Consumables', type: 'Expense', parentCode: '5200', isGroup: false, systemTag: 'TRAINING_EXPENSE' },
  { code: '5240', name: 'Marketing & Admin Expense', type: 'Expense', parentCode: '5200', isGroup: false, systemTag: 'ADMIN_EXPENSE' },
  { code: '5250', name: 'Electricity', type: 'Expense', parentCode: '5200', isGroup: false, systemTag: 'EXP_ELECTRICITY' },
  { code: '5255', name: 'Gas', type: 'Expense', parentCode: '5200', isGroup: false, systemTag: 'EXP_GAS' },
  { code: '5260', name: 'Office/House Rent', type: 'Expense', parentCode: '5200', isGroup: false, systemTag: 'EXP_RENT' },
  { code: '5265', name: 'Transport & Conveyance', type: 'Expense', parentCode: '5200', isGroup: false, systemTag: 'EXP_TRANSPORT' },
  { code: '5270', name: 'Internet & Phone', type: 'Expense', parentCode: '5200', isGroup: false, systemTag: 'EXP_INTERNET' },
  { code: '5275', name: 'Repairs & Maintenance', type: 'Expense', parentCode: '5200', isGroup: false, systemTag: 'EXP_REPAIRS' },
  { code: '5280', name: 'Stationery & Office Supplies', type: 'Expense', parentCode: '5200', isGroup: false, systemTag: 'EXP_STATIONERY' },
  { code: '5290', name: 'Depreciation Expense', type: 'Expense', parentCode: '5200', isGroup: false, systemTag: 'DEPRECIATION_EXPENSE' },
  { code: '5299', name: 'Miscellaneous Expense', type: 'Expense', parentCode: '5200', isGroup: false, systemTag: 'EXP_MISC' },
];

export const DEFAULT_JOURNALS: Array<{ code: JournalTypeCode; name: string; description: string }> = [
  { code: 'JV', name: 'Journal Voucher', description: 'General accruals, adjustments, payroll, opening balances' },
  { code: 'RV', name: 'Receipt Voucher', description: 'Candidate fee collections and incoming funds' },
  { code: 'PV', name: 'Payment Voucher', description: 'Salary payouts, vendor bills, agent commissions, expenses' },
  { code: 'CV', name: 'Contra Voucher', description: 'Bank-to-cash, wallet, and internal fund transfers' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export async function ensureFiscalYearWithPeriods(year: number, createdBy = 'System') {
  const code = `FY${year}`;
  let fy = await FiscalYear.findOne({ code, isDeleted: { $ne: true } });
  if (!fy) {
    fy = await FiscalYear.create({
      code,
      name: `Fiscal Year ${year}`,
      startDate: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
      endDate: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
      status: 'Open',
      createdBy,
    });
  }

  for (let m = 1; m <= 12; m++) {
    const startDate = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
    await AccountingPeriod.updateOne(
      { year, month: m },
      {
        $setOnInsert: {
          fiscalYearId: fy._id,
          month: m,
          year,
          name: `${MONTH_NAMES[m - 1]} ${year}`,
          startDate,
          endDate,
          status: 'Open',
        },
      },
      { upsert: true }
    );
  }

  return fy;
}

let seedPromise: Promise<void> | null = null;

export async function ensureAccountsSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      // 0. Drop legacy stale unique index reference_1 if present from older smoke data
      try {
        const { JournalEntry } = await import('@/models/JournalEntry');
        const indexes = await JournalEntry.collection.indexes();
        if (indexes.some((ix: any) => ix.name === 'reference_1')) {
          await JournalEntry.collection.dropIndex('reference_1');
        }
      } catch {
        // Ignore if collection does not exist yet
      }

      // 1. Seed COA in tree order (reuse existing code or systemTag)
      const idByCode = new Map<string, any>();
      const existingTags = new Set<string>();
      const existingAccounts = await Account.find({ isDeleted: { $ne: true } })
        .select('_id code systemTag')
        .lean();
      for (const acc of existingAccounts) {
        idByCode.set(acc.code, acc._id);
        if (acc.systemTag) existingTags.add(String(acc.systemTag).toUpperCase());
      }

      for (const item of DEFAULT_MANPOWER_COA) {
        if (idByCode.has(item.code)) continue;
        if (item.systemTag && existingTags.has(item.systemTag.toUpperCase())) continue;
        const parentId = item.parentCode ? idByCode.get(item.parentCode) || null : null;
        const created = await Account.create({
          code: item.code,
          name: item.name,
          type: item.type,
          normalBalance: item.normalBalance || getNormalBalanceForType(item.type),
          parentId,
          isGroup: item.isGroup,
          systemTag: item.systemTag || undefined,
          description: item.description || '',
          active: true,
          createdBy: 'System',
        });
        idByCode.set(created.code, created._id);
        if (created.systemTag) existingTags.add(String(created.systemTag).toUpperCase());
      }

      // 2. Seed Journals (JV, RV, PV, CV)
      for (const j of DEFAULT_JOURNALS) {
        await Journal.updateOne(
          { code: j.code },
          { $setOnInsert: { ...j, active: true } },
          { upsert: true }
        );
      }

      // 3. Seed current calendar Fiscal Year (2026) + 12 monthly AccountingPeriods
      const currentYear = new Date().getUTCFullYear();
      await ensureFiscalYearWithPeriods(currentYear);
      if (currentYear !== 2026) {
        await ensureFiscalYearWithPeriods(2026);
      }

      // 4. Seed AccountsSettings singleton
      const settingsCount = await AccountsSettings.countDocuments({});
      if (settingsCount === 0) {
        await AccountsSettings.create({
          allow_counselor_collection: false,
          default_branch: 'Main',
          updatedBy: 'System',
        });
      }
    })().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}
