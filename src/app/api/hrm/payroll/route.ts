import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Payroll, PayrollStatus } from '@/models/Payroll';

interface UpdatePayrollBody {
  payroll_id: string;
  deductions?: number;
  status?: PayrollStatus;
  notes?: string;
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const month = parseInt(searchParams.get('month') || String(now.getMonth() + 1), 10);
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()), 10);

    const records = await Payroll.find({ month, year })
      .populate('employee_id', 'employee_id firstName lastName phone department designation commission_rate')
      .sort({ net_payable: -1 })
      .lean();

    const totals = records.reduce(
      (acc, r: any) => {
        acc.totalBasic += r.basic_salary || 0;
        acc.totalCommissions += r.commission_earned || 0;
        acc.totalDeductions += r.deductions || 0;
        acc.totalNetPayable += r.net_payable || 0;
        if (r.status === 'Paid') acc.paidCount++;
        return acc;
      },
      { totalBasic: 0, totalCommissions: 0, totalDeductions: 0, totalNetPayable: 0, paidCount: 0 }
    );

    return NextResponse.json({
      success: true,
      data: {
        month,
        year,
        records,
        totals,
      },
    });
  } catch (error: any) {
    console.error('GET /api/hrm/payroll error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch payroll records' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Accountant']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as UpdatePayrollBody;
    if (!body.payroll_id) {
      return NextResponse.json({ success: false, message: 'payroll_id is required.' }, { status: 400 });
    }

    await connectDB();
    const payroll = await Payroll.findById(body.payroll_id);
    if (!payroll) {
      return NextResponse.json({ success: false, message: 'Payroll record not found.' }, { status: 404 });
    }

    const oldValues = {
      deductions: payroll.deductions,
      net_payable: payroll.net_payable,
      status: payroll.status,
    };

    if (body.deductions !== undefined) {
      payroll.deductions = Math.max(0, Math.round(Number(body.deductions) || 0));
      payroll.net_payable = Math.max(
        0,
        Math.round((payroll.basic_salary || 0) + (payroll.commission_earned || 0) - payroll.deductions)
      );
    }

    if (body.notes !== undefined) {
      payroll.notes = body.notes.trim();
    }

    if (body.status && ['Draft', 'Processed', 'Paid'].includes(body.status)) {
      payroll.status = body.status;
      if (body.status === 'Paid' && !payroll.paid_on) {
        payroll.paid_on = new Date();
      } else if (body.status !== 'Paid') {
        payroll.paid_on = null;
      }
    }

    await payroll.save();

    await createAuditLog({
      user: auth.user,
      action: 'PAYROLL_UPDATED',
      entity: 'Payroll',
      entityId: payroll._id.toString(),
      oldValues,
      newValues: {
        deductions: payroll.deductions,
        net_payable: payroll.net_payable,
        status: payroll.status,
      },
    });

    const populated = await Payroll.findById(payroll._id)
      .populate('employee_id', 'employee_id firstName lastName phone department designation commission_rate')
      .lean();

    return NextResponse.json({
      success: true,
      message: 'Payroll record updated successfully.',
      data: populated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update payroll' },
      { status: 500 }
    );
  }
}

