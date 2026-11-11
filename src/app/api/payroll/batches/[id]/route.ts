import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { PayslipBatch } from '@/models/PayslipBatch';
import { Payslip } from '@/models/Payslip';
import { Employee, PaymentMethodType } from '@/models/Employee';
import { EmployeeContract } from '@/models/EmployeeContract';
import { SalaryStructure } from '@/models/SalaryStructure';
import {
  computeEmployeePayslipData,
  computePercentChange,
  detectRunWarnings,
  generateNextPayslipNo,
  onPayrollRunConfirmed,
} from '@/lib/payroll-engine';
import { buildCsvString, buildXlsxBuffer } from '@/lib/export-utils';

function getPreviousMonthYear(month: number, year: number) {
  return month === 1 ? { prevMonth: 12, prevYear: year - 1 } : { prevMonth: month - 1, prevYear: year };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'HR', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await connectDB();
    void Employee;
    void EmployeeContract;
    void SalaryStructure;

    const { searchParams } = new URL(req.url);
    const exportKind = searchParams.get('export');

    const [batch, payslips] = await Promise.all([
      PayslipBatch.findById(id).lean(),
      Payslip.find({ batch_id: id })
        .populate(
          'employee_id',
          'employee_id firstName lastName department designation payment_method bank_name bank_branch bank_account_no phone'
        )
        .populate('contract_id', 'bank_name bank_account_no basic_salary')
        .sort({ payslip_no: 1 })
        .lean(),
    ]);

    if (!batch) {
      return NextResponse.json({ success: false, message: 'Payroll run not found' }, { status: 404 });
    }

    if (exportKind === 'skipped_csv') {
      const headers = ['Employee ID', 'Employee Name', 'Department', 'Reason Code', 'Reason'];
      const rows = (batch.skipped_employees || []).map((s: any) => [
        s.employee_code,
        s.name,
        s.department,
        s.reason_code,
        s.reason,
      ]);
      const csv = buildCsvString(headers, rows);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${batch.batch_code}_Skipped_Employees.csv"`,
        },
      });
    }

    if (exportKind === 'bank_csv' || exportKind === 'bank_xlsx') {
      if (auth.user.role === 'Viewer') {
        return NextResponse.json(
          { success: false, message: 'Viewer role is read-only and cannot export disbursement sheets.' },
          { status: 403 }
        );
      }
      if (batch.status !== 'Confirmed' && batch.status !== 'Paid') {
        return NextResponse.json(
          {
            success: false,
            message: 'Bank transfer sheet is only available once the Payroll Run is Confirmed or Paid.',
          },
          { status: 400 }
        );
      }

      const headers = [
        'Employee ID',
        'Employee Name',
        'Department',
        'Payment Method',
        'Bank / Wallet Provider',
        'Branch',
        'Account / Wallet Number',
        'Net Amount (BDT)',
      ];
      const rows = (payslips as any[])
        .filter((p) => p.status !== 'Cancelled' && p.status !== 'Reversed')
        .map((p) => {
          const emp = p.employee_id || {};
          const contract = p.contract_id || {};
          const method = p.payment_method || emp.payment_method || 'Bank';
          const bankOrWallet =
            method === 'Bank' ? emp.bank_name || contract.bank_name || 'Bank' : method;
          const acct = emp.bank_account_no || contract.bank_account_no || emp.phone || '';
          return [
            emp.employee_id || '',
            `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
            emp.department || '',
            method,
            bankOrWallet,
            emp.bank_branch || '',
            acct,
            p.net_pay || 0,
          ];
        });

      if (exportKind === 'bank_xlsx') {
        const xlsx = buildXlsxBuffer(`${batch.batch_code} Bank Sheet`, headers, rows);
        return new NextResponse(new Uint8Array(xlsx), {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${batch.batch_code}_Bank_Transfer_Sheet.xlsx"`,
          },
        });
      }

      const csv = buildCsvString(headers, rows);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${batch.batch_code}_Bank_Transfer_Sheet.csv"`,
        },
      });
    }

    const { prevMonth, prevYear } = getPreviousMonthYear(batch.month, batch.year);
    const previousRun = await PayslipBatch.findOne({
      month: prevMonth,
      year: prevYear,
      branch: batch.branch || 'Main',
      is_reversal: { $ne: true },
      status: { $in: ['Draft', 'Verified', 'Confirmed', 'Paid'] },
    }).lean();

    const deltas = previousRun
      ? {
          countPct: computePercentChange(batch.payslip_count || 0, previousRun.payslip_count || 0),
          grossPct: computePercentChange(batch.total_gross_pay || 0, previousRun.total_gross_pay || 0),
          deductionsPct: computePercentChange(batch.total_deductions || 0, previousRun.total_deductions || 0),
          netPct: computePercentChange(batch.total_net_pay || 0, previousRun.total_net_pay || 0),
        }
      : null;

    return NextResponse.json({
      success: true,
      data: { batch, payslips, previousRun, deltas },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load payroll run details' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'HR', 'Accountant']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    const body = await req.json();
    const action = body.action as 'recalculate' | 'verify' | 'confirm' | 'pay' | 'reverse' | 'cancel';

    if (!['recalculate', 'verify', 'confirm', 'pay', 'reverse', 'cancel'].includes(action)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid action. Supported actions: recalculate, verify, confirm, pay, reverse, cancel.',
        },
        { status: 400 }
      );
    }

    // Strict RBAC enforcement
    const role = auth.user.role;
    if ((action === 'recalculate' || action === 'verify' || action === 'cancel') && !['Admin', 'HR'].includes(role)) {
      return NextResponse.json(
        { success: false, message: 'Only HR or Admin can recalculate, verify, or cancel a Draft run.' },
        { status: 403 }
      );
    }
    if ((action === 'confirm' || action === 'reverse') && role !== 'Admin') {
      return NextResponse.json(
        { success: false, message: 'Only Admin can Confirm or Reverse a payroll run.' },
        { status: 403 }
      );
    }
    if (action === 'pay' && !['Admin', 'Accountant'].includes(role)) {
      return NextResponse.json(
        { success: false, message: 'Only Accountant or Admin can mark a payroll run as Paid.' },
        { status: 403 }
      );
    }

    await connectDB();
    const batch = await PayslipBatch.findById(id);
    if (!batch) {
      return NextResponse.json({ success: false, message: 'Payroll run not found' }, { status: 404 });
    }

    if (batch.is_reversal) {
      return NextResponse.json(
        { success: false, message: 'Reversal audit records cannot be modified.' },
        { status: 400 }
      );
    }

    const oldStatus = batch.status;
    let updatedPayslips = 0;

    if (action === 'recalculate') {
      if (batch.status !== 'Draft') {
        return NextResponse.json(
          { success: false, message: `Only Draft runs can be recalculated (current status: ${batch.status}).` },
          { status: 400 }
        );
      }

      const slips = await Payslip.find({ batch_id: id, status: 'Draft' });
      const { prevMonth, prevYear } = getPreviousMonthYear(batch.month, batch.year);
      const prevSlips = await Payslip.find({
        employee_id: { $in: slips.map((s) => s.employee_id) },
        month: prevMonth,
        year: prevYear,
        is_reversal: { $ne: true },
        status: { $in: ['Draft', 'Verified', 'Confirmed', 'Paid'] },
      }).lean();
      const prevNetMap = new Map<string, number>();
      for (const ps of prevSlips) prevNetMap.set(ps.employee_id.toString(), ps.net_pay || 0);

      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;
      const computedList: any[] = [];

      for (const slip of slips) {
        const computed = await computeEmployeePayslipData({
          employeeId: slip.employee_id.toString(),
          month: batch.month,
          year: batch.year,
          daysBasis: batch.days_basis || 'calendar',
          overtimeMultiplier: batch.overtime_multiplier || 2,
        });

        slip.contract_id = computed.contract._id as any;
        slip.structure_id = computed.structure._id as any;
        slip.days_basis = computed.days_basis;
        slip.days_in_month = computed.days_in_month;
        slip.prorated_days = computed.prorated_days;
        slip.per_day_rate = computed.per_day_rate;
        slip.overtime_multiplier = computed.overtime_multiplier;
        slip.attendance_summary = computed.attendance_summary;
        slip.inputs_snapshot = computed.inputs_snapshot;
        slip.lines = computed.lines as any;
        slip.basic_pay = computed.basic_pay;
        slip.total_allowances = computed.total_allowances;
        slip.gross_pay = computed.gross_pay;
        slip.total_deductions = computed.total_deductions;
        slip.net_pay = computed.net_pay;
        slip.amount_in_words = computed.amount_in_words;
        await slip.save();

        totalGross += computed.gross_pay;
        totalDeductions += computed.total_deductions;
        totalNet += computed.net_pay;
        computedList.push(computed);
        updatedPayslips++;
      }

      batch.payslip_count = updatedPayslips;
      batch.total_gross_pay = totalGross;
      batch.total_deductions = totalDeductions;
      batch.total_net_pay = totalNet;
      batch.warnings = detectRunWarnings(computedList, prevNetMap) as any;
      await batch.save();

      await createAuditLog({
        user: auth.user,
        action: 'PAYROLL_RUN_RECALCULATED',
        entity: 'PayslipBatch',
        entityId: batch._id.toString(),
        oldValues: { status: oldStatus },
        newValues: { updatedPayslips, totalGross, totalDeductions, totalNet },
      });

      return NextResponse.json({
        success: true,
        message: `Recalculated ${updatedPayslips} Draft payslip(s) in ${batch.batch_code}.`,
        data: batch,
      });
    } else if (action === 'verify') {
      if (batch.status !== 'Draft') {
        return NextResponse.json(
          { success: false, message: `Only Draft runs can be Verified (current: ${batch.status}).` },
          { status: 400 }
        );
      }
      const res = await Payslip.updateMany(
        { batch_id: id, status: 'Draft' },
        { $set: { status: 'Verified', verified_by: auth.user.name, verified_at: new Date() } }
      );
      updatedPayslips = res.modifiedCount;
      batch.status = 'Verified';
      batch.verified_by = auth.user.name;
      batch.verified_at = new Date();
    } else if (action === 'confirm') {
      if (batch.status !== 'Verified') {
        return NextResponse.json(
          {
            success: false,
            message: `Payroll run must be Verified before confirming (current: ${batch.status}).`,
          },
          { status: 400 }
        );
      }
      const res = await Payslip.updateMany(
        { batch_id: id, status: { $in: ['Draft', 'Verified'] } },
        { $set: { status: 'Confirmed', confirmed_by: auth.user.name, confirmed_at: new Date() } }
      );
      updatedPayslips = res.modifiedCount;
      batch.status = 'Confirmed';
      batch.confirmed_by = auth.user.name;
      batch.confirmed_at = new Date();

      // Future extensibility hook (accounting journal, TDS, PF)
      await onPayrollRunConfirmed({
        runId: batch._id.toString(),
        month: batch.month,
        year: batch.year,
        branch: batch.branch || 'Main',
        totalNetPay: batch.total_net_pay || 0,
      });
    } else if (action === 'pay') {
      if (batch.status !== 'Confirmed') {
        return NextResponse.json(
          { success: false, message: `Payroll run must be Confirmed before marking Paid.` },
          { status: 400 }
        );
      }

      const paymentMethod = (body.payment_method || 'Bank') as PaymentMethodType;
      if (!['Bank', 'bKash', 'Nagad', 'Cash'].includes(paymentMethod)) {
        return NextResponse.json(
          { success: false, message: 'Valid payment_method (Bank, bKash, Nagad, Cash) is required.' },
          { status: 400 }
        );
      }
      const paymentDate = body.payment_date ? new Date(body.payment_date) : new Date();
      const paymentReference = String(body.payment_reference || '').trim();
      if (!paymentReference) {
        return NextResponse.json(
          { success: false, message: 'Payment reference (bank advice / transaction ID) is required.' },
          { status: 400 }
        );
      }

      const res = await Payslip.updateMany(
        { batch_id: id, status: 'Confirmed' },
        {
          $set: {
            status: 'Paid',
            payment_method: paymentMethod,
            payment_date: paymentDate,
            payment_reference: paymentReference,
            paid_by: auth.user.name,
            paid_at: new Date(),
          },
        }
      );
      updatedPayslips = res.modifiedCount;
      batch.status = 'Paid';
      batch.payment_method = paymentMethod;
      batch.payment_date = paymentDate;
      batch.payment_reference = paymentReference;
      batch.paid_by = auth.user.name;
      batch.paid_at = new Date();
    } else if (action === 'reverse') {
      if (batch.status !== 'Confirmed') {
        return NextResponse.json(
          {
            success: false,
            message: `Only Confirmed runs can be reversed (current: ${batch.status}).`,
          },
          { status: 400 }
        );
      }
      const reason = String(body.reason || '').trim();
      if (reason.length < 3) {
        return NextResponse.json(
          { success: false, message: 'A clear reversal reason (at least 3 characters) is required.' },
          { status: 400 }
        );
      }

      const origSlips = await Payslip.find({ batch_id: id, status: 'Confirmed' });
      const revTime = new Date();

      batch.status = 'Reversed';
      batch.reversal_reason = reason;
      batch.reversed_by = auth.user.name;
      batch.reversed_at = revTime;

      // Create mirror Reversal Run record (never delete confirmed data!)
      const revRun = await PayslipBatch.create({
        name: `REVERSAL: ${batch.name}`,
        batch_code: `${batch.batch_code}-REV`,
        month: batch.month,
        year: batch.year,
        branch: batch.branch || 'Main',
        department: batch.department,
        status: 'Reversed',
        days_basis: batch.days_basis,
        overtime_multiplier: batch.overtime_multiplier,
        include_no_attendance: batch.include_no_attendance,
        payslip_count: origSlips.length,
        skipped_count: 0,
        total_gross_pay: -(batch.total_gross_pay || 0),
        total_deductions: -(batch.total_deductions || 0),
        total_net_pay: -(batch.total_net_pay || 0),
        created_by: auth.user.name,
        reversal_reason: reason,
        reversed_by: auth.user.name,
        reversed_at: revTime,
        reversal_of_id: batch._id,
        is_reversal: true,
      });

      for (const s of origSlips) {
        s.status = 'Reversed';
        s.reversal_reason = reason;
        s.reversed_by = auth.user.name;
        s.reversed_at = revTime;
        await s.save();

        const revNo = await generateNextPayslipNo(batch.month, batch.year);
        await Payslip.create({
          payslip_no: `${revNo}-REV`,
          employee_id: s.employee_id,
          contract_id: s.contract_id,
          structure_id: s.structure_id,
          batch_id: revRun._id,
          month: s.month,
          year: s.year,
          branch: s.branch || 'Main',
          days_basis: s.days_basis,
          days_in_month: s.days_in_month,
          prorated_days: s.prorated_days,
          per_day_rate: s.per_day_rate,
          overtime_multiplier: s.overtime_multiplier,
          attendance_summary: s.attendance_summary,
          inputs_snapshot: s.inputs_snapshot,
          lines: (s.lines || []).map((l: any) => ({
            ...(l.toObject ? l.toObject() : l),
            amount: -Math.abs(l.amount || 0),
          })),
          basic_pay: -(s.basic_pay || 0),
          total_allowances: -(s.total_allowances || 0),
          gross_pay: -(s.gross_pay || 0),
          total_deductions: -(s.total_deductions || 0),
          net_pay: -(s.net_pay || 0),
          amount_in_words: `Reversal of ${s.payslip_no}`,
          status: 'Reversed',
          notes: `Reversal: ${reason}`,
          reversal_reason: reason,
          reversed_by: auth.user.name,
          reversed_at: revTime,
          reversal_of_id: s._id,
          is_reversal: true,
          created_by: auth.user.name,
        });
        updatedPayslips++;
      }
    } else if (action === 'cancel') {
      if (batch.status !== 'Draft' && batch.status !== 'Verified') {
        return NextResponse.json(
          { success: false, message: 'Confirmed or Paid runs cannot be cancelled; use Reverse on Confirmed runs.' },
          { status: 400 }
        );
      }
      const res = await Payslip.updateMany(
        { batch_id: id, status: { $in: ['Draft', 'Verified'] } },
        { $set: { status: 'Cancelled' } }
      );
      updatedPayslips = res.modifiedCount;
      batch.status = 'Cancelled';
    }

    await batch.save();

    await createAuditLog({
      user: auth.user,
      action: `PAYROLL_RUN_${action.toUpperCase()}`,
      entity: 'PayslipBatch',
      entityId: batch._id.toString(),
      oldValues: { status: oldStatus },
      newValues: {
        status: batch.status,
        updatedPayslips,
        ...(batch.payment_reference ? { payment_reference: batch.payment_reference } : {}),
        ...(batch.reversal_reason ? { reversal_reason: batch.reversal_reason } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Payroll run ${batch.batch_code} -> ${batch.status} (${updatedPayslips} payslips updated).`,
      data: batch,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update payroll run' },
      { status: 500 }
    );
  }
}
