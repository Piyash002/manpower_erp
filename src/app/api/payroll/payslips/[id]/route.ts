import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Payslip, PayslipStatus } from '@/models/Payslip';
import { PayslipBatch } from '@/models/PayslipBatch';
import { Employee, PaymentMethodType } from '@/models/Employee';
import { EmployeeContract } from '@/models/EmployeeContract';
import { SalaryStructure } from '@/models/SalaryStructure';
import {
  computeEmployeePayslipData,
  resolveEffectivePayrollSettings,
} from '@/lib/payroll-engine';
import { amountInWords } from '@/lib/formatters';
import { buildPayslipPdfBuffer } from '@/lib/export-utils';

const PAYROLL_VIEW_ROLES = ['Admin', 'HR', 'Accountant', 'Viewer'];

async function syncParentBatchTotals(batchId: any) {
  if (!batchId) return;
  const activeSlips = await Payslip.find({
    batch_id: batchId,
    is_reversal: { $ne: true },
    status: { $nin: ['Cancelled', 'Reversed'] },
  }).lean();
  await PayslipBatch.findByIdAndUpdate(batchId, {
    $set: {
      payslip_count: activeSlips.length,
      total_gross_pay: activeSlips.reduce((s, p) => s + (p.gross_pay || 0), 0),
      total_deductions: activeSlips.reduce((s, p) => s + (p.total_deductions || 0), 0),
      total_net_pay: activeSlips.reduce((s, p) => s + (p.net_pay || 0), 0),
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'HR', 'Accountant', 'Viewer', 'Manager', 'Employee', 'Counselor']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await connectDB();
    void Employee;
    void EmployeeContract;
    void SalaryStructure;
    void PayslipBatch;

    const payslip = await Payslip.findById(id)
      .populate(
        'employee_id',
        'employee_id firstName lastName phone email department designation joining_date userId payment_method bank_name bank_branch bank_account_no'
      )
      .populate('contract_id', 'basic_salary start_date end_date bank_name bank_account_no')
      .populate('structure_id', 'name code')
      .populate('batch_id', 'batch_code name status branch')
      .lean();

    if (!payslip) {
      return NextResponse.json({ success: false, message: 'Payslip not found' }, { status: 404 });
    }

    if (!PAYROLL_VIEW_ROLES.includes(auth.user.role)) {
      const empUserId = (payslip.employee_id as any)?.userId?.toString();
      if (!empUserId || empUserId !== auth.user.userId) {
        return NextResponse.json(
          { success: false, message: 'Forbidden. You can only view your own payslips.' },
          { status: 403 }
        );
      }
    }

    const { searchParams } = new URL(req.url);
    if (searchParams.get('format') === 'pdf') {
      const pdfBuf = buildPayslipPdfBuffer(payslip);
      return new NextResponse(new Uint8Array(pdfBuf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${payslip.payslip_no}.pdf"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: payslip,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch payslip' },
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
    await connectDB();

    const payslip = await Payslip.findById(id);
    if (!payslip) {
      return NextResponse.json({ success: false, message: 'Payslip not found' }, { status: 404 });
    }

    if (payslip.batch_id) {
      const parentRun = await PayslipBatch.findById(payslip.batch_id).lean();
      if (parentRun && (parentRun.status === 'Confirmed' || parentRun.status === 'Paid') && body.recompute) {
        return NextResponse.json(
          { success: false, message: `Parent run ${parentRun.batch_code} is ${parentRun.status} and locked.` },
          { status: 400 }
        );
      }
    }

    const oldSnapshot = {
      status: payslip.status,
      gross_pay: payslip.gross_pay,
      total_deductions: payslip.total_deductions,
      net_pay: payslip.net_pay,
      notes: payslip.notes,
    };

    const isDraftEdit =
      body.recompute ||
      body.notes !== undefined ||
      body.bonus_adjustment !== undefined ||
      body.fine_adjustment !== undefined;

    if (isDraftEdit) {
      if (!['Admin', 'HR'].includes(auth.user.role)) {
        return NextResponse.json({ success: false, message: 'Only HR or Admin can edit Draft payslips.' }, { status: 403 });
      }
      if (payslip.status !== 'Draft') {
        return NextResponse.json(
          {
            success: false,
            message: `Payslip ${payslip.payslip_no} is ${payslip.status} and locked from edits.`,
          },
          { status: 400 }
        );
      }

      if (body.recompute) {
        const { settings } = await resolveEffectivePayrollSettings(
          payslip.month,
          payslip.year
        );
        const computed = await computeEmployeePayslipData({
          employeeId: payslip.employee_id.toString(),
          month: payslip.month,
          year: payslip.year,
          settingsOverride: settings,
        });
        payslip.contract_id = computed.contract._id as any;
        payslip.structure_id = computed.structure._id as any;
        payslip.days_basis = computed.days_basis;
        payslip.days_in_month = computed.days_in_month;
        payslip.prorated_days = computed.prorated_days;
        payslip.per_day_rate = computed.per_day_rate;
        payslip.overtime_multiplier = computed.overtime_multiplier;
        payslip.settings_version = settings.version;
        payslip.settings_snapshot = settings as any;
        payslip.attendance_summary = computed.attendance_summary;
        payslip.inputs_snapshot = computed.inputs_snapshot;
        payslip.lines = computed.lines as any;
        payslip.basic_pay = computed.basic_pay;
        payslip.total_allowances = computed.total_allowances;
        payslip.gross_pay = computed.gross_pay;
        payslip.total_deductions = computed.total_deductions;
        payslip.net_pay = computed.net_pay;
        payslip.amount_in_words = computed.amount_in_words;
      }

      if (body.bonus_adjustment !== undefined || body.fine_adjustment !== undefined) {
        const bonusAdj = Math.round(Number(body.bonus_adjustment) || 0);
        const fineAdj = Math.max(0, Math.round(Number(body.fine_adjustment) || 0));
        const filtered = (payslip.lines || []).filter(
          (l: any) => l.code !== 'DRAFT_BONUS_ADJ' && l.code !== 'DRAFT_FINE_ADJ' && l.code !== 'GROSS' && l.code !== 'NET'
        );
        if (bonusAdj > 0) {
          filtered.push({
            name: 'Draft Manual Bonus Adjustment',
            code: 'DRAFT_BONUS_ADJ',
            category: 'ALLOWANCE',
            sequence: 68,
            amount: bonusAdj,
            source: 'monthly_input',
            calculation_note: 'Direct Draft payslip adjustment',
          } as any);
        }
        if (fineAdj > 0) {
          filtered.push({
            name: 'Draft Manual Deduction Adjustment',
            code: 'DRAFT_FINE_ADJ',
            category: 'DEDUCTION',
            sequence: 119,
            amount: fineAdj,
            source: 'monthly_input',
            calculation_note: 'Direct Draft payslip adjustment',
          } as any);
        }

        const basic = filtered
          .filter((l: any) => l.category === 'BASIC')
          .reduce((s: number, l: any) => s + (l.amount || 0), 0);
        const allow = filtered
          .filter((l: any) => l.category === 'ALLOWANCE')
          .reduce((s: number, l: any) => s + (l.amount || 0), 0);
        const ded = filtered
          .filter((l: any) => l.category === 'DEDUCTION')
          .reduce((s: number, l: any) => s + (l.amount || 0), 0);
        const gross = basic + allow;
        const net = gross - ded;

        filtered.push(
          { name: 'Gross Earnings', code: 'GROSS', category: 'GROSS', sequence: 70, amount: gross, source: 'formula' } as any,
          { name: 'Net Payable', code: 'NET', category: 'NET', sequence: 130, amount: net, source: 'formula' } as any
        );
        filtered.sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0));

        payslip.lines = filtered as any;
        payslip.basic_pay = basic;
        payslip.total_allowances = allow;
        payslip.gross_pay = gross;
        payslip.total_deductions = ded;
        payslip.net_pay = net;
        payslip.amount_in_words = amountInWords(net);
      }

      if (body.notes !== undefined) {
        payslip.notes = String(body.notes).trim();
      }
    }

    if (body.status && body.status !== payslip.status) {
      const nextStatus = body.status as PayslipStatus;
      const role = auth.user.role;

      if (nextStatus === 'Verified' && !['Admin', 'HR'].includes(role)) {
        return NextResponse.json({ success: false, message: 'Only HR or Admin can verify.' }, { status: 403 });
      }
      if (nextStatus === 'Confirmed' && role !== 'Admin') {
        return NextResponse.json({ success: false, message: 'Only Admin can confirm.' }, { status: 403 });
      }
      if (nextStatus === 'Paid') {
        return NextResponse.json(
          {
            success: false,
            message:
              'Salary disbursement belongs to Accounts. Use Accounts → Salary Disbursement (/accounts/payroll) to pay Confirmed payroll.',
          },
          { status: 400 }
        );
      }

      const allowedTransitions: Record<PayslipStatus, PayslipStatus[]> = {
        Draft: ['Verified', 'Cancelled'],
        Verified: ['Confirmed', 'Draft', 'Cancelled'],
        Confirmed: ['Paid'],
        Paid: [],
        Reversed: [],
        Cancelled: [],
      };

      if (!allowedTransitions[payslip.status].includes(nextStatus)) {
        return NextResponse.json(
          {
            success: false,
            message: `Invalid state transition from "${payslip.status}" to "${nextStatus}".`,
          },
          { status: 400 }
        );
      }

      payslip.status = nextStatus;
      if (nextStatus === 'Verified') {
        payslip.verified_by = auth.user.name;
        payslip.verified_at = new Date();
      } else if (nextStatus === 'Confirmed') {
        payslip.confirmed_by = auth.user.name;
        payslip.confirmed_at = new Date();
      }
    }

    await payslip.save();
    await syncParentBatchTotals(payslip.batch_id);

    await createAuditLog({
      user: auth.user,
      action: isDraftEdit ? 'PAYSLIP_DRAFT_EDITED' : 'PAYSLIP_STATUS_UPDATED',
      entity: 'Payslip',
      entityId: payslip._id.toString(),
      oldValues: oldSnapshot,
      newValues: {
        payslip_no: payslip.payslip_no,
        status: payslip.status,
        gross_pay: payslip.gross_pay,
        total_deductions: payslip.total_deductions,
        net_pay: payslip.net_pay,
        notes: payslip.notes,
      },
    });

    const populated = await Payslip.findById(payslip._id)
      .populate(
        'employee_id',
        'employee_id firstName lastName phone email department designation payment_method bank_name bank_branch bank_account_no'
      )
      .populate('contract_id', 'basic_salary bank_name bank_account_no')
      .populate('structure_id', 'name code')
      .populate('batch_id', 'batch_code name status branch')
      .lean();

    return NextResponse.json({
      success: true,
      message: `Payslip ${payslip.payslip_no} updated (${payslip.status}).`,
      data: populated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update payslip' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'HR']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await connectDB();
    const payslip = await Payslip.findById(id);
    if (!payslip) {
      return NextResponse.json({ success: false, message: 'Payslip not found' }, { status: 404 });
    }
    if (payslip.status !== 'Draft') {
      return NextResponse.json(
        {
          success: false,
          message: `Only Draft payslips can be deleted (current status: ${payslip.status}). Confirmed runs require Reversal instead.`,
        },
        { status: 400 }
      );
    }

    const batchId = payslip.batch_id;
    await Payslip.findByIdAndDelete(id);
    await syncParentBatchTotals(batchId);

    await createAuditLog({
      user: auth.user,
      action: 'PAYSLIP_DELETED',
      entity: 'Payslip',
      entityId: id,
      oldValues: { payslip_no: payslip.payslip_no, net_pay: payslip.net_pay },
    });

    return NextResponse.json({
      success: true,
      message: `Draft payslip ${payslip.payslip_no} deleted.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete payslip' },
      { status: 500 }
    );
  }
}
