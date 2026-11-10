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
  // Use existing process.env
}

import { connectDB } from '../src/lib/db';
import {
  buildManualPunchPairTimestamps,
  deduplicatePunches,
  extractFirstInLastOut,
  ingestRawPunches,
  normalizeAttendanceSource,
  normalizeDhakaDate,
  normalizePunchType,
  recomputeDailyAttendance,
  replaceManualPunchesForDate,
  resolveEmployeeSchedule,
} from '../src/lib/attendance-engine';
import { evaluatePayrollFormula, PayrollFormulaContext } from '../src/lib/payroll-engine';
import { formatTimeDhaka, toDhakaTimeInput } from '../src/lib/formatters';
import { Employee } from '../src/models/Employee';
import { WorkingSchedule } from '../src/models/WorkingSchedule';
import { Holiday } from '../src/models/Holiday';
import { AttendanceLog } from '../src/models/AttendanceLog';
import { DailyAttendance } from '../src/models/DailyAttendance';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`✅ PASS: ${name}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
    failCount++;
  }
}

async function runQA() {
  console.log('====================================================');
  console.log('DREAMS ERP - SENIOR QA VERIFICATION SUITE (PHASE 1)');
  console.log('====================================================\n');

  // ------------------------------------------------------------------
  // 1. PURE UNIT TESTS: SOURCE / PUNCH NORMALIZATION & DEBOUNCE
  // ------------------------------------------------------------------
  assert(normalizeAttendanceSource('hr') === 'Manual', 'Legacy hr maps to Manual');
  assert(normalizeAttendanceSource('biometric') === 'Biometric', 'Legacy biometric maps to Biometric');
  assert(normalizeAttendanceSource('csv') === 'Import', 'Legacy csv maps to Import');
  assert(normalizeAttendanceSource('web') === 'Self Check-in', 'Legacy web maps to Self Check-in');

  assert(normalizePunchType('IN') === 'IN', 'normalizePunchType IN');
  assert(normalizePunchType('0') === 'IN', 'normalizePunchType ZKTeco 0 -> IN');
  assert(normalizePunchType('1') === 'OUT', 'normalizePunchType ZKTeco 1 -> OUT');
  assert(normalizePunchType('checkout') === 'OUT', 'normalizePunchType checkout -> OUT');
  assert(normalizePunchType('OUT') === 'OUT', 'normalizePunchType OUT');

  // Duplicate punch debounce within 5 mins vs outside 5 mins
  const rawSamples = [
    { timestamp: '2026-11-10T03:00:00Z', punch_type: 'IN' as const, source: 'Biometric' },
    { timestamp: '2026-11-10T03:02:30Z', punch_type: 'IN' as const, source: 'Biometric' }, // 2.5m duplicate
    { timestamp: '2026-11-10T03:04:59Z', punch_type: 'IN' as const, source: 'Biometric' }, // 4m59s duplicate
    { timestamp: '2026-11-10T12:00:00Z', punch_type: 'OUT' as const, source: 'Biometric' },
    { timestamp: '2026-11-10T12:01:00Z', punch_type: 'OUT' as const, source: 'Biometric' }, // 1m duplicate OUT
    { timestamp: '2026-11-10T12:10:00Z', punch_type: 'OUT' as const, source: 'Biometric' }, // 10m later (>5m window)
  ];
  const deduped = deduplicatePunches(rawSamples, 5);
  assert(
    deduped.length === 3,
    'deduplicatePunches ignores same-type punches within 5m and keeps >5m punches',
    `Expected 3, got ${deduped.length}`
  );
  const { firstIn, lastOut } = extractFirstInLastOut(deduped);
  assert(
    firstIn?.toISOString() === '2026-11-10T03:00:00.000Z' &&
      lastOut?.toISOString() === '2026-11-10T12:10:00.000Z',
    'extractFirstInLastOut picks earliest IN and latest OUT cleanly'
  );

  // Night-shift manual timestamp crossover (22:00 -> 06:00 next morning = +8 hours)
  const nightPair = buildManualPunchPairTimestamps('2026-11-10', '22:00', '06:00');
  const nightHours =
    nightPair.inTs && nightPair.outTs
      ? (nightPair.outTs.getTime() - nightPair.inTs.getTime()) / (1000 * 60 * 60)
      : 0;
  assert(
    nightHours === 8 && toDhakaTimeInput(nightPair.inTs) === '22:00' && toDhakaTimeInput(nightPair.outTs) === '06:00',
    'buildManualPunchPairTimestamps shifts next-day 06:00 checkout to +8h in Dhaka TZ',
    `Got nightHours=${nightHours}`
  );
  assert(
    formatTimeDhaka('invalid-date') === '—',
    'formatTimeDhaka handles invalid inputs safely'
  );

  // Payroll formula evaluator sanity check
  const formulaCtx: PayrollFormulaContext = {
    BASIC: 30000,
    ALLOWANCES: 5000,
    GROSS: 35000,
    DEDUCTIONS: 0,
    NET: 0,
    PRESENT_DAYS: 22,
    ABSENT_DAYS: 1,
    LATE_DAYS: 0,
    HALF_DAYS: 0,
    PAID_LEAVE_DAYS: 0,
    UNPAID_LEAVE_DAYS: 0,
    BONUS: 2000,
    OVERTIME_HOURS: 4,
    OVERTIME_RATE: 250,
    LOAN_INSTALLMENT: 0,
    MANUAL_DEDUCTION: 0,
  };
  assert(
    evaluatePayrollFormula('OVERTIME_HOURS * OVERTIME_RATE + BONUS', formulaCtx) === 3000,
    'evaluatePayrollFormula computes OT + Bonus accurately'
  );

  // ------------------------------------------------------------------
  // 2. DB INTEGRATION QA TESTS (ISOLATED TEMP FIXTURES WITH CLEANUP)
  // ------------------------------------------------------------------
  await connectDB();

  const tag = `QA-${Date.now()}`;
  const createdIds: {
    empId?: mongoose.Types.ObjectId;
    nightEmpId?: mongoose.Types.ObjectId;
    noBio1Id?: mongoose.Types.ObjectId;
    noBio2Id?: mongoose.Types.ObjectId;
    schedId?: mongoose.Types.ObjectId;
    holidayId?: mongoose.Types.ObjectId;
  } = {};

  try {
    // Seed temporary Night Shift schedule (global, empty dept, shift='Night')
    const nightSched = await WorkingSchedule.create({
      name: `${tag} Night Shift`,
      code: `${tag}-NIGHT`,
      department: '',
      shift: 'Night',
      working_days: [0, 1, 2, 3, 4],
      start_time: '22:00',
      end_time: '06:00',
      grace_minutes: 10,
      standard_hours: 8,
      half_day_hours: 4,
      overtime_after_hours: 8,
      overtime_multiplier: 1.5,
      duplicate_punch_window_minutes: 5,
      is_night_shift: true,
      manual_priority_over_biometric: true,
      is_default: false,
      active: true,
    });
    createdIds.schedId = nightSched._id as mongoose.Types.ObjectId;

    const testEmp = await Employee.create({
      employee_id: `${tag}-E1`,
      biometric_id: `${tag}-PIN1`,
      shift: 'Regular',
      firstName: 'QA',
      lastName: 'DayWorker',
      phone: '01700000001',
      department: 'Visa',
      designation: 'QA Officer',
      basic_salary: 20000,
      status: 'Active',
    });
    createdIds.empId = testEmp._id as mongoose.Types.ObjectId;

    const nightEmp = await Employee.create({
      employee_id: `${tag}-E2`,
      biometric_id: `${tag}-PIN2`,
      shift: 'Night',
      firstName: 'QA',
      lastName: 'NightWorker',
      phone: '01700000002',
      department: 'Visa',
      designation: 'Night Guard',
      basic_salary: 18000,
      status: 'Active',
    });
    createdIds.nightEmpId = nightEmp._id as mongoose.Types.ObjectId;

    // Regression check: creating two employees WITHOUT biometric_id must succeed under partial unique index
    const noBio1 = await Employee.create({
      employee_id: `${tag}-NB1`,
      firstName: 'NoBio',
      lastName: 'One',
      phone: '01700000003',
      department: 'Counseling',
      designation: 'Counselor',
      basic_salary: 15000,
    });
    createdIds.noBio1Id = noBio1._id as mongoose.Types.ObjectId;

    const noBio2 = await Employee.create({
      employee_id: `${tag}-NB2`,
      firstName: 'NoBio',
      lastName: 'Two',
      phone: '01700000004',
      department: 'Accounts',
      designation: 'Accountant',
      basic_salary: 15000,
    });
    createdIds.noBio2Id = noBio2._id as mongoose.Types.ObjectId;
    assert(
      Boolean(noBio1._id && noBio2._id),
      'Multiple employees without biometric_id can be created cleanly (no E11000 null dup error)'
    );

    // Verify shift resolution picks Night schedule even though department is 'Visa'
    const resolvedNight = await resolveEmployeeSchedule(nightEmp);
    assert(
      resolvedNight._id.toString() === nightSched._id.toString(),
      'resolveEmployeeSchedule prefers explicit global Night shift over generic fallback'
    );

    // Test idempotent biometric ingestion & duplicate guard (2099-01-05 = Monday)
    const testDate = '2099-01-05';
    const bioIn = new Date('2099-01-05T03:20:00.000Z'); // 09:20 Dhaka -> Late (>10m grace)
    const bioOut = new Date('2099-01-05T12:20:00.000Z'); // 18:20 Dhaka -> 9.0h worked
    const bioUnmapped = new Date('2099-01-05T03:05:00.000Z');

    const ingest1 = await ingestRawPunches([
      {
        code: `${tag}-PIN1`,
        timestamp: bioIn,
        punchType: 'IN',
        source: 'Biometric',
        recordedBy: 'QA',
      },
      {
        code: `${tag}-PIN1`,
        timestamp: bioOut,
        punchType: 'OUT',
        source: 'Biometric',
        recordedBy: 'QA',
      },
      {
        code: `${tag}-UNMAPPED`,
        timestamp: bioUnmapped,
        punchType: 'IN',
        source: 'Biometric',
        recordedBy: 'QA',
      },
    ]);
    assert(
      ingest1.matchedCount === 2 && ingest1.unmatchedCount === 1 && ingest1.skippedDuplicates === 0,
      'ingestRawPunches stores 2 matched and 1 unmatched punch'
    );

    // Re-ingest exact same payload -> should skip all 3 duplicates!
    const ingestDup = await ingestRawPunches([
      {
        code: `${tag}-PIN1`,
        timestamp: bioIn,
        punchType: 'IN',
        source: 'Biometric',
        recordedBy: 'QA',
      },
      {
        code: `${tag}-UNMAPPED`,
        timestamp: bioUnmapped,
        punchType: 'IN',
        source: 'Biometric',
        recordedBy: 'QA',
      },
    ]);
    assert(
      ingestDup.skippedDuplicates === 2 && ingestDup.matchedCount === 0,
      'ingestRawPunches prevents duplicate AttendanceLog rows on replay'
    );

    const { dateObj } = normalizeDhakaDate(testDate);
    let daily = await DailyAttendance.findOne({ employee_id: testEmp._id, date: dateObj }).lean();
    assert(
      daily?.status === 'Late' && daily?.source === 'Biometric' && daily?.worked_hours === 9,
      'Biometric Late (20m late, 9h worked) computed accurately',
      `Got status=${daily?.status}, source=${daily?.source}, worked=${daily?.worked_hours}`
    );

    // Add Manual entry on same day (09:00–18:00) -> Manual priority + conflict flag + dual timestamps preserved
    await replaceManualPunchesForDate({
      employeeId: testEmp._id.toString(),
      dateStr: testDate,
      inTime: '09:00',
      outTime: '18:00',
      reason: 'QA manual override test',
      recordedBy: 'QA',
    });
    await recomputeDailyAttendance(testEmp._id.toString(), testDate, {
      preferredSource: 'Manual',
      notes: 'QA manual override test',
    });
    daily = await DailyAttendance.findOne({ employee_id: testEmp._id, date: dateObj }).lean();
    assert(
      daily?.status === 'Present' &&
        daily?.source === 'Manual' &&
        daily?.has_manual_biometric_conflict === true &&
        Boolean(daily?.manual_first_in) &&
        Boolean(daily?.biometric_first_in),
      'Dual-source Manual priority wins over Biometric while flagging conflict & keeping both times'
    );

    // Test forced Absent override even with stray biometric punch -> worked_hours must be 0 & source Manual!
    await replaceManualPunchesForDate({
      employeeId: testEmp._id.toString(),
      dateStr: testDate,
      clearExistingManual: true,
      reason: 'QA marked Absent despite stray punch',
      recordedBy: 'QA',
    });
    await recomputeDailyAttendance(testEmp._id.toString(), testDate, {
      explicitStatusOverride: 'Absent',
      preferredSource: 'Manual',
      notes: 'QA marked Absent',
    });
    daily = await DailyAttendance.findOne({ employee_id: testEmp._id, date: dateObj }).lean();
    assert(
      daily?.status === 'Absent' &&
        daily?.source === 'Manual' &&
        daily?.worked_hours === 0 &&
        Boolean(daily?.biometric_first_in),
      'Forced Absent override clears active hours & retains source=Manual + biometric audit time',
      `Got status=${daily?.status}, source=${daily?.source}, worked=${daily?.worked_hours}`
    );

    // Test Holiday Overtime (>8h worked on a Holiday must earn ALL worked hours as OT)
    const holDate = '2099-01-06'; // Tuesday
    const { dateObj: holDateObj } = normalizeDhakaDate(holDate);
    const hol = await Holiday.create({
      title: `${tag} National Test Holiday`,
      date: holDateObj,
      type: 'Company',
      active: true,
    });
    createdIds.holidayId = hol._id as mongoose.Types.ObjectId;

    await replaceManualPunchesForDate({
      employeeId: testEmp._id.toString(),
      dateStr: holDate,
      inTime: '08:00',
      outTime: '18:00', // 10 hours worked on Holiday
      reason: 'Holiday shift test',
      recordedBy: 'QA',
    });
    await recomputeDailyAttendance(testEmp._id.toString(), holDate, {
      preferredSource: 'Manual',
    });
    const holDaily = await DailyAttendance.findOne({
      employee_id: testEmp._id,
      date: holDateObj,
    }).lean();
    assert(
      holDaily?.worked_hours === 10 && holDaily?.overtime_hours === 10 && holDaily?.late_minutes === 0,
      'Holiday work >8h earns full 10h overtime (not 10-8=2h) and 0 late minutes',
      `Got worked=${holDaily?.worked_hours}, ot=${holDaily?.overtime_hours}, late=${holDaily?.late_minutes}`
    );

    // Test Night Shift DB recompute (22:00 on 2099-01-07 -> 06:00 on 2099-01-08)
    const nightDate = '2099-01-07';
    await replaceManualPunchesForDate({
      employeeId: nightEmp._id.toString(),
      dateStr: nightDate,
      inTime: '22:00',
      outTime: '06:00',
      reason: 'Night shift test',
      recordedBy: 'QA',
    });
    await recomputeDailyAttendance(nightEmp._id.toString(), nightDate, {
      preferredSource: 'Manual',
    });
    const { dateObj: nightDateObj } = normalizeDhakaDate(nightDate);
    const nightDaily = await DailyAttendance.findOne({
      employee_id: nightEmp._id,
      date: nightDateObj,
    }).lean();
    assert(
      nightDaily?.status === 'Present' && nightDaily?.worked_hours === 8,
      'Night shift cross-midnight manual attendance (22:00–06:00) computes Present & 8h worked',
      `Got status=${nightDaily?.status}, worked=${nightDaily?.worked_hours}`
    );
  } finally {
    // Strict cleanup of temporary QA test data
    const empIds = [
      createdIds.empId,
      createdIds.nightEmpId,
      createdIds.noBio1Id,
      createdIds.noBio2Id,
    ].filter((x): x is mongoose.Types.ObjectId => Boolean(x));
    if (empIds.length > 0) {
      await DailyAttendance.deleteMany({ employee_id: { $in: empIds } });
      await AttendanceLog.deleteMany({ employee_id: { $in: empIds } });
      await Employee.deleteMany({ _id: { $in: empIds } });
    }
    await AttendanceLog.deleteMany({ biometric_id: `${tag}-UNMAPPED` });
    if (createdIds.schedId) await WorkingSchedule.findByIdAndDelete(createdIds.schedId);
    if (createdIds.holidayId) await Holiday.findByIdAndDelete(createdIds.holidayId);
    await mongoose.disconnect();
  }

  console.log('\n====================================================');
  console.log(`QA SUMMARY: ${passCount} passed, ${failCount} failed`);
  console.log('====================================================');
  process.exit(failCount > 0 ? 1 : 0);
}

runQA().catch((err) => {
  console.error('QA suite crashed:', err);
  process.exit(1);
});

