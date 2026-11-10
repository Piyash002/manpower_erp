import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog, isAdminOrHR } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Employee } from '@/models/Employee';
import { Department } from '@/models/Department';
import { Designation } from '@/models/Designation';
import { DailyAttendance } from '@/models/DailyAttendance';
import { Holiday } from '@/models/Holiday';
import { Leave } from '@/models/Leave';
import { EmployeeContract } from '@/models/EmployeeContract';
import { SalaryStructure } from '@/models/SalaryStructure';
import { SalaryRule } from '@/models/SalaryRule';
import { SalaryHistory } from '@/models/SalaryHistory';
import { Payslip } from '@/models/Payslip';
import { AuditLog } from '@/models/AuditLog';
import { resolveEmployeeSchedule } from '@/lib/attendance-engine';

function computeServiceDuration(joiningDate?: Date | string | null): string {
  if (!joiningDate) return '—';
  const start = new Date(joiningDate);
  const now = new Date();
  if (isNaN(start.getTime()) || start > now) return '0 days';

  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();

  if (days < 0) {
    const prevMonthLastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    days += prevMonthLastDay;
    months -= 1;
  }
  if (months < 0) {
    months += 12;
    years -= 1;
  }

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years > 1 ? 's' : ''}`);
  if (months > 0) parts.push(`${months} month${months > 1 ? 's' : ''}`);
  parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  return parts.join(' ');
}

function countDaysInclusive(start: Date, end: Date, yearFilter?: number): number {
  const s = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const e = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  if (yearFilter) {
    const ys = new Date(Date.UTC(yearFilter, 0, 1));
    const ye = new Date(Date.UTC(yearFilter, 11, 31));
    if (e < ys || s > ye) return 0;
    const clampedS = s < ys ? ys : s;
    const clampedE = e > ye ? ye : e;
    return Math.floor((clampedE.getTime() - clampedS.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }
  if (e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, [
    'Admin',
    'HR',
    'Manager',
    'Employee',
    'Counselor',
    'Accountant',
    'Viewer',
  ]);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    await connectDB();
    void Department;
    void Designation;
    void SalaryStructure;

    const employee = await Employee.findById(id)
      .populate('userId', 'name username role active')
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code grade_label level')
      .populate('manager_id', 'employee_id firstName lastName designation')
      .populate('schedule_id', 'name code start_time end_time shift working_days')
      .lean();

    if (!employee) {
      return NextResponse.json({ success: false, message: 'Employee not found' }, { status: 404 });
    }

    const adminOrHR = isAdminOrHR(auth.user.role);
    const isSelf = employee.userId && (employee.userId as { _id?: { toString(): string } })._id?.toString() === auth.user.userId;

    // Permission check: Admin/HR can view anyone; Manager can view direct reports; Employee views self; legacy ERP roles keep read visibility without others' salary
    let isManagerOfTarget = false;
    if (!adminOrHR && !isSelf) {
      const callerEmp = await Employee.findOne({ userId: auth.user.userId }).select('_id').lean();
      if (
        callerEmp &&
        employee.manager_id &&
        (employee.manager_id as { _id?: { toString(): string } })._id?.toString() === callerEmp._id.toString()
      ) {
        isManagerOfTarget = true;
      }
      if (auth.user.role === 'Employee' && !isManagerOfTarget) {
        return NextResponse.json(
          { success: false, message: 'Forbidden. You can only view your own profile.' },
          { status: 403 }
        );
      }
    }

    const canViewSalary = adminOrHR || Boolean(isSelf);
    const canViewAudit = adminOrHR;

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const month = Math.min(12, Math.max(1, parseInt(searchParams.get('month') || String(now.getMonth() + 1), 10) || now.getMonth() + 1));
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()), 10) || now.getFullYear();

    const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    const [
      resolvedSchedule,
      yearAttendance,
      monthHolidays,
      totalDaysWorkedSinceJoining,
      leaves,
    ] = await Promise.all([
      resolveEmployeeSchedule(employee),
      DailyAttendance.find({
        employee_id: employee._id,
        date: { $gte: yearStart, $lte: yearEnd },
      })
        .sort({ date: 1 })
        .lean(),
      Holiday.find({ date: { $gte: monthStart, $lte: monthEnd }, active: true }).lean(),
      DailyAttendance.countDocuments({
        employee_id: employee._id,
        status: { $in: ['Present', 'Late', 'Half-day'] },
      }),
      Leave.find({ employee_id: employee._id }).sort({ start_date: -1 }).lean(),
    ]);

    // Filter selected month attendance
    const monthAttendance = yearAttendance.filter((d) => {
      const dt = new Date(d.date);
      return dt >= monthStart && dt <= monthEnd;
    });

    // Selected month summary
    const monthSummary = {
      workingDays: 0,
      present: 0,
      late: 0,
      halfDay: 0,
      absent: 0,
      paidLeave: 0,
      unpaidLeave: 0,
      holiday: 0,
      weekend: 0,
      workedHours: 0,
      overtimeHours: 0,
    };

    for (const d of monthAttendance) {
      if (d.status === 'Present') monthSummary.present++;
      else if (d.status === 'Late') monthSummary.late++;
      else if (d.status === 'Half-day') monthSummary.halfDay++;
      else if (d.status === 'Absent') monthSummary.absent++;
      else if (d.status === 'Leave') {
        if (d.leave_is_paid === false) monthSummary.unpaidLeave++;
        else monthSummary.paidLeave++;
      } else if (d.status === 'Holiday') monthSummary.holiday++;
      else if (d.status === 'Weekend') monthSummary.weekend++;

      monthSummary.workedHours =
        Math.round((monthSummary.workedHours + (d.worked_hours || 0)) * 100) / 100;
      monthSummary.overtimeHours =
        Math.round((monthSummary.overtimeHours + (d.overtime_hours || 0)) * 100) / 100;
    }

    // Count scheduled working days in the selected month
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const workDaysArr = resolvedSchedule?.working_days || [0, 1, 2, 3, 4];
    const holSet = new Set(monthHolidays.map((h) => new Date(h.date).toISOString().split('T')[0]));
    for (let day = 1; day <= daysInMonth; day++) {
      const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      const iso = dt.toISOString().split('T')[0];
      if (workDaysArr.includes(dt.getUTCDay()) && !holSet.has(iso)) {
        monthSummary.workingDays++;
      }
    }

    // 12-Month Breakdown for the selected year
    const monthlyHistory = Array.from({ length: 12 }, (_, idx) => ({
      month: idx + 1,
      present: 0,
      late: 0,
      halfDay: 0,
      absent: 0,
      leave: 0,
      workedHours: 0,
      overtimeHours: 0,
    }));

    for (const d of yearAttendance) {
      const mIdx = new Date(d.date).getUTCMonth();
      const bucket = monthlyHistory[mIdx];
      if (!bucket) continue;
      if (d.status === 'Present') bucket.present++;
      else if (d.status === 'Late') bucket.late++;
      else if (d.status === 'Half-day') bucket.halfDay++;
      else if (d.status === 'Absent') bucket.absent++;
      else if (d.status === 'Leave') bucket.leave++;
      bucket.workedHours = Math.round((bucket.workedHours + (d.worked_hours || 0)) * 100) / 100;
      bucket.overtimeHours = Math.round((bucket.overtimeHours + (d.overtime_hours || 0)) * 100) / 100;
    }

    // Leave Balances for the selected year
    const leaveAllowances: Record<string, number> = {
      Casual: 10,
      Sick: 14,
      Earned: 15,
      Emergency: 5,
      Unpaid: 0,
    };
    const leaveUsed: Record<string, number> = {
      Casual: 0,
      Sick: 0,
      Earned: 0,
      Emergency: 0,
      Unpaid: 0,
    };
    for (const lv of leaves) {
      if (lv.status === 'Approved') {
        const used = countDaysInclusive(new Date(lv.start_date), new Date(lv.end_date), year);
        leaveUsed[lv.leave_type] = (leaveUsed[lv.leave_type] || 0) + used;
      }
    }
    const leaveSummary = Object.keys(leaveAllowances).map((type) => ({
      type,
      allowed: leaveAllowances[type],
      used: leaveUsed[type] || 0,
      remaining:
        leaveAllowances[type] > 0 ? Math.max(0, leaveAllowances[type] - (leaveUsed[type] || 0)) : null,
    }));

    // Salary & Payslips (only if permitted)
    let salaryData: Record<string, unknown> | null = null;
    if (canViewSalary) {
      const [activeContract, salaryHistory, payslips] = await Promise.all([
        EmployeeContract.findOne({ employee_id: employee._id, status: 'Active' })
          .populate('structure_id', 'name code')
          .lean(),
        SalaryHistory.find({ employee_id: employee._id })
          .populate('structure_id', 'name code')
          .sort({ effective_date: -1, createdAt: -1 })
          .lean(),
        Payslip.find({ employee_id: employee._id })
          .populate('structure_id', 'name code')
          .sort({ year: -1, month: -1, createdAt: -1 })
          .lean(),
      ]);

      let rules: unknown[] = [];
      if (activeContract?.structure_id) {
        const sid =
          (activeContract.structure_id as { _id?: { toString(): string } })._id?.toString() ||
          String(activeContract.structure_id);
        rules = await SalaryRule.find({ structure_id: sid, active: true })
          .sort({ sequence: 1 })
          .lean();
      }

      const ytd = {
        totalEarnedGross: 0,
        totalNet: 0,
        totalPaid: 0,
        totalDeductions: 0,
        totalTax: 0,
        totalPF: 0,
        totalOvertimePaid: 0,
        payslipCount: 0,
      };

      for (const p of payslips) {
        if (p.year === year && p.status !== 'Cancelled') {
          ytd.payslipCount++;
          ytd.totalEarnedGross += p.gross_pay || 0;
          ytd.totalNet += p.net_pay || 0;
          if (p.status === 'Paid') ytd.totalPaid += p.net_pay || 0;
          ytd.totalDeductions += p.total_deductions || 0;
          for (const line of p.lines || []) {
            const c = (line.code || '').toUpperCase();
            if (c.includes('TAX') || c.includes('TDS')) ytd.totalTax += line.amount || 0;
            if (c === 'PF' || c.includes('PROVIDENT')) ytd.totalPF += line.amount || 0;
            if (c === 'OT' || c.includes('OVERTIME')) ytd.totalOvertimePaid += line.amount || 0;
          }
        }
      }

      salaryData = {
        activeContract,
        rules,
        salaryHistory,
        payslips,
        ytd,
      };
    }

    // Audit Logs (Admin/HR only)
    let auditLogs: unknown[] = [];
    if (canViewAudit) {
      auditLogs = await AuditLog.find({
        $or: [
          { entityId: employee._id.toString() },
          { 'newValues.employee_id': employee.employee_id },
        ],
      })
        .sort({ timestamp: -1 })
        .limit(50)
        .lean();
    }

    return NextResponse.json({
      success: true,
      data: {
        employee,
        serviceDuration: computeServiceDuration(employee.joining_date),
        permissions: { canViewSalary, canViewAudit, isSelf },
        filter: { month, year },
        attendance: {
          schedule: resolvedSchedule,
          totalDaysWorkedSinceJoining,
          monthSummary,
          monthAttendance,
          monthHolidays,
          monthlyHistory,
        },
        leaves: {
          summary: leaveSummary,
          history: leaves,
        },
        salary: salaryData,
        auditLogs,
      },
    });
  } catch (error: unknown) {
    console.error('GET /api/hrm/employees/[id]/profile error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to load employee profile';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, [
    'Admin',
    'HR',
    'Manager',
    'Employee',
    'Counselor',
    'Accountant',
    'Viewer',
  ]);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    const body = (await req.json()) as {
      phone?: string;
      present_address?: string;
      emergency_contact?: { name?: string; relation?: string; phone?: string };
      note?: string;
    };

    await connectDB();
    const employee = await Employee.findById(id).lean();
    if (!employee) {
      return NextResponse.json({ success: false, message: 'Employee not found' }, { status: 404 });
    }

    const isSelf = employee.userId?.toString() === auth.user.userId;
    if (!isAdminOrHR(auth.user.role) && !isSelf) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    await createAuditLog({
      user: auth.user,
      action: 'EMPLOYEE_CONTACT_UPDATE_REQUEST',
      entity: 'Employee',
      entityId: id,
      newValues: {
        employee_id: employee.employee_id,
        requested_phone: body.phone,
        requested_present_address: body.present_address,
        requested_emergency_contact: body.emergency_contact,
        note: body.note,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Contact info update request sent to HR/Admin.',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to submit contact request';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

