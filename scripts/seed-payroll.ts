import fs from 'fs';
import path from 'path';
import { seedSamplePayrollData } from '../src/lib/payroll-seed';
import { SalaryStructure } from '../src/models/SalaryStructure';
import { SalaryRule } from '../src/models/SalaryRule';
import { EmployeeContract } from '../src/models/EmployeeContract';
import { PayrollInput } from '../src/models/PayrollInput';
import { Payslip } from '../src/models/Payslip';
import { PayslipBatch } from '../src/models/PayslipBatch';

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
  // Fallback to existing process.env
}

async function run() {
  console.log('Syncing Mongoose Payroll indexes & seeding default Salary Structure + Rules...');
  const result = await seedSamplePayrollData();

  await Promise.all([
    SalaryStructure.syncIndexes(),
    SalaryRule.syncIndexes(),
    EmployeeContract.syncIndexes(),
    PayrollInput.syncIndexes(),
    Payslip.syncIndexes(),
    PayslipBatch.syncIndexes(),
  ]);

  console.log('Payroll seed/migration finished:', result);
  process.exit(0);
}

run().catch((err) => {
  console.error('Payroll seed failed:', err);
  process.exit(1);
});
