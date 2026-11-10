import { connectDB } from './db';
import { User } from '@/models/User';
import { Trade } from '@/models/Trade';
import { CountryCost } from '@/models/CountryCost';
import { Batch } from '@/models/Batch';
import { hashPassword } from './jwt';

export const DEFAULT_DOCUMENT_CHECKLIST = [
  { document_type: 'NID / Birth certificate', needs_expiry: false },
  { document_type: 'Passport copy', needs_expiry: true },
  { document_type: 'Education certificate', needs_expiry: false },
  { document_type: 'Photos', needs_expiry: false },
  { document_type: 'Medical report', needs_expiry: true },
  { document_type: 'Police clearance', needs_expiry: true },
  { document_type: 'Visa copy', needs_expiry: true },
];

export async function seedDatabase() {
  await connectDB();

  // Read admin credentials from .env if provided
  const envAdminId = (process.env.ADMIN_ID || 'admin@gmail.com').trim().toLowerCase();
  const envAdminPassword = (process.env.ADMIN_PASSWORD || 'admin123').trim();
  const adminPassHash = await hashPassword(envAdminPassword);

  // 1. Seed or Update Admin Account for envAdminId
  let adminUser = await User.findOne({ username: envAdminId });
  if (!adminUser) {
    await User.create({
      name: 'System Administrator',
      username: envAdminId,
      passwordHash: adminPassHash,
      role: 'Admin',
      active: true,
      mustChangePassword: false,
    });
  } else {
    adminUser.passwordHash = adminPassHash;
    adminUser.role = 'Admin';
    adminUser.active = true;
    adminUser.mustChangePassword = false;
    await adminUser.save();
  }

  // 2. Also ensure 'admin' exists if envAdminId !== 'admin'
  if (envAdminId !== 'admin') {
    let alias = await User.findOne({ username: 'admin' });
    if (!alias) {
      await User.create({
        name: 'System Administrator',
        username: 'admin',
        passwordHash: adminPassHash,
        role: 'Admin',
        active: true,
        mustChangePassword: false,
      });
    } else {
      alias.passwordHash = adminPassHash;
      alias.role = 'Admin';
      alias.active = true;
      alias.mustChangePassword = false;
      await alias.save();
    }
  }

  // 3. Seed Counselor if not exists
  const counselorExists = await User.findOne({ username: 'counselor' });
  if (!counselorExists) {
    const counselorHash = await hashPassword('Counselor12345');
    await User.create({
      name: 'Rahim Counselor',
      username: 'counselor',
      passwordHash: counselorHash,
      role: 'Counselor',
      active: true,
      mustChangePassword: false,
    });
  }

  // 4. Seed Accountant if not exists
  const accountantExists = await User.findOne({ username: 'accountant' });
  if (!accountantExists) {
    const accountantHash = await hashPassword('Accountant12345');
    await User.create({
      name: 'Nasir Accountant',
      username: 'accountant',
      passwordHash: accountantHash,
      role: 'Accountant',
      active: true,
      mustChangePassword: false,
    });
  }

  // 5. Seed Viewer if not exists
  const viewerExists = await User.findOne({ username: 'viewer' });
  if (!viewerExists) {
    const viewerHash = await hashPassword('Viewer123456');
    await User.create({
      name: 'Karim Viewer',
      username: 'viewer',
      passwordHash: viewerHash,
      role: 'Viewer',
      active: true,
      mustChangePassword: false,
    });
  }

  // 6. Seed Trades if empty
  const tradesCount = await Trade.countDocuments();
  if (tradesCount === 0) {
    console.log('Seeding initial trades and country costs...');
    const tradesData = [
      {
        name: 'Pipe Welder (6G SMAW/GTAW)',
        course_days: 60,
        admission_fee: 10000,
        course_fee: 35000,
        active: true,
      },
      {
        name: 'Structural Welder (4G/3G)',
        course_days: 45,
        admission_fee: 8000,
        course_fee: 28000,
        active: true,
      },
      {
        name: 'Industrial Electrician',
        course_days: 45,
        admission_fee: 7000,
        course_fee: 25000,
        active: true,
      },
      {
        name: 'Shuttering Carpenter & Steel Fixer',
        course_days: 30,
        admission_fee: 5000,
        course_fee: 18000,
        active: true,
      },
      {
        name: 'Heavy Equipment & Forklift Operator',
        course_days: 30,
        admission_fee: 12000,
        course_fee: 40000,
        active: true,
      },
    ];

    const insertedTrades = await Trade.insertMany(tradesData);

    // 7. Seed Country Costs for these trades
    const countryCosts = [];
    for (const trade of insertedTrades) {
      if (trade.name.includes('Welder')) {
        countryCosts.push(
          {
            country: 'Saudi Arabia',
            trade_id: trade._id,
            visa_days: 30,
            visa_cost: 140000,
            govt_fee: 15000,
            contract_years: 2,
            total: 155000,
          },
          {
            country: 'Singapore',
            trade_id: trade._id,
            visa_days: 45,
            visa_cost: 210000,
            govt_fee: 25000,
            contract_years: 2,
            total: 235000,
          },
          {
            country: 'Qatar',
            trade_id: trade._id,
            visa_days: 25,
            visa_cost: 130000,
            govt_fee: 15000,
            contract_years: 2,
            total: 145000,
          }
        );
      } else {
        countryCosts.push(
          {
            country: 'Saudi Arabia',
            trade_id: trade._id,
            visa_days: 30,
            visa_cost: 135000,
            govt_fee: 15000,
            contract_years: 2,
            total: 150000,
          },
          {
            country: 'UAE - Dubai',
            trade_id: trade._id,
            visa_days: 20,
            visa_cost: 125000,
            govt_fee: 12000,
            contract_years: 2,
            total: 137000,
          },
          {
            country: 'Malaysia',
            trade_id: trade._id,
            visa_days: 40,
            visa_cost: 155000,
            govt_fee: 18000,
            contract_years: 3,
            total: 173000,
          }
        );
      }
    }

    await CountryCost.insertMany(countryCosts);
  }

  // 5. Seed Initial Batches if none exist
  const batchCount = await Batch.countDocuments();
  if (batchCount === 0) {
    const existingTrades = await Trade.find({ active: true });
    const now = new Date();
    const batches = [];

    for (let i = 0; i < existingTrades.length; i++) {
      const tr = existingTrades[i];
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(start.getTime() + (tr.course_days || 45) * 24 * 60 * 60 * 1000);
      const exam = new Date(end.getTime() - 2 * 24 * 60 * 60 * 1000);

      const prefix = tr.name.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
      const code = `${prefix}-${now.getFullYear()}-01`;

      batches.push({
        name: `${tr.name} - Regular Batch 01`,
        batch_code: code,
        trade_id: tr._id,
        trade_name: tr.name,
        start_date: start,
        end_date: end,
        exam_date: exam,
        instructor: 'Senior Technical Trainer',
        capacity: 30,
        status: 'In Training',
        notes: `Vocational skills and workshop training for ${tr.name}.`,
        created_by: 'System Seed',
      });
    }

    if (batches.length > 0) {
      await Batch.insertMany(batches);
    }
  }
}
