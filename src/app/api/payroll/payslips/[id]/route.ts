import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Payslip, PayslipStatus } from '@/models/Payslip';
import { Employee } from '@/models/Employee';
import { EmployeeContract } from '@/models/EmployeeContract';
import { SalaryStructure } from '@/models/SalaryStructure';
import { PayslipBatch } from '@/models/PayslipBatch';
import { computeEmployeePayslipData } from '@/lib/payroll-engine';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await connectDB();

    // Ensure referenced schemas are registered
    void Employee;
    void EmployeeContract;
    void SalaryStructure;
    void PayslipBatch;

    const payslip = await Payslip.findById(id)
      .populate('employee_id', 'employee_id firstName lastName phone email department designation joining_date userId')
      .populate('contract_id', 'basic_salary start_date end_date bank_name bank_account_no')
      .populate('structure_id', 'name code')
      .populate('batch_id', 'batch_code name')
      .lean();

    if (!payslip) {
      return NextResponse.json({ success: false, message: 'Payslip not found' }, { status: 404 });
    }

    if (auth.user.role !== 'Admin') {
      const empUserId = (payslip.employee_id as any)?.userId?.toString();
      if (!empUserId || empUserId !== auth.user.userId) {
        return NextResponse.json(
          { success: false, message: 'Forbidden. You can only view your own payslips.' },
          { status: 403 }
        );
      }
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
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    const body = await req.json();
    await connectDB();

    const payslip = await Payslip.findById(id);
    if (!payslip) {
      return NextResponse.json({ success: false, message: 'Payslip not found' }, { status: 404 });
    }

    const oldStatus = payslip.status;

    // Recompute or edit rules ONLY allowed while status === 'Draft'
    if (body.recompute || body.notes !== undefined) {
      if (payslip.status !== 'Draft') {
        return NextResponse.json(
          {
            success: false,
            message: `Payslip ${payslip.payslip_no} is ${payslip.status} and cannot be edited or recomputed.`,
          },
          { status: 400 }
        );
      }

      if (body.recompute) {
        const computed = await computeEmployeePayslipData({
          employeeId: payslip.employee_id.toString(),
          month: payslip.month,
          year: payslip.year,
        });
        payslip.contract_id = computed.contract._id as any;
        payslip.structure_id = computed.structure._id as any;
        payslip.attendance_summary = computed.attendance_summary;
        payslip.inputs_snapshot = computed.inputs_snapshot;
        payslip.lines = computed.lines as any;
        payslip.basic_pay = computed.basic_pay;
        payslip.total_allowances = computed.total_allowances;
        payslip.gross_pay = computed.gross_pay;
        payslip.total_deductions = computed.total_deductions;
        payslip.net_pay = computed.net_pay;
      }

      if (body.notes !== undefined) {
        payslip.notes = String(body.notes).trim();
      }
    }

    if (body.status && body.status !== payslip.status) {
      const nextStatus = body.status as PayslipStatus;

      const allowedTransitions: Record<PayslipStatus, PayslipStatus[]> = {
        Draft: ['Confirmed', 'Cancelled'],
        Confirmed: ['Paid', 'Cancelled'],
        Paid: [],
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
      if (nextStatus === 'Confirmed') payslip.confirmed_at = new Date();
      if (nextStatus === 'Paid') payslip.paid_at = new Date();
    }

    await payslip.save();

    await createAuditLog({
      user: auth.user,
      action: 'PAYSLIP_UPDATED',
      entity: 'Payslip',
      entityId: payslip._id.toString(),
      oldValues: { status: oldStatus },
      newValues: {
        payslip_no: payslip.payslip_no,
        status: payslip.status,
        net_pay: payslip.net_pay,
      },
    });

    const populated = await Payslip.findById(payslip._id)
      .populate('employee_id', 'employee_id firstName lastName phone department designation')
      .populate('structure_id', 'name code')
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
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await connectDB();
    const payslip = await Payslip.findById(id);
    if (!payslip) {
      return NextResponse.json({ success: false, message: 'Payslip not found' }, { status: 404 });
    }

    if (payslip.status === 'Confirmed' || payslip.status === 'Paid') {
      return NextResponse.json(
        {
          success: false,
          message: `Confirmed or Paid payslips cannot be deleted.`,
        },
        { status: 400 }
      );
    }

    await Payslip.findByIdAndDelete(id);

    await createAuditLog({
      user: auth.user,
      action: 'PAYSLIP_DELETED',
      entity: 'Payslip',
      entityId: id,
      oldValues: { payslip_no: payslip.payslip_no, status: payslip.status },
    });

    return NextResponse.json({
      success: true,
      message: `Payslip ${payslip.payslip_no} deleted.`,
      data: { _id: id },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete payslip' },
      { status: 500 }
    );
  }
}

