import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Employee, EmployeeDepartment, EmployeeStatus } from '@/models/Employee';
import { generateEmployeeId } from '@/models/Counter';

interface CreateEmployeeBody {
  userId?: string | null;
  employee_id?: string;
  biometric_id?: string | null;
  shift?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  department: EmployeeDepartment;
  designation: string;
  basic_salary: number;
  commission_rate?: number;
  joining_date?: string;
  status?: EmployeeStatus;
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const department = searchParams.get('department');
    const status = searchParams.get('status');
    const search = searchParams.get('search')?.trim();

    const filter: Record<string, any> = {};
    if (department && department !== 'all') filter.department = department;
    if (status && status !== 'all') filter.status = status;
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { employee_id: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { designation: { $regex: search, $options: 'i' } },
      ];
    }

    const employees = await Employee.find(filter)
      .populate('userId', 'name username role active')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: employees,
    });
  } catch (error: any) {
    console.error('GET /api/hrm/employees error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch employees' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as CreateEmployeeBody;
    const {
      userId,
      employee_id,
      biometric_id,
      shift,
      firstName,
      lastName,
      phone,
      email,
      department,
      designation,
      basic_salary,
      commission_rate,
      joining_date,
      status,
    } = body;

    if (!firstName?.trim() || !lastName?.trim() || !phone?.trim() || !designation?.trim() || !department) {
      return NextResponse.json(
        {
          success: false,
          message: 'First Name, Last Name, Phone, Department, and Designation are required.',
        },
        { status: 400 }
      );
    }

    await connectDB();

    const finalEmpId = employee_id?.trim()
      ? employee_id.trim().toUpperCase()
      : await generateEmployeeId();

    const existingId = await Employee.findOne({ employee_id: finalEmpId });
    if (existingId) {
      return NextResponse.json(
        { success: false, message: `Employee ID "${finalEmpId}" already exists.` },
        { status: 409 }
      );
    }

    const cleanUserId = userId && userId !== '' ? userId : null;
    if (cleanUserId) {
      const existingLinked = await Employee.findOne({ userId: cleanUserId });
      if (existingLinked) {
        return NextResponse.json(
          {
            success: false,
            message: `Selected ERP user is already linked to ${existingLinked.employee_id} (${existingLinked.firstName} ${existingLinked.lastName}).`,
          },
          { status: 409 }
        );
      }
    }

    const defaultCommission =
      commission_rate !== undefined
        ? Math.max(0, Math.min(100, Number(commission_rate)))
        : department === 'Agent'
          ? 5
          : 0;

    const cleanBioId = biometric_id?.trim() ? biometric_id.trim().toUpperCase() : null;
    if (cleanBioId) {
      const bioDup = await Employee.findOne({ biometric_id: cleanBioId });
      if (bioDup) {
        return NextResponse.json(
          {
            success: false,
            message: `Biometric ID "${cleanBioId}" is already assigned to ${bioDup.employee_id}.`,
          },
          { status: 409 }
        );
      }
    }

    const employee = await Employee.create({
      userId: cleanUserId,
      employee_id: finalEmpId,
      biometric_id: cleanBioId,
      shift: shift?.trim() || 'Regular',
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      email: email ? email.trim().toLowerCase() : '',
      department,
      designation: designation.trim(),
      basic_salary: Math.max(0, Math.round(Number(basic_salary) || 0)),
      commission_rate: defaultCommission,
      joining_date: joining_date ? new Date(joining_date) : new Date(),
      status: status || 'Active',
    });

    await createAuditLog({
      user: auth.user,
      action: 'EMPLOYEE_CREATED',
      entity: 'Employee',
      entityId: employee._id.toString(),
      newValues: {
        employee_id: employee.employee_id,
        name: `${employee.firstName} ${employee.lastName}`,
        department: employee.department,
        basic_salary: employee.basic_salary,
        commission_rate: employee.commission_rate,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `Employee ${employee.employee_id} created successfully.`,
        data: employee,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/hrm/employees error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to create employee' },
      { status: 500 }
    );
  }
}

