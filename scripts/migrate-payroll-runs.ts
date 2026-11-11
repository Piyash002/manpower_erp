import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

// Load .env before importing DB-connected modules
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
import { Employee } from '../src/models/Employee';
import { PayslipBatch } from '../src/models/PayslipBatch';
import { Payslip } from '../src/models/Payslip';
import { PayrollInput } from '../src/models/PayrollInput';

async function migrate() {
  console.log('Connecting to MongoDB for Payroll Runs safe migration...');
  await connectDB();

  const empRes = await Employee.updateMany(
    { $or: [{ branch: { $exists: false } }, { branch: '' }, { branch: null }] },
    { $set: { branch: 'Main' } }
  );
  console.log(`Employees backfilled with branch='Main': ${empRes.modifiedCount}`);

  const batchRes = await PayslipBatch.updateMany(
    { $or: [{ branch: { $exists: false } }, { is_reversal: { $exists: false } }] },
    [
      {
        $set: {
          branch: { $ifNull: ['$branch', 'Main'] },
          days_basis: { $ifNull: ['$days_basis', 'calendar'] },
          overtime_multiplier: { $ifNull: ['$overtime_multiplier', 2] },
          include_no_attendance: { $ifNull: ['$include_no_attendance', false] },
          skipped_count: { $ifNull: ['$skipped_count', 0] },
          skipped_employees: { $ifNull: ['$skipped_employees', []] },
          warnings: { $ifNull: ['$warnings', []] },
          is_reversal: { $ifNull: ['$is_reversal', false] },
        },
      },
    ],
    { updatePipeline: true }
  );
  console.log(`PayslipBatch (PayrollRun) records migrated: ${batchRes.modifiedCount}`);

  const slipRes = await Payslip.updateMany(
    { $or: [{ branch: { $exists: false } }, { is_reversal: { $exists: false } }] },
    [
      {
        $set: {
          branch: { $ifNull: ['$branch', 'Main'] },
          days_basis: { $ifNull: ['$days_basis', 'calendar'] },
          days_in_month: { $ifNull: ['$days_in_month', 30] },
          prorated_days: { $ifNull: ['$prorated_days', 30] },
          per_day_rate: { $ifNull: ['$per_day_rate', 0] },
          overtime_multiplier: { $ifNull: ['$overtime_multiplier', 2] },
          is_reversal: { $ifNull: ['$is_reversal', false] },
        },
      },
    ],
    { updatePipeline: true }
  );
  console.log(`Payslip records migrated: ${slipRes.modifiedCount}`);

  const inpRes = await PayrollInput.updateMany(
    { bonus_type: { $exists: false } },
    [
      {
        $set: {
          bonus_type: 'festival',
          bonus_festival: { $ifNull: ['$bonus', 0] },
          bonus_performance: 0,
          bonus_other: 0,
          advance_deduction: { $ifNull: ['$loan_installment', 0] },
          fine: { $ifNull: ['$manual_deduction', 0] },
          other_adjustment: 0,
        },
      },
    ],
    { updatePipeline: true }
  );
  console.log(`PayrollInput records migrated: ${inpRes.modifiedCount}`);

  // Sync indexes safely (ensures partial unique index on PayslipBatch month/year/branch)
  await Promise.all([
    Employee.syncIndexes(),
    PayslipBatch.syncIndexes(),
    Payslip.syncIndexes(),
    PayrollInput.syncIndexes(),
  ]);
  console.log('Indexes synced successfully.');

  await mongoose.disconnect();
  console.log('Migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

