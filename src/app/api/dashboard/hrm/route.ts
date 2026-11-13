import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Employee } from '@/models/Employee';
import { DailyAttendance } from '@/models/DailyAttendance';
import { Leave } from '@/models/Leave';
import { PayslipBatch } from '@/models/PayslipBatch';
import { HRM_DASHBOARD_ROLES, resolveDateRange } from '@/lib/dashboard-helpers';
import { rememberCache } from '@/lib/redis';

const PAYROLL_AMOUNT_ROLES = ['Admin', 'HR', 'Accountant'];

export async function GET(req: NextRequest) {
  const auth = requireAuth(req, HRM_DASHBOARD_ROLES);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();

    const canViewPayrollAmounts = PAYROLL_AMOUNT_ROLES.includes(auth.user.role);
    const { searchParams } = new URL(req.url);
    const range = resolveDateRange(
      searchParams.get('range'),
      searchParams.get('startDate'),
      searchParams.get('endDate')
    );
    const department = searchParams.get('department')?.trim() || 'all';

    const cacheKey = `dashboard:hrm:${auth.user.role}:${range.preset}:${range.startIso}:${range.endIso}:${department}`;

    const payload = await rememberCache(cacheKey, 30, async () => {
      const empMatch: Record<string, any> = {
        is_deleted: { $ne: true },
        status: { $in: ['Active', 'On Leave'] },
      };
      if (department !== 'all') {
        empMatch.department = department;
      }

    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

    // Attendance trend window: use selected range, capped at last 14 buckets for clean chart readability
    const trendStart = range.startDate;
    const trendEnd = range.endDate;

    const [
      employeeAgg,
      deptAgg,
      todayAttendanceAgg,
      approvedLeavesToday,
      attendanceTrendAgg,
      recentPayrollRuns,
      pendingPayrollRuns,
      pendingLeavesCount,
      allDepartments,
    ] = await Promise.all([
      Employee.aggregate<{ _id: string; count: number }>([
        { $match: empMatch },
        {
          $group: {
            _id: { $cond: [{ $eq: ['$department', 'Agent'] }, 'Agent', 'Staff'] },
            count: { $sum: 1 },
          },
        },
      ]),
      Employee.aggregate<{ _id: string; count: number }>([
        { $match: { is_deleted: { $ne: true }, status: { $in: ['Active', 'On Leave'] } } },
        { $group: { _id: { $ifNull: ['$department', 'Other'] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      DailyAttendance.aggregate<{ _id: string; count: number }>([
        { $match: { date: { $gte: todayStart, $lte: todayEnd } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Leave.countDocuments({
        status: 'Approved',
        start_date: { $lte: todayEnd },
        end_date: { $gte: todayStart },
      }),
      DailyAttendance.aggregate<{
        _id: string;
        present: number;
        absentOrLeave: number;
      }>([
        { $match: { date: { $gte: trendStart, $lte: trendEnd } } },
        {
          $group: {
            _id: { $dateToString: { format: '%m-%d', date: '$date' } },
            present: {
              $sum: { $cond: [{ $in: ['$status', ['Present', 'Late', 'Half-day']] }, 1, 0] },
            },
            absentOrLeave: {
              $sum: { $cond: [{ $in: ['$status', ['Absent', 'Leave']] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 14 },
      ]),
      PayslipBatch.find({ status: { $nin: ['Cancelled'] } })
        .sort({ year: -1, month: -1, createdAt: -1 })
        .limit(5)
        .select('name batch_code month year department payslip_count total_net_pay status')
        .lean(),
      PayslipBatch.find({ status: { $in: ['Draft', 'Verified'] } })
        .sort({ year: -1, month: -1, createdAt: -1 })
        .limit(5)
        .select('name batch_code month year payslip_count status')
        .lean(),
      Leave.countDocuments({ status: 'Pending' }),
      Employee.distinct('department', { is_deleted: { $ne: true } }),
    ]);

    const staffCount = employeeAgg.find((e) => e._id === 'Staff')?.count || 0;
    const agentCount = employeeAgg.find((e) => e._id === 'Agent')?.count || 0;
    const totalEmployees = staffCount + agentCount;

    const attMap = new Map(todayAttendanceAgg.map((a) => [a._id, a.count]));
    const presentToday =
      (attMap.get('Present') || 0) + (attMap.get('Late') || 0) + (attMap.get('Half-day') || 0);
    const absentToday = attMap.get('Absent') || 0;
    const leaveToday = Math.max(attMap.get('Leave') || 0, approvedLeavesToday);
    const onLeaveOrAbsentToday = absentToday + leaveToday;

    const latestBatch = recentPayrollRuns[0] || null;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const pendingActions: Array<{
      id: string;
      title: string;
      detail: string;
      actionLabel: string;
      href: string;
      severity: 'warning' | 'info';
    }> = pendingPayrollRuns.map((run: any) => ({
      id: String(run._id),
      title:
        run.status === 'Draft'
          ? `Verify Payroll Run ${run.batch_code}`
          : `Confirm Payroll Run ${run.batch_code}`,
      detail: `${monthNames[(run.month || 1) - 1]} ${run.year} · ${run.payslip_count || 0} employees`,
      actionLabel: run.status === 'Draft' ? 'Verify' : 'Confirm',
      href: '/payroll/batches',
      severity: 'warning',
    }));

    if (pendingLeavesCount > 0 && pendingActions.length < 5) {
      pendingActions.push({
        id: 'pending-leaves',
        title: `${pendingLeavesCount} Pending Leave Request${pendingLeavesCount > 1 ? 's' : ''}`,
        detail: 'Awaiting HR review and approval',
        actionLabel: 'Review',
        href: '/attendance',
        severity: 'info',
      });
    }

    return {
      success: true,
      canViewPayrollAmounts,
      range: {
        preset: range.preset,
        label: range.label,
        startIso: range.startIso,
        endIso: range.endIso,
      },
      kpis: {
        totalEmployees,
        staffCount,
        agentCount,
        presentToday,
        onLeaveOrAbsentToday,
        leaveToday,
        absentToday,
        payrollStatus: latestBatch ? latestBatch.status : 'No Runs',
        payrollPeriodLabel: latestBatch
          ? `${latestBatch.batch_code} (${monthNames[(latestBatch.month || 1) - 1]} ${latestBatch.year})`
          : 'No payroll runs yet',
      },
      charts: {
        attendanceTrend: attendanceTrendAgg.map((d) => ({
          label: d._id,
          primary: d.present,
          secondary: d.absentOrLeave,
        })),
        employeesByDepartment: deptAgg.map((d) => ({
          label: d._id || 'Other',
          value: d.count,
        })),
      },
      tables: {
        recentPayrollRuns: recentPayrollRuns.map((r: any) => ({
          _id: String(r._id),
          batchCode: r.batch_code,
          period: `${monthNames[(r.month || 1) - 1]} ${r.year}`,
          employeesCount: r.payslip_count || 0,
          netPayable: canViewPayrollAmounts ? r.total_net_pay || 0 : null,
          status: r.status,
        })),
        pendingActions: pendingActions.slice(0, 5),
      },
      filterOptions: {
        departments: (allDepartments as string[]).filter(Boolean).sort(),
      },
    };
    });

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('HRM dashboard API error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to load HRM dashboard' },
      { status: 500 }
    );
  }
}

