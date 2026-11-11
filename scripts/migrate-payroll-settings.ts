import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        const val = (match[2] || '').trim().replace(/^['"](.*)['"]$/, '$1');
        process.env[key] = val;
      }
    });
  }
} catch {
  // ignore
}

import { connectDB } from '../src/lib/db';
import {
  DEFAULT_PAYROLL_SETTINGS_VALUES,
  PayrollSettings,
} from '../src/models/PayrollSettings';
import { PayslipBatch } from '../src/models/PayslipBatch';
import { Payslip } from '../src/models/Payslip';

async function migrateSettings() {
  console.log('Running Payroll Settings versioning migration...');
  await connectDB();

  let v1 = await PayrollSettings.findOne({ version: 1 });
  if (!v1) {
    v1 = await PayrollSettings.create({
      ...DEFAULT_PAYROLL_SETTINGS_VALUES,
      notes: 'Auto-seeded default payroll rules (Version 1)',
      updated_by: 'System Migration',
    });
    console.log('Created default PayrollSettings v1.');
  } else {
    console.log('PayrollSettings v1 already exists.');
  }

  // Migrate legacy '30' days_basis -> 'fixed_30' and backfill settings_version safely
  const batchRes = await PayslipBatch.updateMany(
    { settings_version: { $exists: false } },
    {
      $set: {
        settings_version_id: v1._id,
        settings_version: v1.version,
        settings_snapshot: v1.toObject(),
      },
    }
  );
  await PayslipBatch.updateMany({ days_basis: '30' }, { $set: { days_basis: 'fixed_30' } });

  const slipRes = await Payslip.updateMany(
    { settings_version: { $exists: false } },
    {
      $set: {
        settings_version: v1.version,
        settings_snapshot: v1.toObject(),
      },
    }
  );
  await Payslip.updateMany({ days_basis: '30' }, { $set: { days_basis: 'fixed_30' } });

  await Promise.all([
    PayrollSettings.syncIndexes(),
    PayslipBatch.syncIndexes(),
    Payslip.syncIndexes(),
  ]);

  console.log(
    `Migration complete. Batches tagged: ${batchRes.modifiedCount}, Payslips tagged: ${slipRes.modifiedCount}`
  );
  await mongoose.disconnect();
}

migrateSettings().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

