import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { EmployeeContract, ContractStatus } from '@/models/EmployeeContract';
import { Employee } from '@/models/Employee';
import { SalaryStructure } from '@/models/SalaryStructure';
import { ensurePayrollSeeded } from '@/lib/payroll-seed';

interface CreateContractBody {
  employee_id: string;
  structure_id: string;
  basic_salary: number;
  start_date: string;
  end_date?: string | null;
  status?: ContractStatus;
  bank_name?: string;
  bank_account_no?: string;
  notes?: string;
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await ensurePayrollSeeded();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const employeeId = searchParams.get('employee_id');

    const filter: Record<string, any> = {};
    if (status && status !== 'all') filter.status = status;
    if (employeeId) filter.employee_id = employeeId;

    const contracts = await EmployeeContract.find(filter)
      .populate('employee_id', 'employee_id firstName lastName phone department designation status')
      .populate('structure_id', 'name code')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: contracts,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load contracts' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as CreateContractBody;
    if (!body.employee_id || !body.structure_id || body.basic_salary === undefined || !body.start_date) {
      return NextResponse.json(
        {
          success: false,
          message: 'employee_id, structure_id, basic_salary, and start_date are required.',
        },
        { status: 400 }
      );
    }

    await connectDB();

    const [emp, structure] = await Promise.all([
      Employee.findById(body.employee_id),
      SalaryStructure.findById(body.structure_id),
    ]);
    if (!emp) {
      return NextResponse.json({ success: false, message: 'Employee not found' }, { status: 404 });
    }
    if (!structure) {
      return NextResponse.json({ success: false, message: 'Salary Structure not found' }, { status: 404 });
    }

    const start = new Date(body.start_date);
    const end = body.end_date ? new Date(body.end_date) : null;
    if (end && end < start) {
      return NextResponse.json(
        { success: false, message: 'Contract end date cannot be earlier than start date.' },
        { status: 400 }
      );
    }

    const targetStatus: ContractStatus = body.status || 'Active';
    if (targetStatus === 'Active') {
      const existingActive = await EmployeeContract.findOne({
        employee_id: body.employee_id,
        status: 'Active',
      });
      if (existingActive) {
        return NextResponse.json(
          {
            success: false,
            message: `${emp.firstName} ${emp.lastName} already has an Active salary contract. Close/expire it before creating a new Active contract.`,
          },
          { status: 409 }
        );
      }
    }

    const contract = await EmployeeContract.create({
      employee_id: body.employee_id,
      structure_id: body.structure_id,
      basic_salary: Math.max(0, Math.round(Number(body.basic_salary) || 0)),
      start_date: start,
      end_date: end,
      status: targetStatus,
      bank_name: body.bank_name?.trim() || '',
      bank_account_no: body.bank_account_no?.trim() || '',
      notes: body.notes?.trim() || '',
    });

    await createAuditLog({
      user: auth.user,
      action: 'EMPLOYEE_CONTRACT_CREATED',
      entity: 'EmployeeContract',
      entityId: contract._id.toString(),
      newValues: {
        employee_id: emp.employee_id,
        structure: structure.code,
        basic_salary: contract.basic_salary,
        status: contract.status,
      },
    });

    const populated = await EmployeeContract.findById(contract._id)
      .populate('employee_id', 'employee_id firstName lastName phone department designation status')
      .populate('structure_id', 'name code')
      .lean();

    return NextResponse.json(
      {
        success: true,
        message: `Contract assigned to ${emp.firstName} ${emp.lastName}.`,
        data: populated,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create contract' },
      { status: 500 }
    );
  }
}

