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
import { ensureAccountsSeeded } from '../src/lib/accounts-seed';
import { Account } from '../src/models/Account';
import { Journal } from '../src/models/Journal';
import { FiscalYear } from '../src/models/FiscalYear';
import { AccountingPeriod } from '../src/models/AccountingPeriod';

async function main() {
  await connectDB();
  await ensureAccountsSeeded();

  const [accCount, journalCount, fyCount, periodCount] = await Promise.all([
    Account.countDocuments({ isDeleted: { $ne: true } }),
    Journal.countDocuments({ active: true }),
    FiscalYear.countDocuments({ isDeleted: { $ne: true } }),
    AccountingPeriod.countDocuments({}),
  ]);

  console.log('====================================================');
  console.log('DREAMS ERP - ACCOUNTS COA & CORE SEED COMPLETE');
  console.log('====================================================');
  console.log(`Accounts seeded:          ${accCount}`);
  console.log(`Journals seeded (JV/RV/PV/CV): ${journalCount}`);
  console.log(`Fiscal Years:             ${fyCount}`);
  console.log(`Accounting Periods:       ${periodCount}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});

