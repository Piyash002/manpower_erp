import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Employee, EmployeeDepartment, EmployeeStatus } from '@/models/Employee';
import { Batch } from '@/models/Batch';
import { Payroll } from '@/models/Payroll';
import { Payslip } from '@/models/Payslip';
import { EmployeeContract } from '@/models/EmployeeContract';
import { Student } from '@/models/Student';

interface UpdateEmployeeBody {
  userId?: string | null;
  biometric_id?: string | null;
  shift?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  department?: EmployeeDepartment;
  designation?: string;
  basic_salary?: number;
  commission_rate?: number;
  joining_date?: string;
  status?: EmployeeStatus;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await connectDB();
    const employee = await Employee.findById(id)
      .populate('userId', 'name username role active')
      .lean();

    if (!employee) {
      return NextResponse.json({ success: false, message: 'Employee not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: employee,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch employee' },
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
    const body = (await req.json()) as UpdateEmployeeBody;
    await connectDB();

    const employee = await Employee.findById(id);
    if (!employee) {
      return NextResponse.json({ success: false, message: 'Employee not found' }, { status: 404 });
    }

    const oldValues = {
      firstName: employee.firstName,
      lastName: employee.lastName,
      department: employee.department,
      designation: employee.designation,
      basic_salary: employee.basic_salary,
      commission_rate: employee.commission_rate,
      status: employee.status,
      userId: employee.userId,
    };

    if (body.userId !== undefined) {
      const cleanUserId = body.userId && body.userId !== '' ? body.userId : null;
      if (cleanUserId) {
        const conflict = await Employee.findOne({ userId: cleanUserId, _id: { $ne: id } });
        if (conflict) {
          return NextResponse.json(
            {
              success: false,
              message: `ERP user is already linked to ${conflict.employee_id}.`,
            },
            { status: 409 }
          );
        }
      }
      employee.userId = cleanUserId as any;
    }

    if (body.biometric_id !== undefined) {
      const cleanBio = body.biometric_id?.trim() ? body.biometric_id.trim().toUpperCase() : undefined;
      if (cleanBio) {
        const bioDup = await Employee.findOne({ biometric_id: cleanBio, _id: { $ne: id } });
        if (bioDup) {
          return NextResponse.json(
            {
              success: false,
              message: `Biometric ID "${cleanBio}" is already mapped to ${bioDup.employee_id}.`,
            },
            { status: 409 }
          );
        }
      }
      employee.biometric_id = cleanBio;
    }
    if (body.shift !== undefined) employee.shift = body.shift.trim() || 'Regular';
    if (body.firstName !== undefined) employee.firstName = body.firstName.trim();
    if (body.lastName !== undefined) employee.lastName = body.lastName.trim();
    if (body.phone !== undefined) employee.phone = body.phone.trim();
    if (body.email !== undefined) employee.email = body.email.trim().toLowerCase();
    if (body.department !== undefined) employee.department = body.department;
    if (body.designation !== undefined) employee.designation = body.designation.trim();
    if (body.basic_salary !== undefined) {
      employee.basic_salary = Math.max(0, Math.round(Number(body.basic_salary) || 0));
    }
    if (body.commission_rate !== undefined) {
      employee.commission_rate = Math.max(0, Math.min(100, Number(body.commission_rate) || 0));
    }
    if (body.joining_date !== undefined && body.joining_date) {
      employee.joining_date = new Date(body.joining_date);
    }
    if (body.status !== undefined) employee.status = body.status;

    await employee.save();

    // Sync cached batch instructor string if employee name changed
    await Batch.updateMany(
      { instructor_id: employee._id },
      { $set: { instructor: `${employee.firstName} ${employee.lastName}` } }
    );

    await createAuditLog({
      user: auth.user,
      action: 'EMPLOYEE_UPDATED',
      entity: 'Employee',
      entityId: employee._id.toString(),
      oldValues,
      newValues: {
        firstName: employee.firstName,
        lastName: employee.lastName,
        department: employee.department,
        designation: employee.designation,
        basic_salary: employee.basic_salary,
        commission_rate: employee.commission_rate,
        status: employee.status,
      },
    });

    const populated = await Employee.findById(employee._id)
      .populate('userId', 'name username role active')
      .lean();

    return NextResponse.json({
      success: true,
      message: `Employee ${employee.employee_id} updated successfully.`,
      data: populated,
    });
  } catch (error: any) {
    console.error('PUT /api/hrm/employees/[id] error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update employee' },
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
    const employee = await Employee.findById(id);
    if (!employee) {
      return NextResponse.json({ success: false, message: 'Employee not found' }, { status: 404 });
    }

    const [payrollCount, payslipCount, contractCount, referralCount] = await Promise.all([
      Payroll.countDocuments({ employee_id: id }),
      Payslip.countDocuments({ employee_id: id }),
      EmployeeContract.countDocuments({ employee_id: id }),
      Student.countDocuments({ referred_by_agent: id }),
    ]);

    if (payrollCount > 0 || payslipCount > 0 || contractCount > 0 || referralCount > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete ${employee.employee_id} because they have ${payslipCount + payrollCount} payroll/payslip record(s), ${contractCount} contract(s), and ${referralCount} student referral(s). Mark status as Inactive instead.`,
        },
        { status: 400 }
      );
    }

    await Employee.findByIdAndDelete(id);

    await createAuditLog({
      user: auth.user,
      action: 'EMPLOYEE_DELETED',
      entity: 'Employee',
      entityId: id,
      oldValues: {
        employee_id: employee.employee_id,
        name: `${employee.firstName} ${employee.lastName}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Employee ${employee.employee_id} removed successfully.`,
      data: { _id: id },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete employee' },
      { status: 500 }
    );
  }
}

