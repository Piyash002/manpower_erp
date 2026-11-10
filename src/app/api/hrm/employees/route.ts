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
import { generateEmployeeId } from '@/models/Counter';
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

interface CreateEmployeeBody {
  userId?: string | null;
  employee_id?: string;
  biometric_id?: string | null;
  shift?: string;
  schedule_id?: string | null;
  photo_url?: string;
  firstName: string;
  lastName: string;
  father_name?: string;
  mother_name?: string;
  date_of_birth?: string;
  gender?: GenderType;
  nid_number?: string;
  blood_group?: string;
  marital_status?: MaritalStatusType;
  phone: string;
  email?: string;
  present_address?: string;
  permanent_address?: string;
  emergency_contact?: { name?: string; relation?: string; phone?: string };
  department?: EmployeeDepartment;
  department_id?: string;
  designation?: string;
  designation_id?: string;
  manager_id?: string | null;
  employee_type?: EmployeeType;
  basic_salary: number;
  commission_rate?: number;
  joining_date?: string;
  status?: EmployeeStatus;
  payment_method?: PaymentMethodType;
  bank_name?: string;
  bank_branch?: string;
  bank_account_no?: string;
  structure_id?: string;
  documents?: IEmployeeDocumentItem[];
}

export async function GET(req: NextRequest) {
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

  try {
    await connectDB();
    await ensureDepartmentsAndDesignationsSeeded();
    void Department;
    void Designation;

    const { searchParams } = new URL(req.url);
    const department = searchParams.get('department');
    const departmentId = searchParams.get('department_id');
    const designationId = searchParams.get('designation_id');
    const status = searchParams.get('status');
    const employeeType = searchParams.get('employee_type');
    const search = searchParams.get('search')?.trim();
    const includeArchived = searchParams.get('includeArchived') === 'true';
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');

    const filter: Record<string, unknown> = {};
    if (!includeArchived) filter.is_deleted = { $ne: true };
    if (department && department !== 'all') filter.department = department;
    if (departmentId && departmentId !== 'all') filter.department_id = departmentId;
    if (designationId && designationId !== 'all') filter.designation_id = designationId;
    if (status && status !== 'all') filter.status = status;
    if (employeeType && employeeType !== 'all') filter.employee_type = employeeType;

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [
        { employee_id: regex },
        { firstName: regex },
        { lastName: regex },
        { phone: regex },
        { email: regex },
        { designation: regex },
        { nid_number: regex },
        { biometric_id: regex },
      ];
    }

    const total = await Employee.countDocuments(filter);

    const query = Employee.find(filter)
      .populate('userId', 'name username role active')
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code grade_label level')
      .populate('manager_id', 'employee_id firstName lastName designation')
      .populate('schedule_id', 'name code start_time end_time shift')
      .sort({ createdAt: -1 });

    let page = 1;
    let limit = total || 50;
    if (pageParam) {
      page = Math.max(1, parseInt(pageParam, 10) || 1);
      limit = Math.min(100, Math.max(5, parseInt(limitParam || '20', 10) || 20));
      query.skip((page - 1) * limit).limit(limit);
    }

    const employees = await query.lean();

    // Attach active payroll contract structure reference cleanly
    const empIds = employees.map((e) => e._id);
    const activeContracts = await EmployeeContract.find({
      employee_id: { $in: empIds },
      status: 'Active',
    })
      .select('employee_id structure_id basic_salary')
      .lean();
    const contractMap = new Map(activeContracts.map((c) => [c.employee_id.toString(), c]));

    const enriched = employees.map((e) => {
      const c = contractMap.get(e._id.toString());
      return {
        ...e,
        contract_structure_id: c?.structure_id?.toString() || '',
      };
    });

    return NextResponse.json({
      success: true,
      data: enriched,
      meta: {
        total,
        page,
        limit,
        totalPages: pageParam ? Math.max(1, Math.ceil(total / limit)) : 1,
      },
    });
  } catch (error: unknown) {
    console.error('GET /api/hrm/employees error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to fetch employees';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await req.json()) as CreateEmployeeBody;
    if (!body.firstName?.trim() || !body.lastName?.trim() || !body.phone?.trim()) {
      return NextResponse.json(
        {
          success: false,
          message: 'First Name, Last Name, and Phone are required.',
        },
        { status: 400 }
      );
    }

    await connectDB();
    await ensureDepartmentsAndDesignationsSeeded();

    const deptDoc = await resolveOrCreateDepartment(body.department_id || body.department);
    const desigDoc = await resolveOrCreateDesignation(
      body.designation_id || body.designation,
      deptDoc?._id?.toString()
    );

    if (!deptDoc || !desigDoc) {
      return NextResponse.json(
        { success: false, message: 'Valid Department and Designation are required.' },
        { status: 400 }
      );
    }

    const finalEmpId = body.employee_id?.trim()
      ? body.employee_id.trim().toUpperCase()
      : await generateEmployeeId();

    const cleanBioId = body.biometric_id?.trim() ? body.biometric_id.trim().toUpperCase() : undefined;
    const cleanEmail = body.email?.trim() ? body.email.trim().toLowerCase() : undefined;
    const cleanNid = body.nid_number?.trim() ? body.nid_number.trim() : undefined;
    const cleanUserId = body.userId && body.userId !== '' ? body.userId : null;

    const dupError = await checkEmployeeUniqueness({
      employee_id: finalEmpId,
      email: cleanEmail,
      phone: body.phone.trim(),
      nid_number: cleanNid,
      biometric_id: cleanBioId,
      userId: cleanUserId,
    });
    if (dupError) {
      return NextResponse.json({ success: false, message: dupError }, { status: 409 });
    }

    const defaultCommission =
      body.commission_rate !== undefined
        ? Math.max(0, Math.min(100, Number(body.commission_rate)))
        : deptDoc.name === 'Agent'
          ? 5
          : 0;

    const resolvedScheduleId = await resolveOptionalScheduleId(body.schedule_id, body.shift);
    const basicSalary = Math.max(0, Math.round(Number(body.basic_salary) || 0));

    const employee = await Employee.create({
      userId: cleanUserId,
      employee_id: finalEmpId,
      biometric_id: cleanBioId,
      shift: body.shift?.trim() || 'Regular',
      schedule_id: resolvedScheduleId,
      photo_url: body.photo_url?.trim() || '',
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      father_name: body.father_name?.trim() || '',
      mother_name: body.mother_name?.trim() || '',
      date_of_birth: body.date_of_birth ? new Date(body.date_of_birth) : null,
      gender: body.gender || '',
      nid_number: cleanNid,
      blood_group: body.blood_group?.trim() || '',
      marital_status: body.marital_status || '',
      phone: body.phone.trim(),
      email: cleanEmail,
      present_address: body.present_address?.trim() || '',
      permanent_address: body.permanent_address?.trim() || '',
      emergency_contact: {
        name: body.emergency_contact?.name?.trim() || '',
        relation: body.emergency_contact?.relation?.trim() || '',
        phone: body.emergency_contact?.phone?.trim() || '',
      },
      department: deptDoc.name,
      department_id: deptDoc._id,
      designation: desigDoc.name,
      designation_id: desigDoc._id,
      manager_id: body.manager_id && body.manager_id !== '' ? body.manager_id : null,
      employee_type: body.employee_type || 'Permanent',
      basic_salary: basicSalary,
      commission_rate: defaultCommission,
      joining_date: body.joining_date ? new Date(body.joining_date) : new Date(),
      status: body.status || 'Active',
      payment_method: body.payment_method || 'Bank',
      bank_name: body.bank_name?.trim() || '',
      bank_branch: body.bank_branch?.trim() || '',
      bank_account_no: body.bank_account_no?.trim() || '',
      documents: Array.isArray(body.documents) ? body.documents : [],
      is_deleted: false,
    });

    await syncEmployeeContractAndSalaryHistory({
      employeeId: employee._id.toString(),
      basicSalary,
      structureId: body.structure_id || null,
      bankName: employee.bank_name,
      bankAccountNo: employee.bank_account_no,
      startDate: employee.joining_date,
      changedBy: auth.user.name,
      isNewEmployee: true,
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
        designation: employee.designation,
        basic_salary: employee.basic_salary,
      },
    });

    const populated = await Employee.findById(employee._id)
      .populate('userId', 'name username role active')
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code grade_label level')
      .lean();

    return NextResponse.json(
      {
        success: true,
        message: `Employee ${employee.firstName} ${employee.lastName} (${employee.employee_id}) created successfully.`,
        data: populated,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('POST /api/hrm/employees error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to create employee';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
