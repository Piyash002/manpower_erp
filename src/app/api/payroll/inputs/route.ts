import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { PayrollInput, BonusType } from '@/models/PayrollInput';
import { PayslipBatch } from '@/models/PayslipBatch';
import { Employee } from '@/models/Employee';
import {
  buildCsvString,
  buildXlsxBuffer,
  parseCsvText,
  parseXlsxBuffer,
} from '@/lib/export-utils';

interface UpsertInputBody {
  action?: 'save_row' | 'import_preview' | 'import_confirm';
  employee_id?: string;
  month: number;
  year: number;
  bonus?: number;
  bonus_type?: BonusType;
  bonus_festival?: number;
  bonus_performance?: number;
  bonus_other?: number;
  overtime_hours?: number;
  overtime_rate?: number;
  loan_installment?: number;
  advance_deduction?: number;
  fine?: number;
  other_adjustment?: number;
  manual_deduction?: number;
  notes?: string;
  csvText?: string;
  xlsxBase64?: string;
}

const VALID_BONUS_TYPES = new Set<BonusType>(['festival', 'performance', 'other']);

async function isMonthLockedByConfirmedRun(month: number, year: number) {
  const lockedRun = await PayslipBatch.findOne({
    month,
    year,
    is_reversal: { $ne: true },
    status: { $in: ['Confirmed', 'Paid'] },
  })
    .select('batch_code status branch')
    .lean();
  return lockedRun;
}

function buildNormalizedInputPayload(raw: {
  bonus_type?: any;
  bonus_festival?: any;
  bonus_performance?: any;
  bonus_other?: any;
  bonus?: any;
  overtime_hours?: any;
  overtime_rate?: any;
  advance_deduction?: any;
  loan_installment?: any;
  fine?: any;
  manual_deduction?: any;
  other_adjustment?: any;
  notes?: any;
}) {
  const bonusType: BonusType = VALID_BONUS_TYPES.has(String(raw.bonus_type).toLowerCase() as BonusType)
    ? (String(raw.bonus_type).toLowerCase() as BonusType)
    : 'festival';
  let bf = Math.max(0, Math.round(Number(raw.bonus_festival) || 0));
  let bp = Math.max(0, Math.round(Number(raw.bonus_performance) || 0));
  let bo = Math.max(0, Math.round(Number(raw.bonus_other) || 0));
  const legacyBonus = Math.max(0, Math.round(Number(raw.bonus) || 0));
  if (bf === 0 && bp === 0 && bo === 0 && legacyBonus > 0) {
    if (bonusType === 'performance') bp = legacyBonus;
    else if (bonusType === 'other') bo = legacyBonus;
    else bf = legacyBonus;
  }
  const totalBonus = bf + bp + bo;
  const advance = Math.max(0, Math.round(Number(raw.advance_deduction ?? raw.loan_installment) || 0));
  const fineVal = Math.max(0, Math.round(Number(raw.fine ?? raw.manual_deduction) || 0));
  const otHours = Math.max(0, Number(raw.overtime_hours) || 0);
  const otRate = Math.max(0, Math.round(Number(raw.overtime_rate) || 0));
  const otherAdj = Math.round(Number(raw.other_adjustment) || 0);

  return {
    bonus: totalBonus,
    bonus_type: bonusType,
    bonus_festival: bf,
    bonus_performance: bp,
    bonus_other: bo,
    overtime_hours: otHours,
    overtime_rate: otRate,
    loan_installment: advance,
    advance_deduction: advance,
    fine: fineVal,
    manual_deduction: fineVal,
    other_adjustment: otherAdj,
    notes: String(raw.notes || '').trim(),
  };
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const month = parseInt(searchParams.get('month') || String(now.getMonth() + 1), 10);
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()), 10);
    const template = searchParams.get('template'); // 'csv' | 'xlsx'

    const [employees, inputs, lockedRun] = await Promise.all([
      Employee.find({ is_deleted: { $ne: true }, status: { $in: ['Active', 'On Leave'] } })
        .select('employee_id firstName lastName department designation basic_salary')
        .sort({ employee_id: 1 })
        .lean(),
      PayrollInput.find({ month, year }).lean(),
      isMonthLockedByConfirmedRun(month, year),
    ]);

    if (template === 'csv' || template === 'xlsx') {
      const headers = [
        'employee_id',
        'overtime_hours',
        'overtime_rate',
        'bonus_type',
        'bonus_festival',
        'bonus_performance',
        'bonus_other',
        'advance_deduction',
        'fine',
        'other_adjustment',
        'note',
      ];
      const inpMap = new Map<string, any>();
      for (const i of inputs) inpMap.set(i.employee_id.toString(), i);

      const sampleRows = (employees as any[]).map((e) => {
        const cur = inpMap.get(e._id.toString());
        return [
          e.employee_id,
          cur?.overtime_hours ?? 0,
          cur?.overtime_rate ?? 0,
          cur?.bonus_type ?? 'festival',
          cur?.bonus_festival ?? 0,
          cur?.bonus_performance ?? 0,
          cur?.bonus_other ?? 0,
          cur?.advance_deduction ?? cur?.loan_installment ?? 0,
          cur?.fine ?? cur?.manual_deduction ?? 0,
          cur?.other_adjustment ?? 0,
          cur?.notes ?? '',
        ];
      });

      if (template === 'xlsx') {
        const xlsx = buildXlsxBuffer(`Inputs_${year}_${month}`, headers, sampleRows);
        return new NextResponse(new Uint8Array(xlsx), {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="Monthly_Inputs_Template_${year}_${month}.xlsx"`,
          },
        });
      }

      const csv = buildCsvString(headers, sampleRows);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="Monthly_Inputs_Template_${year}_${month}.csv"`,
        },
      });
    }

    const inputMap = new Map<string, any>();
    for (const inp of inputs) {
      inputMap.set(inp.employee_id.toString(), inp);
    }

    const rows = employees.map((emp: any) => {
      const inp = inputMap.get(emp._id.toString());
      return {
        employee: { ...emp, _id: emp._id.toString() },
        input: inp
          ? {
              _id: inp._id.toString(),
              bonus: inp.bonus || 0,
              bonus_type: inp.bonus_type || 'festival',
              bonus_festival: inp.bonus_festival ?? inp.bonus ?? 0,
              bonus_performance: inp.bonus_performance || 0,
              bonus_other: inp.bonus_other || 0,
              overtime_hours: inp.overtime_hours || 0,
              overtime_rate: inp.overtime_rate || 0,
              loan_installment: inp.loan_installment || 0,
              advance_deduction: inp.advance_deduction ?? inp.loan_installment ?? 0,
              fine: inp.fine ?? inp.manual_deduction ?? 0,
              other_adjustment: inp.other_adjustment || 0,
              manual_deduction: inp.manual_deduction || 0,
              notes: inp.notes || '',
            }
          : {
              _id: null,
              bonus: 0,
              bonus_type: 'festival',
              bonus_festival: 0,
              bonus_performance: 0,
              bonus_other: 0,
              overtime_hours: 0,
              overtime_rate: 0,
              loan_installment: 0,
              advance_deduction: 0,
              fine: 0,
              other_adjustment: 0,
              manual_deduction: 0,
              notes: '',
            },
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        month,
        year,
        isLocked: Boolean(lockedRun),
        lockedRun,
        rows,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch monthly inputs' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as UpsertInputBody;
    const month = Number(body.month);
    const year = Number(body.year);

    if (!month || month < 1 || month > 12 || !year) {
      return NextResponse.json(
        { success: false, message: 'Valid month and year are required.' },
        { status: 400 }
      );
    }

    await connectDB();

    const lockedRun = await isMonthLockedByConfirmedRun(month, year);
    if (lockedRun) {
      return NextResponse.json(
        {
          success: false,
          message: `Monthly inputs for ${month}/${year} are locked because Payroll Run ${lockedRun.batch_code} is already ${lockedRun.status}.`,
        },
        { status: 400 }
      );
    }

    // Handle CSV or Excel Import (preview & confirm)
    if (body.action === 'import_preview' || body.action === 'import_confirm') {
      let matrix: string[][] = [];
      if (body.xlsxBase64) {
        const buf = Buffer.from(body.xlsxBase64, 'base64');
        matrix = parseXlsxBuffer(buf);
      } else if (body.csvText) {
        matrix = parseCsvText(body.csvText);
      } else {
        return NextResponse.json(
          { success: false, message: 'Upload a CSV or Excel (.xlsx) file to import.' },
          { status: 400 }
        );
      }

      if (matrix.length < 2) {
        return NextResponse.json(
          { success: false, message: 'Uploaded file must contain a header row and at least one data row.' },
          { status: 400 }
        );
      }

      const headers = matrix[0].map((h) => h.trim().toLowerCase());
      const colIdx = (aliases: string[]) => headers.findIndex((h) => aliases.includes(h));

      const iEmpId = colIdx(['employee_id', 'emp_id', 'id', 'employee code']);
      if (iEmpId < 0) {
        return NextResponse.json(
          { success: false, message: 'Missing required "employee_id" column in file header.' },
          { status: 400 }
        );
      }

      const iOtHours = colIdx(['overtime_hours', 'ot_hours', 'overtime']);
      const iOtRate = colIdx(['overtime_rate', 'ot_rate', 'hourly_rate']);
      const iBonusType = colIdx(['bonus_type', 'bonus type']);
      const iBonusFest = colIdx(['bonus_festival', 'festival_bonus', 'festival']);
      const iBonusPerf = colIdx(['bonus_performance', 'performance_bonus', 'performance']);
      const iBonusOth = colIdx(['bonus_other', 'other_bonus', 'bonus']);
      const iAdvance = colIdx(['advance_deduction', 'advance', 'loan_installment']);
      const iFine = colIdx(['fine', 'manual_deduction', 'penalty']);
      const iOtherAdj = colIdx(['other_adjustment', 'adjustment']);
      const iNote = colIdx(['note', 'notes', 'remark']);

      const empDocs = await Employee.find({ is_deleted: { $ne: true } })
        .select('_id employee_id firstName lastName status')
        .lean();
      const empByCode = new Map<string, any>();
      for (const e of empDocs) empByCode.set(String(e.employee_id).toUpperCase(), e);

      const previewRows: any[] = [];
      let validCount = 0;
      let errorCount = 0;

      for (let r = 1; r < matrix.length; r++) {
        const row = matrix[r];
        const code = String(row[iEmpId] || '').trim().toUpperCase();
        const errors: string[] = [];

        const emp = empByCode.get(code);
        if (!code) errors.push('Employee ID is blank');
        else if (!emp) errors.push(`Employee "${code}" not found`);

        const getNum = (idx: number, label: string, allowNeg = false): number => {
          if (idx < 0 || row[idx] === undefined || row[idx] === '') return 0;
          const val = Number(row[idx]);
          if (Number.isNaN(val)) {
            errors.push(`${label} must be a number`);
            return 0;
          }
          if (!allowNeg && val < 0) {
            errors.push(`${label} cannot be negative`);
            return 0;
          }
          return val;
        };

        const otHours = getNum(iOtHours, 'overtime_hours');
        const otRate = getNum(iOtRate, 'overtime_rate');
        const bf = getNum(iBonusFest, 'bonus_festival');
        const bp = getNum(iBonusPerf, 'bonus_performance');
        const bo = getNum(iBonusOth, 'bonus_other');
        const advance = getNum(iAdvance, 'advance_deduction');
        const fine = getNum(iFine, 'fine');
        const adj = getNum(iOtherAdj, 'other_adjustment', true);
        const rawBonusType = iBonusType >= 0 ? String(row[iBonusType] || 'festival').trim().toLowerCase() : 'festival';
        if (rawBonusType && !VALID_BONUS_TYPES.has(rawBonusType as BonusType)) {
          errors.push(`bonus_type must be festival, performance, or other`);
        }
        const note = iNote >= 0 ? String(row[iNote] || '').trim() : '';

        if (errors.length > 0) errorCount++;
        else validCount++;

        previewRows.push({
          rowNumber: r + 1,
          employee_code: code,
          employee_name: emp ? `${emp.firstName} ${emp.lastName}` : '—',
          employee_object_id: emp?._id?.toString() || null,
          valid: errors.length === 0,
          errors,
          data: {
            overtime_hours: otHours,
            overtime_rate: otRate,
            bonus_type: (VALID_BONUS_TYPES.has(rawBonusType as BonusType) ? rawBonusType : 'festival') as BonusType,
            bonus_festival: bf,
            bonus_performance: bp,
            bonus_other: bo,
            advance_deduction: advance,
            fine,
            other_adjustment: adj,
            notes: note,
          },
        });
      }

      if (body.action === 'import_preview') {
        return NextResponse.json({
          success: true,
          data: { validCount, errorCount, totalRows: previewRows.length, previewRows },
        });
      }

      // import_confirm
      const validRows = previewRows.filter((r) => r.valid && r.employee_object_id);
      if (validRows.length === 0) {
        return NextResponse.json(
          { success: false, message: `No valid rows to import (${errorCount} error rows).` },
          { status: 400 }
        );
      }

      for (const vr of validRows) {
        const normalized = buildNormalizedInputPayload(vr.data);
        await PayrollInput.findOneAndUpdate(
          { employee_id: vr.employee_object_id, month, year },
          { $set: { ...normalized, updated_by: auth.user.name } },
          { upsert: true }
        );
      }

      await createAuditLog({
        user: auth.user,
        action: 'PAYROLL_INPUT_IMPORTED',
        entity: 'PayrollInput',
        newValues: { month, year, importedCount: validRows.length, errorCount },
      });

      return NextResponse.json({
        success: true,
        message: `Imported ${validRows.length} employee monthly input(s) for ${month}/${year}${
          errorCount ? ` (${errorCount} invalid rows skipped)` : ''
        }.`,
        data: { importedCount: validRows.length, errorCount },
      });
    }

    // Single Row Save
    if (!body.employee_id) {
      return NextResponse.json({ success: false, message: 'employee_id is required.' }, { status: 400 });
    }

    const emp = await Employee.findById(body.employee_id);
    if (!emp) {
      return NextResponse.json({ success: false, message: 'Employee not found' }, { status: 404 });
    }

    const existing = await PayrollInput.findOne({ employee_id: body.employee_id, month, year }).lean();
    const normalized = buildNormalizedInputPayload(body);

    const updated = await PayrollInput.findOneAndUpdate(
      { employee_id: body.employee_id, month, year },
      { $set: { ...normalized, updated_by: auth.user.name } },
      { upsert: true, returnDocument: 'after' }
    );

    await createAuditLog({
      user: auth.user,
      action: 'PAYROLL_INPUT_SAVED',
      entity: 'PayrollInput',
      entityId: updated._id.toString(),
      oldValues: existing
        ? {
            bonus: existing.bonus,
            overtime_hours: existing.overtime_hours,
            advance_deduction: existing.advance_deduction,
            fine: existing.fine,
            other_adjustment: existing.other_adjustment,
          }
        : undefined,
      newValues: { employee_id: emp.employee_id, month, year, ...normalized },
    });

    return NextResponse.json({
      success: true,
      message: `Monthly inputs saved for ${emp.firstName} ${emp.lastName}.`,
      data: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to save monthly inputs' },
      { status: 500 }
    );
  }
}
