import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Department } from '@/models/Department';
import { Designation } from '@/models/Designation';
import { Employee } from '@/models/Employee';
import { WorkingSchedule } from '@/models/WorkingSchedule';
import { SalaryStructure } from '@/models/SalaryStructure';
import { User } from '@/models/User';
import { ensureDepartmentsAndDesignationsSeeded } from '@/lib/hrm-seed';
import { ensureAttendanceSeeded } from '@/lib/attendance-seed';
import { ensurePayrollSeeded } from '@/lib/payroll-seed';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'HR', 'Manager', 'Counselor', 'Accountant', 'Viewer', 'Employee']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    await Promise.all([
      ensureDepartmentsAndDesignationsSeeded(),
      ensureAttendanceSeeded(),
      ensurePayrollSeeded(),
    ]);

    const [departments, designations, schedules, structures, managers, erpUsers] =
      await Promise.all([
        Department.find({ status: 'Active' }).sort({ name: 1 }).lean(),
        Designation.find({ status: 'Active' }).sort({ level: -1, name: 1 }).lean(),
        WorkingSchedule.find({ active: true }).sort({ is_default: -1, name: 1 }).lean(),
        SalaryStructure.find({ active: true }).sort({ name: 1 }).lean(),
        Employee.find({ is_deleted: { $ne: true }, status: { $in: ['Active', 'On Leave'] } })
          .select('employee_id firstName lastName designation department')
          .sort({ firstName: 1 })
          .lean(),
        User.find({ active: true }).select('name username role').sort({ name: 1 }).lean(),
      ]);

    return NextResponse.json({
      success: true,
      data: {
        departments,
        designations,
        schedules,
        structures,
        managers,
        erpUsers,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to load HRM options';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

