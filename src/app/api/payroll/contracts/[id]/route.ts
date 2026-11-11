import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { EmployeeContract } from '@/models/EmployeeContract';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'HR']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    const body = await req.json();
    await connectDB();

    const contract = await EmployeeContract.findById(id);
    if (!contract) {
      return NextResponse.json({ success: false, message: 'Contract not found' }, { status: 404 });
    }

    const oldValues = {
      structure_id: contract.structure_id,
      basic_salary: contract.basic_salary,
      status: contract.status,
    };

    if (body.status === 'Active' && contract.status !== 'Active') {
      const otherActive = await EmployeeContract.findOne({
        employee_id: contract.employee_id,
        status: 'Active',
        _id: { $ne: id },
      });
      if (otherActive) {
        return NextResponse.json(
          {
            success: false,
            message: 'Another Active contract already exists for this employee.',
          },
          { status: 409 }
        );
      }
    }

    if (body.structure_id !== undefined) contract.structure_id = body.structure_id;
    if (body.basic_salary !== undefined) {
      contract.basic_salary = Math.max(0, Math.round(Number(body.basic_salary) || 0));
    }
    if (body.start_date !== undefined) contract.start_date = new Date(body.start_date);
    if (body.end_date !== undefined) contract.end_date = body.end_date ? new Date(body.end_date) : null;
    if (body.status !== undefined) contract.status = body.status;
    if (body.bank_name !== undefined) contract.bank_name = body.bank_name.trim();
    if (body.bank_account_no !== undefined) contract.bank_account_no = body.bank_account_no.trim();
    if (body.notes !== undefined) contract.notes = body.notes.trim();

    if (contract.end_date && contract.end_date < contract.start_date) {
      return NextResponse.json(
        { success: false, message: 'End date cannot be earlier than start date.' },
        { status: 400 }
      );
    }

    await contract.save();

    await createAuditLog({
      user: auth.user,
      action: 'EMPLOYEE_CONTRACT_UPDATED',
      entity: 'EmployeeContract',
      entityId: contract._id.toString(),
      oldValues,
      newValues: {
        structure_id: contract.structure_id,
        basic_salary: contract.basic_salary,
        status: contract.status,
      },
    });

    const populated = await EmployeeContract.findById(contract._id)
      .populate('employee_id', 'employee_id firstName lastName phone department designation status')
      .populate('structure_id', 'name code')
      .lean();

    return NextResponse.json({
      success: true,
      message: 'Employee contract updated.',
      data: populated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update contract' },
      { status: 500 }
    );
  }
}

