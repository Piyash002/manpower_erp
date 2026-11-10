import fs from 'fs';
import path from 'path';
import { connectDB } from '../src/lib/db';
import { Attendance } from '../src/models/Attendance';
import { AttendanceLog } from '../src/models/AttendanceLog';
import { DailyAttendance, DailyAttendanceStatus } from '../src/models/DailyAttendance';
import { Employee } from '../src/models/Employee';
import { WorkingSchedule } from '../src/models/WorkingSchedule';
import { BiometricDevice } from '../src/models/BiometricDevice';
import { DeviceSyncLog } from '../src/models/DeviceSyncLog';
import { ensureAttendanceSeeded } from '../src/lib/attendance-seed';
import { getDhakaDateString, recomputeDailyAttendance } from '../src/lib/attendance-engine';

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
  // Ignore if env not present
}

function mapLegacyStatus(oldStatus: string): DailyAttendanceStatus {
  if (oldStatus === 'Half-Day') return 'Half-day';
  if (oldStatus === 'Present' || oldStatus === 'Late' || oldStatus === 'Absent') {
    return oldStatus;
  }
  return 'Present';
}

async function migrate() {
  console.log('====================================================');
  console.log('DREAMS ERP - SAFE ATTENDANCE DATA MIGRATION');
  console.log('====================================================');

  await connectDB();
  await ensureAttendanceSeeded();

  const legacyRows = await Attendance.find({}).sort({ date: 1 }).lean();
  console.log(`Found ${legacyRows.length} legacy Attendance record(s).`);

  let migratedCount = 0;
  let skippedCount = 0;
  let createdLogs = 0;

  for (const row of legacyRows) {
    const legacyId = row._id.toString();
    const dateStr = getDhakaDateString(new Date(row.date));

    const alreadyMigrated = await DailyAttendance.findOne({
      $or: [
        { legacy_attendance_id: legacyId },
        { employee_id: row.employee_id, date: row.date },
      ],
    }).lean();

    if (alreadyMigrated) {
      skippedCount++;
      continue;
    }

    if (row.check_in) {
      await AttendanceLog.create({
        employee_id: row.employee_id,
        date: row.date,
        timestamp: new Date(row.check_in),
        punch_type: 'IN',
        source: 'hr',
        reason: 'Migrated from legacy attendance',
        recorded_by: row.marked_by || 'Migration',
      });
      createdLogs++;
    }

    if (row.check_out) {
      await AttendanceLog.create({
        employee_id: row.employee_id,
        date: row.date,
        timestamp: new Date(row.check_out),
        punch_type: 'OUT',
        source: 'hr',
        reason: 'Migrated from legacy attendance',
        recorded_by: row.marked_by || 'Migration',
      });
      createdLogs++;
    }

    const mappedStatus = mapLegacyStatus(row.status);
    await recomputeDailyAttendance(row.employee_id.toString(), dateStr, {
      explicitStatusOverride: !row.check_in && !row.check_out ? mappedStatus : undefined,
      notes: row.notes || 'Migrated from legacy attendance',
      legacyAttendanceId: legacyId,
    });

    migratedCount++;
  }

  await Promise.all([
    Employee.syncIndexes(),
    WorkingSchedule.syncIndexes(),
    BiometricDevice.syncIndexes(),
    DeviceSyncLog.syncIndexes(),
    AttendanceLog.syncIndexes(),
    DailyAttendance.syncIndexes(),
  ]);

  const totalDailyCount = await DailyAttendance.countDocuments();
  console.log('Migration Summary:');
  console.log(`- Legacy Records Scanned: ${legacyRows.length}`);
  console.log(`- Migrated Now:           ${migratedCount}`);
  console.log(`- Already Migrated:       ${skippedCount}`);
  console.log(`- AttendanceLogs Created: ${createdLogs}`);
  console.log(`- Total DailyAttendance:  ${totalDailyCount}`);
  console.log('Synced indexes across Employee, WorkingSchedule, BiometricDevice, DeviceSyncLog, AttendanceLog, and DailyAttendance.');
  console.log('Legacy records remain safely intact until Phase 6 cutover.');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

