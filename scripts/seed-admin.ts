import { connectDB } from '../src/lib/db';
import { seedDatabase } from '../src/lib/seed';
import fs from 'fs';
import path from 'path';

// Load .env manually if running standalone script
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || '';
        val = val.trim().replace(/^['"](.*)['"]$/, '$1');
        process.env[key] = val;
      }
    });
  }
} catch (e) {
  console.log('Using process.env');
}

async function runSeedAdmin() {
  console.log('====================================================');
  console.log('MANPOWER ERP - ADMIN SEED & SETUP ROUTINE');
  console.log('====================================================\n');

  console.log('Connecting to database from .env...');
  await connectDB();
  console.log('Connected to MongoDB successfully.');

  const adminId = (process.env.ADMIN_ID || 'admin@gmail.com').trim().toLowerCase();
  const adminPassword = (process.env.ADMIN_PASSWORD || 'admin123').trim();

  console.log(`Setting up Admin account:`);
  console.log(`  Username/Email: ${adminId}`);
  console.log(`  Password:       ${adminPassword}\n`);

  await seedDatabase();

  console.log('\n====================================================');
  console.log('✅ ADMIN ACCOUNT SEEDED AND READY TO USE!');
  console.log('Login credentials:');
  console.log(`  URL:      http://localhost:3000/login`);
  console.log(`  Username: ${adminId} (or "admin")`);
  console.log(`  Password: ${adminPassword}`);
  console.log('====================================================\n');

  process.exit(0);
}

runSeedAdmin().catch((err) => {
  console.error('Error seeding admin account:', err);
  process.exit(1);
});
