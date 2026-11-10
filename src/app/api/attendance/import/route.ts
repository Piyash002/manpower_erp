import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Employee } from '@/models/Employee';
import { PunchType } from '@/models/AttendanceLog';
import { DailyAttendance } from '@/models/DailyAttendance';
import { DeviceSyncLog } from '@/models/DeviceSyncLog';
import {
  buildManualPunchPairTimestamps,
  getDhakaDateString,
  ingestRawPunches,
  normalizeDhakaDate,
  normalizePunchType,
  RawPunchIngestItem,
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
    const empById = new Map<
      string,
      { _id: mongoose.Types.ObjectId; firstName: string; lastName: string }
    >();
    for (const e of employees) {
      empById.set(e.employee_id.toUpperCase(), e);
      if (e.biometric_id) empById.set(e.biometric_id.toUpperCase(), e);
    }

    const isDat =
      body.fileType === 'dat' || (lines[0].includes('\t') && !lines[0].includes(','));

    const firstCols = lines[0]
      .split(isDat ? '\t' : ',')
      .map((c) => c.trim().toLowerCase().replace(/["']/g, ''));
    const hasHeader = firstCols.some((c) =>
      ['employee_id', 'biometric_id', 'pin', 'timestamp', 'datetime', 'date', 'punch_type'].includes(c)
    );
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
        const punchType = normalizePunchType(cols[3] ?? cols[2] ?? '0');
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

        const { inTs, outTs } = buildManualPunchPairTimestamps(dateStr, inTime, outTime);
        const punches: Array<{ timestamp: Date; punchType: PunchType }> = [];
        if (inTs) punches.push({ timestamp: inTs, punchType: 'IN' });
        if (outTs) punches.push({ timestamp: outTs, punchType: 'OUT' });

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

      const punchType = normalizePunchType(cols[2] ?? 'IN');
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

    // Confirm & Persist via shared duplicate-safe ingestRawPunches helper
    const ingestItems: RawPunchIngestItem[] = [];
    for (const r of parsedRows) {
      for (const p of r.punches) {
        ingestItems.push({
          code: r.code,
          timestamp: p.timestamp,
          punchType: p.punchType,
          source: isDat ? 'Biometric' : 'Import',
          reason: isDat ? 'ZKTeco .dat import' : 'Bulk CSV import',
          recordedBy: auth.user.name,
          rawLine: r.raw,
        });
      }
    }

    const ingestResult = await ingestRawPunches(ingestItems);
    const errorMsgs = [
      ...errors.map((e) => `Row ${e.row}: ${e.message}`),
      ...ingestResult.errors,
    ];
    const totalSaved = ingestResult.matchedCount + ingestResult.unmatchedCount;

    await DeviceSyncLog.create({
      device_name: isDat ? 'ZKTeco .dat Upload' : 'CSV Bulk Upload',
      sync_type: isDat ? 'dat' : 'csv',
      records_fetched: dataLines.length,
      records_matched: ingestResult.matchedCount,
      unmatched_count: ingestResult.unmatchedCount,
      errors: errorMsgs.slice(0, 50),
      status:
        errorMsgs.length > 0 && totalSaved === 0
          ? 'Failed'
          : errorMsgs.length > 0
          ? 'Partial'
          : 'Success',
      triggered_by: auth.user.name,
    });

    await createAuditLog({
      user: auth.user,
      action: 'ATTENDANCE_BULK_IMPORT',
      entity: 'AttendanceLog',
      newValues: {
        importedLogs: totalSaved,
        unmatchedLogs: ingestResult.unmatchedCount,
        skippedDuplicates: ingestResult.skippedDuplicates,
        recomputedDays: ingestResult.recomputedDays,
        errorCount: errorMsgs.length,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Imported ${totalSaved} punch log(s) (${ingestResult.unmatchedCount} unmatched${
        ingestResult.skippedDuplicates ? `, skipped ${ingestResult.skippedDuplicates} duplicate(s)` : ''
      }), updated ${ingestResult.recomputedDays} daily summary record(s).`,
      data: {
        importedLogs: totalSaved,
        unmatchedLogs: ingestResult.unmatchedCount,
        skippedDuplicates: ingestResult.skippedDuplicates,
        recomputedDays: ingestResult.recomputedDays,
        errors: errorMsgs,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Import failed';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
