import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Payslip, PayslipStatus } from '@/models/Payslip';
import { PayslipBatch } from '@/models/PayslipBatch';
import { Employee, PaymentMethodType } from '@/models/Employee';
import { EmployeeContract } from '@/models/EmployeeContract';
import { SalaryStructure } from '@/models/SalaryStructure';
import { getNextSequence } from '@/models/Counter';
import { ensurePayrollSeeded } from '@/lib/payroll-seed';
import {
  assertNoDuplicatePayslip,
  computeEmployeePayslipData,
  generateNextPayslipNo,
} from '@/lib/payroll-engine';
import {
  buildCsvString,
  buildPayslipPdfBuffer,
  buildXlsxBuffer,
  buildZipBuffer,
} from '@/lib/export-utils';

interface GeneratePayslipBody {
  employee_id: string;
  month: number;
  year: number;
  notes?: string;
}

const PAYROLL_VIEW_ROLES = ['Admin', 'HR', 'Accountant', 'Viewer'];

async function syncBatchTotals(batchId: any) {
  if (!batchId) return;
  const activeSlips = await Payslip.find({
    batch_id: batchId,
    is_reversal: { $ne: true },
    status: { $nin: ['Cancelled', 'Reversed'] },
  }).lean();
  const totalGross = activeSlips.reduce((s, p) => s + (p.gross_pay || 0), 0);
  const totalDed = activeSlips.reduce((s, p) => s + (p.total_deductions || 0), 0);
  const totalNet = activeSlips.reduce((s, p) => s + (p.net_pay || 0), 0);
  await PayslipBatch.findByIdAndUpdate(batchId, {
    $set: {
      payslip_count: activeSlips.length,
      total_gross_pay: totalGross,
      total_deductions: totalDed,
      total_net_pay: totalNet,
    },
  });
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR', 'Accountant', 'Viewer', 'Manager', 'Employee', 'Counselor']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensurePayrollSeeded();
    void EmployeeContract;
    void SalaryStructure;

    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get('month');
    const yearParam = searchParams.get('year');
    const statusParam = searchParams.get('status');
    const departmentParam = searchParams.get('department');
    const batchIdParam = searchParams.get('batch_id');
    const searchParam = (searchParams.get('search') || '').trim().toLowerCase();
    const idsParam = searchParams.get('ids');
    const exportType = searchParams.get('export'); // 'csv' | 'xlsx' | 'zip'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(5, parseInt(searchParams.get('limit') || '20', 10)));

    const isPayrollStaff = PAYROLL_VIEW_ROLES.includes(auth.user.role);
    const filter: Record<string, any> = {};

    if (!isPayrollStaff) {
      const myEmp = await Employee.findOne({ userId: auth.user.userId }).lean();
      if (!myEmp) {
        return NextResponse.json({
          success: true,
          data: {
            payslips: [],
            pagination: { total: 0, page: 1, limit, totalPages: 1 },
            isPayrollStaff: false,
            myEmployee: null,
          },
        });
      }
      filter.employee_id = myEmp._id;
    }

    if (idsParam) {
      const idList = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
      if (idList.length > 0) filter._id = { $in: idList };
    } else {
      if (monthParam && monthParam !== 'all') filter.month = parseInt(monthParam, 10);
      if (yearParam && yearParam !== 'all') filter.year = parseInt(yearParam, 10);
      if (statusParam && statusParam !== 'all') filter.status = statusParam;
      if (batchIdParam && batchIdParam !== 'all') filter.batch_id = batchIdParam;
    }

    let payslips = await Payslip.find(filter)
      .populate(
        'employee_id',
        'employee_id firstName lastName phone department designation payment_method bank_name bank_branch bank_account_no'
      )
      .populate('contract_id', 'basic_salary bank_name bank_account_no')
      .populate('structure_id', 'name code')
      .populate('batch_id', 'batch_code name status branch')
      .sort({ year: -1, month: -1, createdAt: -1 })
      .lean();

    if (departmentParam && departmentParam !== 'all') {
      payslips = payslips.filter((p: any) => p.employee_id?.department === departmentParam);
    }

    if (searchParam) {
      payslips = payslips.filter((p: any) => {
        const empName = `${p.employee_id?.firstName || ''} ${p.employee_id?.lastName || ''}`.toLowerCase();
        const empCode = String(p.employee_id?.employee_id || '').toLowerCase();
        const slipNo = String(p.payslip_no || '').toLowerCase();
        return empName.includes(searchParam) || empCode.includes(searchParam) || slipNo.includes(searchParam);
      });
    }

    // Bulk Exports (ZIP of PDFs, CSV, or XLSX)
    if (exportType === 'zip') {
      const files = (payslips as any[]).map((p) => {
        const empCode = p.employee_id?.employee_id || 'EMP';
        const pdfBuf = buildPayslipPdfBuffer(p);
        return { name: `${p.payslip_no}_${empCode}.pdf`, data: pdfBuf };
      });
      const zipBuf = buildZipBuffer(files);
      return new NextResponse(new Uint8Array(zipBuf), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="Payslips_Bundle_${yearParam || 'All'}_${monthParam || 'All'}.zip"`,
        },
      });
    }

    if (exportType === 'csv' || exportType === 'xlsx') {
      const headers = [
        'Payslip No',
        'Run Code',
        'Employee ID',
        'Employee Name',
        'Department',
        'Month',
        'Year',
        'Basic (BDT)',
        'Allowances (BDT)',
        'Gross (BDT)',
        'Deductions (BDT)',
        'Net Pay (BDT)',
        'Status',
        'Payment Method',
      ];
      const rows = (payslips as any[]).map((p) => [
        p.payslip_no,
        p.batch_id?.batch_code || '-',
        p.employee_id?.employee_id || '',
        `${p.employee_id?.firstName || ''} ${p.employee_id?.lastName || ''}`.trim(),
        p.employee_id?.department || '',
        p.month,
        p.year,
        p.basic_pay || 0,
        p.total_allowances || 0,
        p.gross_pay || 0,
        p.total_deductions || 0,
        p.net_pay || 0,
        p.status,
        p.payment_method || p.employee_id?.payment_method || 'Bank',
      ]);

      if (exportType === 'xlsx') {
        const xlsx = buildXlsxBuffer('Payslips', headers, rows);
        return new NextResponse(new Uint8Array(xlsx), {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="Payslips_Export_${yearParam || 'All'}_${monthParam || 'All'}.xlsx"`,
          },
        });
      }

      const csv = buildCsvString(headers, rows);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="Payslips_Export_${yearParam || 'All'}_${monthParam || 'All'}.csv"`,
        },
      });
    }

    const total = payslips.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const paged = payslips.slice((safePage - 1) * limit, safePage * limit);

    const summary = payslips
      .filter((p: any) => p.status !== 'Cancelled' && !p.is_reversal)
      .reduce(
        (acc: any, p: any) => {
          acc.count += 1;
          acc.gross += p.gross_pay || 0;
          acc.deductions += p.total_deductions || 0;
          acc.net += p.net_pay || 0;
          return acc;
        },
        { count: 0, gross: 0, deductions: 0, net: 0 }
      );

    const myEmployee = isPayrollStaff
      ? null
      : await Employee.findOne({ userId: auth.user.userId })
          .select('employee_id firstName lastName department designation')
          .lean();

    return NextResponse.json({
      success: true,
      data: {
        payslips: paged,
        allSummary: summary,
        pagination: { total, page: safePage, limit, totalPages },
        isPayrollStaff,
        myEmployee,
      },
    });
  } catch (error: any) {
    console.error('GET /api/payroll/payslips error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch payslips' },
      { status: 500 }
    );
  }
}

/**
 * Secondary Exception Single Payslip generator — attaches automatically to the Payroll Run for (month, year, branch).
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as GeneratePayslipBody;
    const month = Number(body.month);
    const year = Number(body.year);

    if (!body.employee_id || !month || month < 1 || month > 12 || !year) {
      return NextResponse.json(
        { success: false, message: 'employee_id, valid month (1-12), and year are required.' },
        { status: 400 }
      );
    }

    await connectDB();
    await ensurePayrollSeeded();

    await assertNoDuplicatePayslip(body.employee_id, month, year);

    const emp = await Employee.findById(body.employee_id).lean();
    if (!emp) {
      return NextResponse.json({ success: false, message: 'Employee not found.' }, { status: 404 });
    }
    const branch = emp.branch || 'Main';

    // Find existing active run for this (month, year, branch) or create a Draft run so no loose payslip exists
    let run = await PayslipBatch.findOne({
      month,
      year,
      branch,
      is_reversal: { $ne: true },
      status: { $in: ['Draft', 'Verified', 'Confirmed', 'Paid'] },
    });

    if (run && (run.status === 'Confirmed' || run.status === 'Paid')) {
      return NextResponse.json(
        {
          success: false,
          message: `Payroll run ${run.batch_code} for ${month}/${year} (${branch}) is already ${run.status} and locked. Cannot attach new payslips.`,
        },
        { status: 400 }
      );
    }

    if (!run) {
      const ym = `${year}${String(month).padStart(2, '0')}`;
      const seq = await getNextSequence(`payslip_batch_${ym}_${branch}`);
      const batchCode = `PR-${ym}-${String(seq).padStart(2, '0')}`;
      const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      });
      run = await PayslipBatch.create({
        name: `${monthLabel} Payroll (${branch})`,
        batch_code: batchCode,
        month,
        year,
        branch,
        department: 'all',
        status: 'Draft',
        days_basis: 'calendar',
        overtime_multiplier: 2,
        include_no_attendance: false,
        created_by: auth.user.name,
      });
    }

    const computed = await computeEmployeePayslipData({
      employeeId: body.employee_id,
      month,
      year,
      daysBasis: run.days_basis || 'calendar',
      overtimeMultiplier: run.overtime_multiplier || 2,
    });

    const payslipNo = await generateNextPayslipNo(month, year);

    const payslip = await Payslip.create({
      payslip_no: payslipNo,
      employee_id: computed.employee._id,
      contract_id: computed.contract._id,
      structure_id: computed.structure._id,
      batch_id: run._id,
      month,
      year,
      branch,
      days_basis: computed.days_basis,
      days_in_month: computed.days_in_month,
      prorated_days: computed.prorated_days,
      per_day_rate: computed.per_day_rate,
      overtime_multiplier: computed.overtime_multiplier,
      attendance_summary: computed.attendance_summary,
      inputs_snapshot: computed.inputs_snapshot,
      lines: computed.lines,
      basic_pay: computed.basic_pay,
      total_allowances: computed.total_allowances,
      gross_pay: computed.gross_pay,
      total_deductions: computed.total_deductions,
      net_pay: computed.net_pay,
      amount_in_words: computed.amount_in_words,
      payment_method: emp.payment_method || 'Bank',
      status: 'Draft',
      notes: body.notes?.trim() || 'Exception single payslip',
      created_by: auth.user.name,
    });

    await syncBatchTotals(run._id);

    await createAuditLog({
      user: auth.user,
      action: 'PAYSLIP_EXCEPTION_GENERATED',
      entity: 'Payslip',
      entityId: payslip._id.toString(),
      newValues: {
        payslip_no: payslip.payslip_no,
        batch_code: run.batch_code,
        employee_id: computed.employee.employee_id,
        month,
        year,
        gross_pay: payslip.gross_pay,
        net_pay: payslip.net_pay,
      },
    });

    const populated = await Payslip.findById(payslip._id)
      .populate('employee_id', 'employee_id firstName lastName phone department designation')
      .populate('structure_id', 'name code')
      .populate('batch_id', 'batch_code name status')
      .lean();

    return NextResponse.json(
      {
        success: true,
        message: `Exception payslip ${payslip.payslip_no} attached to run ${run.batch_code} (Draft).`,
        data: populated,
      },
      { status: 201 }
    );
  } catch (error: any) {
    const status =
      error.message?.includes('already exists') || error.message?.includes('no Active contract')
        ? 400
        : 500;
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to generate exception payslip' },
      { status }
    );
  }
}

/**
 * Bulk status transitions on selected Payslips: verify (HR/Admin), confirm (Admin), pay (Accountant/Admin)
 */
export async function PUT(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR', 'Accountant']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    const action = body.action as 'verify' | 'confirm' | 'pay';

    if (ids.length === 0 || !['verify', 'confirm', 'pay'].includes(action)) {
      return NextResponse.json(
        { success: false, message: 'Select payslips and choose verify, confirm, or pay.' },
        { status: 400 }
      );
    }

    const role = auth.user.role;
    if (action === 'verify' && !['Admin', 'HR'].includes(role)) {
      return NextResponse.json({ success: false, message: 'Only HR or Admin can verify payslips.' }, { status: 403 });
    }
    if (action === 'confirm' && role !== 'Admin') {
      return NextResponse.json({ success: false, message: 'Only Admin can confirm payslips.' }, { status: 403 });
    }
    if (action === 'pay' && !['Admin', 'Accountant'].includes(role)) {
      return NextResponse.json({ success: false, message: 'Only Accountant or Admin can mark paid.' }, { status: 403 });
    }

    await connectDB();
    const slips = await Payslip.find({ _id: { $in: ids } });
    const requiredCurrent: Record<typeof action, PayslipStatus> = {
      verify: 'Draft',
      confirm: 'Verified',
      pay: 'Confirmed',
    };
    const nextStatus: Record<typeof action, PayslipStatus> = {
      verify: 'Verified',
      confirm: 'Confirmed',
      pay: 'Paid',
    };

    let updatedCount = 0;
    let skippedCount = 0;
    const paymentMethod = (body.payment_method || 'Bank') as PaymentMethodType;
    const paymentDate = body.payment_date ? new Date(body.payment_date) : new Date();
    const paymentRef = String(body.payment_reference || '').trim();

    if (action === 'pay' && !paymentRef) {
      return NextResponse.json(
        { success: false, message: 'Payment reference is required when marking payslips paid.' },
        { status: 400 }
      );
    }

    for (const s of slips) {
      if (s.status !== requiredCurrent[action]) {
        skippedCount++;
        continue;
      }
      const oldStatus = s.status;
      s.status = nextStatus[action];
      if (action === 'verify') {
        s.verified_by = auth.user.name;
        s.verified_at = new Date();
      } else if (action === 'confirm') {
        s.confirmed_by = auth.user.name;
        s.confirmed_at = new Date();
      } else if (action === 'pay') {
        s.payment_method = paymentMethod;
        s.payment_date = paymentDate;
        s.payment_reference = paymentRef;
        s.paid_by = auth.user.name;
        s.paid_at = new Date();
      }
      await s.save();
      updatedCount++;

      await createAuditLog({
        user: auth.user,
        action: `PAYSLIP_BULK_${action.toUpperCase()}`,
        entity: 'Payslip',
        entityId: s._id.toString(),
        oldValues: { status: oldStatus },
        newValues: { status: s.status, ...(paymentRef ? { payment_reference: paymentRef } : {}) },
      });
    }

    return NextResponse.json({
      success: true,
      message: `${updatedCount} payslip(s) updated to ${nextStatus[action]}${
        skippedCount > 0 ? ` (${skippedCount} skipped due to current status)` : ''
      }.`,
      data: { updatedCount, skippedCount },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Bulk update failed' },
      { status: 500 }
    );
  }
}
