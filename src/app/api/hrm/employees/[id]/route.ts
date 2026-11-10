import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import {
  Employee,
  EmployeeDepartment,
  EmployeeStatus,
  EmployeeType,
  GenderType,
  IEmployeeDocumentItem,
  MaritalStatusType,
  PaymentMethodType,
} from '@/models/Employee';
import { EmployeeContract } from '@/models/EmployeeContract';
import { Department } from '@/models/Department';
import { Designation } from '@/models/Designation';
import { Batch } from '@/models/Batch';
import {
  ensureDepartmentsAndDesignationsSeeded,
  resolveOrCreateDepartment,
  resolveOrCreateDesignation,
} from '@/lib/hrm-seed';
import {
  checkEmployeeUniqueness,
  resolveOptionalScheduleId,
  syncEmployeeContractAndSalaryHistory,
} from '@/lib/employee-validation';

interface UpdateEmployeeBody {
  userId?: string | null;
  biometric_id?: string | null;
  shift?: string;
  schedule_id?: string | null;
  photo_url?: string;
  firstName?: string;
  lastName?: string;
  father_name?: string;
  mother_name?: string;
  date_of_birth?: string | null;
  gender?: GenderType;
  nid_number?: string | null;
  blood_group?: string;
  marital_status?: MaritalStatusType;
  phone?: string;
  email?: string | null;
  present_address?: string;
  permanent_address?: string;
  emergency_contact?: { name?: string; relation?: string; phone?: string };
  department?: EmployeeDepartment;
  department_id?: string;
  designation?: string;
  designation_id?: string;
  manager_id?: string | null;
  employee_type?: EmployeeType;
  basic_salary?: number;
  commission_rate?: number;
  joining_date?: string;
  resignation_date?: string | null;
  status?: EmployeeStatus;
  payment_method?: PaymentMethodType;
  bank_name?: string;
  bank_branch?: string;
  bank_account_no?: string;
  structure_id?: string;
  salary_change_reason?: string;
  documents?: IEmployeeDocumentItem[];
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, [
    'Admin',
    'HR',
    'Manager',
    'Counselor',
    'Accountant',
    'Viewer',
    'Employee',
  ]);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await connectDB();
    void Department;
    void Designation;

    const employee = await Employee.findById(id)
      .populate('userId', 'name username role active')
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code grade_label level')
      .populate('manager_id', 'employee_id firstName lastName designation')
      .populate('schedule_id', 'name code start_time end_time shift')
      .lean();

    if (!employee) {
      return NextResponse.json({ success: false, message: 'Employee not found' }, { status: 404 });
    }

    const contract = await EmployeeContract.findOne({
      employee_id: employee._id,
      status: 'Active',
    })
      .select('structure_id basic_salary start_date')
      .lean();

    return NextResponse.json({
      success: true,
      data: {
        ...employee,
        contract_structure_id: contract?.structure_id?.toString() || '',
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch employee';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'HR']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    const body = (await req.json()) as UpdateEmployeeBody;
    await connectDB();
    await ensureDepartmentsAndDesignationsSeeded();

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
      manager_id: employee.manager_id,
    };

    const nextEmail =
      body.email !== undefined
        ? body.email?.trim()
          ? body.email.trim().toLowerCase()
          : undefined
        : employee.email;
    const nextNid =
      body.nid_number !== undefined
        ? body.nid_number?.trim()
          ? body.nid_number.trim()
          : undefined
        : employee.nid_number;
    const nextBio =
      body.biometric_id !== undefined
        ? body.biometric_id?.trim()
          ? body.biometric_id.trim().toUpperCase()
          : undefined
        : employee.biometric_id;
    const nextUserId =
      body.userId !== undefined ? (body.userId && body.userId !== '' ? body.userId : null) : undefined;
    const nextPhone = body.phone !== undefined ? body.phone.trim() : employee.phone;

    const dupError = await checkEmployeeUniqueness({
      excludeId: id,
      email: body.email !== undefined ? nextEmail : undefined,
      phone: body.phone !== undefined ? nextPhone : undefined,
      nid_number: body.nid_number !== undefined ? nextNid : undefined,
      biometric_id: body.biometric_id !== undefined ? nextBio || undefined : undefined,
      userId: nextUserId || undefined,
    });
    if (dupError) {
      return NextResponse.json({ success: false, message: dupError }, { status: 409 });
    }

    if (body.userId !== undefined) {
      employee.userId = nextUserId as unknown as typeof employee.userId;
    }
    if (body.biometric_id !== undefined) employee.biometric_id = nextBio;
    if (body.nid_number !== undefined) employee.nid_number = nextNid;
    if (body.email !== undefined) employee.email = nextEmail;
    if (body.phone !== undefined) employee.phone = nextPhone;
    if (body.shift !== undefined) employee.shift = body.shift.trim() || 'Regular';
    if (body.schedule_id !== undefined) {
      const resolvedSched = await resolveOptionalScheduleId(
        body.schedule_id,
        body.shift || employee.shift
      );
      employee.schedule_id = resolvedSched as unknown as typeof employee.schedule_id;
    }

    if (body.photo_url !== undefined) employee.photo_url = body.photo_url.trim();
    if (body.firstName !== undefined) employee.firstName = body.firstName.trim();
    if (body.lastName !== undefined) employee.lastName = body.lastName.trim();
    if (body.father_name !== undefined) employee.father_name = body.father_name.trim();
    if (body.mother_name !== undefined) employee.mother_name = body.mother_name.trim();
    if (body.date_of_birth !== undefined) {
      employee.date_of_birth = body.date_of_birth ? new Date(body.date_of_birth) : null;
    }
    if (body.gender !== undefined) employee.gender = body.gender;
    if (body.blood_group !== undefined) employee.blood_group = body.blood_group.trim();
    if (body.marital_status !== undefined) employee.marital_status = body.marital_status;
    if (body.present_address !== undefined) employee.present_address = body.present_address.trim();
    if (body.permanent_address !== undefined) employee.permanent_address = body.permanent_address.trim();
    if (body.emergency_contact !== undefined) {
      employee.emergency_contact = {
        name: body.emergency_contact.name?.trim() || '',
        relation: body.emergency_contact.relation?.trim() || '',
        phone: body.emergency_contact.phone?.trim() || '',
      };
    }

    if (body.department_id !== undefined || body.department !== undefined) {
      const deptDoc = await resolveOrCreateDepartment(body.department_id || body.department);
      if (deptDoc) {
        employee.department = deptDoc.name;
        employee.department_id = deptDoc._id as unknown as typeof employee.department_id;
      }
    }

    if (body.designation_id !== undefined || body.designation !== undefined) {
      const desigDoc = await resolveOrCreateDesignation(
        body.designation_id || body.designation,
        employee.department_id?.toString()
      );
      if (desigDoc) {
        employee.designation = desigDoc.name;
        employee.designation_id = desigDoc._id as unknown as typeof employee.designation_id;
      }
    }

    if (body.manager_id !== undefined) {
      if (body.manager_id === id) {
        return NextResponse.json(
          { success: false, message: 'An employee cannot report to themselves.' },
          { status: 400 }
        );
      }
      employee.manager_id = (body.manager_id && body.manager_id !== ''
        ? body.manager_id
        : null) as unknown as typeof employee.manager_id;
    }

    if (body.employee_type !== undefined) employee.employee_type = body.employee_type;

    const previousBasic = employee.basic_salary;
    if (body.basic_salary !== undefined) {
      employee.basic_salary = Math.max(0, Math.round(Number(body.basic_salary) || 0));
    }
    if (body.commission_rate !== undefined) {
      employee.commission_rate = Math.max(0, Math.min(100, Number(body.commission_rate) || 0));
    }
    if (body.joining_date !== undefined && body.joining_date) {
      employee.joining_date = new Date(body.joining_date);
    }
    if (body.resignation_date !== undefined) {
      employee.resignation_date = body.resignation_date ? new Date(body.resignation_date) : null;
    }
    if (body.status !== undefined) employee.status = body.status;

    if (body.payment_method !== undefined) employee.payment_method = body.payment_method;
    if (body.bank_name !== undefined) employee.bank_name = body.bank_name.trim();
    if (body.bank_branch !== undefined) employee.bank_branch = body.bank_branch.trim();
    if (body.bank_account_no !== undefined) employee.bank_account_no = body.bank_account_no.trim();
    if (Array.isArray(body.documents)) employee.documents = body.documents;

    await employee.save();

    if (body.basic_salary !== undefined || body.structure_id !== undefined) {
      await syncEmployeeContractAndSalaryHistory({
        employeeId: employee._id.toString(),
        basicSalary: employee.basic_salary,
        previousBasicSalary: previousBasic,
        structureId: body.structure_id || null,
        bankName: employee.bank_name,
        bankAccountNo: employee.bank_account_no,
        startDate: employee.joining_date,
        changedBy: auth.user.name,
        reason: body.salary_change_reason?.trim() || 'Employee record updated',
      });
    }

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
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code grade_label level')
      .populate('manager_id', 'employee_id firstName lastName')
      .lean();

    return NextResponse.json({
      success: true,
      message: `Employee ${employee.employee_id} updated successfully.`,
      data: populated,
    });
  } catch (error: unknown) {
    console.error('PUT /api/hrm/employees/[id] error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to update employee';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
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
    const employee = await Employee.findById(id);
    if (!employee) {
      return NextResponse.json({ success: false, message: 'Employee not found' }, { status: 404 });
    }

    const oldStatus = employee.status;
    employee.is_deleted = true;
    employee.archived_at = new Date();
    employee.status = 'Inactive';
    await employee.save();

    await createAuditLog({
      user: auth.user,
      action: 'EMPLOYEE_ARCHIVED',
      entity: 'Employee',
      entityId: id,
      oldValues: {
        employee_id: employee.employee_id,
        name: `${employee.firstName} ${employee.lastName}`,
        status: oldStatus,
      },
      newValues: { is_deleted: true, archived_at: employee.archived_at, status: 'Inactive' },
    });

    return NextResponse.json({
      success: true,
      message: `Employee ${employee.employee_id} archived safely.`,
      data: { _id: id },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to archive employee';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
