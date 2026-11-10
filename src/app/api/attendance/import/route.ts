import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Employee } from '@/models/Employee';
import { AttendanceLog, PunchType } from '@/models/AttendanceLog';
import {
  getDhakaDateString,
  normalizeDhakaDate,
  parseDhakaTimeOnDate,
  recomputeDailyAttendance,
} from '@/lib/attendance-engine';

interface ImportBody {
  csvText: string;
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as ImportBody;
    if (!body.csvText?.trim()) {
      return NextResponse.json({ success: false, message: 'CSV content is empty.' }, { status: 400 });
    }

    await connectDB();

    const lines = body.csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return NextResponse.json({ success: false, message: 'No rows found in CSV.' }, { status: 400 });
    }

    const employees = await Employee.find({}).select('_id employee_id').lean();
    const empByCode = new Map<string, string>();
    for (const e of employees) {
      empByCode.set(e.employee_id.toUpperCase(), e._id.toString());
    }

    // Detect header
    const firstCols = lines[0].split(',').map((c) => c.trim().toLowerCase().replace(/["']/g, ''));
    const hasHeader =
      firstCols.includes('employee_id') ||
      firstCols.includes('timestamp') ||
      firstCols.includes('date');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    let importedLogs = 0;
    const errors: string[] = [];
    const impactedPairs = new Set<string>(); // `${empObjectId}|${dateStr}`

    for (let idx = 0; idx < dataLines.length; idx++) {
      const cols = dataLines[idx].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
      const empCode = (cols[0] || '').toUpperCase();
      const empObjId = empByCode.get(empCode);
      if (!empObjId) {
        errors.push(`Row ${idx + 1}: Unknown employee_id "${empCode}"`);
        continue;
      }

      // Support Format A: employee_id, timestamp (ISO or YYYY-MM-DD HH:mm), punch_type (IN|OUT)
      // Support Format B: employee_id, date (YYYY-MM-DD), check_in (HH:mm), check_out (HH:mm)
      if (cols.length >= 4 && /^\d{4}-\d{2}-\d{2}$/.test(cols[1])) {
        const dateStr = cols[1];
        const { dateObj } = normalizeDhakaDate(dateStr);
        const inTime = cols[2];
        const outTime = cols[3];

        if (inTime) {
          await AttendanceLog.create({
            employee_id: empObjId,
            date: dateObj,
            timestamp: parseDhakaTimeOnDate(dateStr, inTime),
            punch_type: 'IN',
            source: 'csv',
            reason: 'Bulk biometric CSV import',
            recorded_by: auth.user.name,
          });
          importedLogs++;
        }
        if (outTime) {
          await AttendanceLog.create({
            employee_id: empObjId,
            date: dateObj,
            timestamp: parseDhakaTimeOnDate(dateStr, outTime),
            punch_type: 'OUT',
            source: 'csv',
            reason: 'Bulk biometric CSV import',
            recorded_by: auth.user.name,
          });
          importedLogs++;
        }
        impactedPairs.add(`${empObjId}|${dateStr}`);
      } else {
        const rawTs = cols[1];
        const rawType = (cols[2] || 'IN').toUpperCase();
        const punchType: PunchType = rawType === 'OUT' ? 'OUT' : 'IN';

        // Parse timestamp assuming Asia/Dhaka if no timezone suffix provided
        const tsString =
          rawTs && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(rawTs)
            ? `${rawTs.replace(' ', 'T')}+06:00`
            : rawTs;
        const tsDate = new Date(tsString);
        if (isNaN(tsDate.getTime())) {
          errors.push(`Row ${idx + 1}: Invalid timestamp "${rawTs}"`);
          continue;
        }

        const dateStr = getDhakaDateString(tsDate);
        const { dateObj } = normalizeDhakaDate(dateStr);

        await AttendanceLog.create({
          employee_id: empObjId,
          date: dateObj,
          timestamp: tsDate,
          punch_type: punchType,
          source: 'csv',
          reason: 'Bulk biometric CSV import',
          recorded_by: auth.user.name,
        });
        importedLogs++;
        impactedPairs.add(`${empObjId}|${dateStr}`);
      }
    }

    let recomputedDays = 0;
    for (const pair of impactedPairs) {
      const [empObjId, dateStr] = pair.split('|');
      try {
        await recomputeDailyAttendance(empObjId, dateStr);
        recomputedDays++;
      } catch (e: any) {
        errors.push(`${dateStr}: ${e.message}`);
      }
    }

    await createAuditLog({
      user: auth.user,
      action: 'ATTENDANCE_CSV_IMPORT',
      entity: 'AttendanceLog',
      newValues: { importedLogs, recomputedDays, errorCount: errors.length },
    });

    return NextResponse.json({
      success: true,
      message: `Imported ${importedLogs} punch log(s) and updated ${recomputedDays} daily summary record(s).`,
      data: { importedLogs, recomputedDays, errors },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'CSV import failed' },
      { status: 500 }
    );
  }
}

