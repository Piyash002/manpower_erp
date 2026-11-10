import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Payslip } from '@/models/Payslip';
import { Employee } from '@/models/Employee';
import { ensurePayrollSeeded } from '@/lib/payroll-seed';
import {
  assertNoDuplicatePayslip,
  computeEmployeePayslipData,
  generateNextPayslipNo,
} from '@/lib/payroll-engine';

interface GeneratePayslipBody {
  employee_id: string;
  month: number;
  year: number;
  notes?: string;
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensurePayrollSeeded();

    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get('month');
    const yearParam = searchParams.get('year');
    const statusParam = searchParams.get('status');
    const departmentParam = searchParams.get('department');
    const batchIdParam = searchParams.get('batch_id');

    const isAdmin = auth.user.role === 'Admin';
    const filter: Record<string, any> = {};

    if (!isAdmin) {
      // Non-admin employees can ONLY view their own payslips
      const myEmp = await Employee.findOne({ userId: auth.user.userId }).lean();
      if (!myEmp) {
        return NextResponse.json({
          success: true,
          data: {
            payslips: [],
            isAdmin: false,
            myEmployee: null,
          },
        });
      }
      filter.employee_id = myEmp._id;
    }

    if (monthParam && monthParam !== 'all') filter.month = parseInt(monthParam, 10);
    if (yearParam && yearParam !== 'all') filter.year = parseInt(yearParam, 10);
    if (statusParam && statusParam !== 'all') filter.status = statusParam;
    if (batchIdParam && batchIdParam !== 'all') filter.batch_id = batchIdParam;

    let payslips = await Payslip.find(filter)
      .populate('employee_id', 'employee_id firstName lastName phone department designation')
      .populate('structure_id', 'name code')
      .populate('batch_id', 'batch_code name')
      .sort({ year: -1, month: -1, createdAt: -1 })
      .lean();

    if (departmentParam && departmentParam !== 'all') {
      payslips = payslips.filter((p: any) => p.employee_id?.department === departmentParam);
    }

    const myEmployee = isAdmin
      ? null
      : await Employee.findOne({ userId: auth.user.userId })
          .select('employee_id firstName lastName department designation')
          .lean();

    return NextResponse.json({
      success: true,
      data: {
        payslips,
        isAdmin,
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

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
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

    // Validation: prevent duplicate non-cancelled payslip for same employee + month + year
    await assertNoDuplicatePayslip(body.employee_id, month, year);

    const computed = await computeEmployeePayslipData({
      employeeId: body.employee_id,
      month,
      year,
    });

    const payslipNo = await generateNextPayslipNo(month, year);

    const payslip = await Payslip.create({
      payslip_no: payslipNo,
      employee_id: computed.employee._id,
      contract_id: computed.contract._id,
      structure_id: computed.structure._id,
      month,
      year,
      attendance_summary: computed.attendance_summary,
      inputs_snapshot: computed.inputs_snapshot,
      lines: computed.lines,
      basic_pay: computed.basic_pay,
      total_allowances: computed.total_allowances,
      gross_pay: computed.gross_pay,
      total_deductions: computed.total_deductions,
      net_pay: computed.net_pay,
      status: 'Draft',
      notes: body.notes?.trim() || '',
      created_by: auth.user.name,
    });

    await createAuditLog({
      user: auth.user,
      action: 'PAYSLIP_GENERATED',
      entity: 'Payslip',
      entityId: payslip._id.toString(),
      newValues: {
        payslip_no: payslip.payslip_no,
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
      .lean();

    return NextResponse.json(
      {
        success: true,
        message: `Payslip ${payslip.payslip_no} generated in Draft state.`,
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
      { success: false, message: error.message || 'Failed to generate payslip' },
      { status }
    );
  }
}

