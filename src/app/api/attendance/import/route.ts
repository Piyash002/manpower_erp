import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Employee } from '@/models/Employee';
import { AttendanceLog, PunchType } from '@/models/AttendanceLog';
import { DailyAttendance } from '@/models/DailyAttendance';
import { DeviceSyncLog } from '@/models/DeviceSyncLog';
import {
  getDhakaDateString,
  normalizeDhakaDate,
  parseDhakaTimeOnDate,
  recomputeDailyAttendance,
} from '@/lib/attendance-engine';

interface ImportBody {
  action?: 'preview' | 'confirm';
  fileType?: 'csv' | 'dat';
  csvText: string;
}

interface ParsedRowPreview {
  row: number;
  raw: string;
  empObjectId: string | null;
  code: string;
  employeeName: string;
  dateStr: string;
  punches: Array<{ timestamp: Date; punchType: PunchType }>;
  existingStatus: string | null;
  matched: boolean;
  error?: string;
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as ImportBody;
    const action = body.action || 'confirm';
    const rawText = body.csvText || '';

    if (!rawText.trim()) {
      return NextResponse.json({ success: false, message: 'File content is empty.' }, { status: 400 });
    }

    await connectDB();

    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return NextResponse.json({ success: false, message: 'No rows found.' }, { status: 400 });
    }

    const employees = await Employee.find({})
      .select('_id employee_id biometric_id firstName lastName')
      .lean();
    const empById = new Map<string, any>();
    for (const e of employees) {
      empById.set(e.employee_id.toUpperCase(), e);
      if (e.biometric_id) empById.set(e.biometric_id.toUpperCase(), e);
    }

    const isDat =
      body.fileType === 'dat' || (lines[0].includes('\t') && !lines[0].includes(','));

    const firstCols = lines[0]
      .split(isDat ? '\t' : ',')
      .map((c) => c.trim().toLowerCase().replace(/["']/g, ''));
    const hasHeader =
      firstCols.includes('employee_id') ||
      firstCols.includes('biometric_id') ||
      firstCols.includes('timestamp') ||
      firstCols.includes('date');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const parsedRows: ParsedRowPreview[] = [];
    const errors: Array<{ row: number; raw: string; message: string }> = [];

    for (let idx = 0; idx < dataLines.length; idx++) {
      const rawLine = dataLines[idx];
      const rowNum = idx + (hasHeader ? 2 : 1);
      const cols = rawLine
        .split(isDat ? /\t+/ : ',')
        .map((c) => c.trim().replace(/^["']|["']$/g, ''));

      const code = (cols[0] || '').toUpperCase();
      if (!code) {
        errors.push({ row: rowNum, raw: rawLine, message: 'Missing employee_id / biometric_id' });
        continue;
      }

      const matchedEmp = empById.get(code) || null;

      // Format 1: ZKTeco .dat (PIN \t YYYY-MM-DD HH:MM:SS \t Status \t InOut)
      if (isDat) {
        const rawTs = cols[1];
        const tsStr =
          rawTs && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(rawTs)
            ? `${rawTs.replace(' ', 'T')}+06:00`
            : rawTs;
        const tsDate = new Date(tsStr);
        if (isNaN(tsDate.getTime())) {
          errors.push({ row: rowNum, raw: rawLine, message: `Invalid timestamp "${rawTs}"` });
          continue;
        }
        const inOutFlag = cols[3] ?? cols[2] ?? '0';
        const punchType: PunchType =
          String(inOutFlag) === '1' || String(inOutFlag).toUpperCase() === 'OUT' ? 'OUT' : 'IN';
        const dateStr = getDhakaDateString(tsDate);

        parsedRows.push({
          row: rowNum,
          raw: rawLine,
          empObjectId: matchedEmp ? matchedEmp._id.toString() : null,
          code,
          employeeName: matchedEmp
            ? `${matchedEmp.firstName} ${matchedEmp.lastName}`
            : `Unmapped (${code})`,
          dateStr,
          punches: [{ timestamp: tsDate, punchType }],
          existingStatus: null,
          matched: Boolean(matchedEmp),
        });
        continue;
      }

      // Format 2: CSV Bulk Attendance (employee_id, date, check_in, check_out)
      if (cols.length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(cols[1])) {
        if (!matchedEmp) {
          errors.push({
            row: rowNum,
            raw: rawLine,
            message: `Employee "${code}" not found`,
          });
          continue;
        }

        const dateStr = cols[1];
        const inTime = cols[2];
        const outTime = cols[3];
        const punches: Array<{ timestamp: Date; punchType: PunchType }> = [];

        if (inTime && !/^\d{1,2}:\d{2}$/.test(inTime)) {
          errors.push({
            row: rowNum,
            raw: rawLine,
            message: `Invalid check_in time "${inTime}" (expected HH:mm)`,
          });
          continue;
        }
        if (outTime && !/^\d{1,2}:\d{2}$/.test(outTime)) {
          errors.push({
            row: rowNum,
            raw: rawLine,
            message: `Invalid check_out time "${outTime}" (expected HH:mm)`,
          });
          continue;
        }

        if (inTime) punches.push({ timestamp: parseDhakaTimeOnDate(dateStr, inTime), punchType: 'IN' });
        if (outTime) punches.push({ timestamp: parseDhakaTimeOnDate(dateStr, outTime), punchType: 'OUT' });

        if (punches.length === 0) {
          errors.push({
            row: rowNum,
            raw: rawLine,
            message: 'At least check_in or check_out is required',
          });
          continue;
        }

        const { dateObj } = normalizeDhakaDate(dateStr);
        const existing = await DailyAttendance.findOne({
          employee_id: matchedEmp._id,
          date: dateObj,
        }).lean();

        parsedRows.push({
          row: rowNum,
          raw: rawLine,
          empObjectId: matchedEmp._id.toString(),
          code,
          employeeName: `${matchedEmp.firstName} ${matchedEmp.lastName}`,
          dateStr,
          punches,
          existingStatus: existing?.status || null,
          matched: true,
        });
        continue;
      }

      // Format 3: CSV Raw Punch (employee_id_or_bio_id, timestamp, punch_type)
      const rawTs = cols[1];
      const tsString =
        rawTs && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(rawTs)
          ? `${rawTs.replace(' ', 'T')}+06:00`
          : rawTs;
      const tsDate = new Date(tsString);
      if (isNaN(tsDate.getTime())) {
        errors.push({ row: rowNum, raw: rawLine, message: `Invalid timestamp "${rawTs}"` });
        continue;
      }

      const rawType = (cols[2] || 'IN').toUpperCase();
      const punchType: PunchType = rawType === 'OUT' ? 'OUT' : 'IN';
      const dateStr = getDhakaDateString(tsDate);

      parsedRows.push({
        row: rowNum,
        raw: rawLine,
        empObjectId: matchedEmp ? matchedEmp._id.toString() : null,
        code,
        employeeName: matchedEmp
          ? `${matchedEmp.firstName} ${matchedEmp.lastName}`
          : `Unmapped (${code})`,
        dateStr,
        punches: [{ timestamp: tsDate, punchType }],
        existingStatus: null,
        matched: Boolean(matchedEmp),
      });
    }

    if (action === 'preview') {
      return NextResponse.json({
        success: true,
        data: {
          totalRows: dataLines.length,
          validCount: parsedRows.length,
          errorCount: errors.length,
          unmatchedCount: parsedRows.filter((r) => !r.matched).length,
          errors,
          previewRows: parsedRows.slice(0, 100),
        },
      });
    }

    // Confirm & Persist
    let importedLogs = 0;
    let unmatchedLogs = 0;
    const impactedPairs = new Set<string>();
    const errorMsgs = errors.map((e) => `Row ${e.row}: ${e.message}`);

    for (const r of parsedRows) {
      const { dateObj } = normalizeDhakaDate(r.dateStr);
      for (const p of r.punches) {
        await AttendanceLog.create({
          employee_id: r.empObjectId,
          biometric_id: r.code,
          matched: r.matched,
          date: dateObj,
          timestamp: p.timestamp,
          punch_type: p.punchType,
          source: isDat ? 'Biometric' : 'Import',
          reason: isDat ? 'ZKTeco .dat import' : 'Bulk CSV import',
          recorded_by: auth.user.name,
          raw_line: r.raw,
        });
        importedLogs++;
        if (!r.matched) unmatchedLogs++;
      }
      if (r.matched && r.empObjectId) {
        impactedPairs.add(`${r.empObjectId}|${r.dateStr}`);
      }
    }

    let recomputedDays = 0;
    for (const pair of impactedPairs) {
      const [empObjId, dateStr] = pair.split('|');
      try {
        await recomputeDailyAttendance(empObjId, dateStr, {
          preferredSource: isDat ? 'Biometric' : 'Import',
        });
        recomputedDays++;
      } catch (e: any) {
        errorMsgs.push(`${dateStr}: ${e.message}`);
      }
    }

    await DeviceSyncLog.create({
      device_name: isDat ? 'ZKTeco .dat Upload' : 'CSV Bulk Upload',
      sync_type: isDat ? 'dat' : 'csv',
      records_fetched: dataLines.length,
      records_matched: importedLogs - unmatchedLogs,
      unmatched_count: unmatchedLogs,
      errors: errorMsgs.slice(0, 50),
      status: errorMsgs.length > 0 && importedLogs === 0 ? 'Failed' : errorMsgs.length > 0 ? 'Partial' : 'Success',
      triggered_by: auth.user.name,
    });

    await createAuditLog({
      user: auth.user,
      action: 'ATTENDANCE_BULK_IMPORT',
      entity: 'AttendanceLog',
      newValues: { importedLogs, unmatchedLogs, recomputedDays, errorCount: errorMsgs.length },
    });

    return NextResponse.json({
      success: true,
      message: `Imported ${importedLogs} punch log(s) (${unmatchedLogs} unmatched), updated ${recomputedDays} daily summary record(s).`,
      data: { importedLogs, unmatchedLogs, recomputedDays, errors: errorMsgs },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Import failed' },
      { status: 500 }
    );
  }
}
