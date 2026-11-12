'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  UserCheck,
  UserX,
  Receipt,
  Clock,
  ShieldCheck,
  FileText,
  RefreshCw,
} from 'lucide-react';
import {
  DashboardShell,
  DashboardCard,
  HorizontalBarList,
  VerticalBarChart,
} from '@/components/dashboard/DashboardShell';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/components/layout/DashboardLayout';
import { formatBDT } from '@/lib/formatters';
import { downloadExcel } from '@/lib/client-export';
import type { DateRangePreset } from '@/lib/dashboard-helpers';

interface HrmDashboardData {
  canViewPayrollAmounts: boolean;
  range: { preset: DateRangePreset; label: string; startIso: string; endIso: string };
  kpis: {
    totalEmployees: number;
    staffCount: number;
    agentCount: number;
    presentToday: number;
    onLeaveOrAbsentToday: number;
    leaveToday: number;
    absentToday: number;
    payrollStatus: string;
    payrollPeriodLabel: string;
  };
  charts: {
    attendanceTrend: Array<{ label: string; primary: number; secondary: number }>;
    employeesByDepartment: Array<{ label: string; value: number }>;
  };
  tables: {
    recentPayrollRuns: Array<{
      _id: string;
      batchCode: string;
      period: string;
      employeesCount: number;
      netPayable: number | null;
      status: string;
    }>;
    pendingActions: Array<{
      id: string;
      title: string;
      detail: string;
      actionLabel: string;
      href: string;
      severity: 'warning' | 'info';
    }>;
  };
  filterOptions: {
    departments: string[];
  };
}

export function HrmDashboardView() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const [dateRange, setDateRange] = useState<DateRangePreset>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [department, setDepartment] = useState('all');

  const [data, setData] = useState<HrmDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ range: dateRange });
      if (dateRange === 'custom') {
        if (customStart) params.set('startDate', customStart);
        if (customEnd) params.set('endDate', customEnd);
      }
      if (department !== 'all') params.set('department', department);

      const res = await fetch(`/api/dashboard/hrm?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to load HRM dashboard');
      }
      setData(json);
    } catch (err: any) {
      setError(err?.message || 'Unable to load HRM dashboard');
    } finally {
      setLoading(false);
    }
  }, [dateRange, customStart, customEnd, department]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const hasActiveFilters = department !== 'all';

  const handleExport = async () => {
    if (!data) return;
    await downloadExcel({
      filename: `hrm-dashboard-${data.range.preset}`,
      sheetName: 'Payroll Runs',
      headers: [
        'Batch Code',
        'Period',
        'Employees',
        ...(data.canViewPayrollAmounts ? ['Net Payable (BDT)'] : []),
        'Status',
      ],
      rows: data.tables.recentPayrollRuns.map((r) => [
        r.batchCode,
        r.period,
        r.employeesCount,
        ...(data.canViewPayrollAmounts ? [r.netPayable ?? 0] : []),
        r.status,
      ]),
    });
  };

  const kpis = [
    {
      label: 'Total Employees',
      value: data?.kpis.totalEmployees ?? 0,
      helper: data
        ? `${data.kpis.staffCount} staff · ${data.kpis.agentCount} agents`
        : 'Active workforce',
      href: '/hrm/employees',
      icon: <Users className="w-4 h-4" />,
      accent: 'indigo' as const,
    },
    {
      label: 'Present Today',
      value: data?.kpis.presentToday ?? 0,
      helper: 'Present, Late & Half-day',
      href: '/attendance',
      icon: <UserCheck className="w-4 h-4" />,
      accent: 'emerald' as const,
    },
    {
      label: 'On Leave / Absent Today',
      value: data?.kpis.onLeaveOrAbsentToday ?? 0,
      helper: data
        ? `${data.kpis.leaveToday} on leave · ${data.kpis.absentToday} absent`
        : 'Today attendance exceptions',
      href: '/attendance',
      icon: <UserX className="w-4 h-4" />,
      accent: 'rose' as const,
    },
    {
      label: 'Payroll Status',
      value: data?.kpis.payrollStatus || 'No Runs',
      helper: data?.kpis.payrollPeriodLabel || 'Latest payroll batch',
      href: '/payroll/batches',
      icon: <Receipt className="w-4 h-4" />,
      accent: 'amber' as const,
    },
  ];

  const quickLinks = [
    { label: 'Employees & Agents', href: '/hrm/employees', icon: <UserCheck className="w-4 h-4" /> },
    { label: 'Attendance & Calendar', href: '/attendance', icon: <Clock className="w-4 h-4" /> },
    { label: 'Payroll Runs & Payslips', href: '/payroll', icon: <Receipt className="w-4 h-4" /> },
    ...(isAdmin
      ? [
          { label: 'Users & Staff', href: '/users', icon: <ShieldCheck className="w-4 h-4" /> },
          { label: 'System Audit Logs', href: '/audit-logs', icon: <FileText className="w-4 h-4" /> },
        ]
      : []),
  ];

  const filtersContent = (
    <div>
      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Department</label>
      <select
        value={department}
        onChange={(e) => setDepartment(e.target.value)}
        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
      >
        <option value="all">All Departments</option>
        {(data?.filterOptions.departments || []).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </div>
  );

  const statusBadgeVariant = (status: string) => {
    if (status === 'Paid') return 'success';
    if (status === 'Confirmed') return 'info';
    if (status === 'Verified') return 'purple';
    if (status === 'Reversed') return 'danger';
    return 'warning';
  };

  return (
    <DashboardShell
      title="HRM Dashboard"
      subtitle="Workforce headcount, daily attendance trends, and payroll run status"
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      customStart={customStart}
      customEnd={customEnd}
      onCustomDateChange={(s, e) => {
        setCustomStart(s);
        setCustomEnd(e);
      }}
      onExport={handleExport}
      filtersContent={filtersContent}
      hasActiveFilters={hasActiveFilters}
      onResetFilters={() => setDepartment('all')}
      kpis={kpis}
      loading={loading}
      error={error}
      headerRightExtra={
        <button
          type="button"
          onClick={loadData}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          Refresh
        </button>
      }
      charts={
        <>
          <DashboardCard
            title="Attendance Trend"
            subtitle={`Daily attendance (${data?.range.label || 'This Month'})`}
            actionHref="/attendance"
          >
            <VerticalBarChart
              items={data?.charts.attendanceTrend || []}
              primaryLabel="Present"
              secondaryLabel="Leave / Absent"
              emptyText="No attendance logs recorded in this range."
            />
          </DashboardCard>

          <DashboardCard
            title="Employees by Department"
            subtitle="Active staff and agents by department"
            actionHref="/hrm/employees"
          >
            <HorizontalBarList
              items={data?.charts.employeesByDepartment || []}
              emptyText="No active employees found."
              barColor="bg-indigo-500"
            />
          </DashboardCard>
        </>
      }
      tables={
        <>
          <DashboardCard
            title="Recent Payroll Runs"
            subtitle="Latest 5 payroll batches"
            actionHref="/payroll/batches"
          >
            {!data || data.tables.recentPayrollRuns.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No payroll runs created yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-[11px] uppercase text-slate-400 border-b border-slate-100">
                    <tr>
                      <th className="py-2 pr-2">Period</th>
                      <th className="py-2 px-2">Batch</th>
                      <th className="py-2 px-2 text-right">Employees</th>
                      {data.canViewPayrollAmounts && (
                        <th className="py-2 px-2 text-right">Net Payable</th>
                      )}
                      <th className="py-2 pl-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.tables.recentPayrollRuns.map((run) => (
                      <tr key={run._id} className="hover:bg-slate-50/70">
                        <td className="py-2 pr-2 font-medium text-slate-900">{run.period}</td>
                        <td className="py-2 px-2 font-mono text-slate-600">{run.batchCode}</td>
                        <td className="py-2 px-2 text-right text-slate-700">{run.employeesCount}</td>
                        {data.canViewPayrollAmounts && (
                          <td className="py-2 px-2 text-right font-semibold text-slate-900">
                            {formatBDT(run.netPayable || 0)}
                          </td>
                        )}
                        <td className="py-2 pl-2 text-right">
                          <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="Pending Actions"
            subtitle="Payroll batches & leave approvals requiring action"
            actionHref="/payroll/batches"
          >
            {!data || data.tables.pendingActions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                All payroll batches and leave requests are up to date.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.tables.pendingActions.map((act) => (
                  <div
                    key={act.id}
                    className="py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">{act.title}</div>
                      <div className="text-[11px] text-slate-500 truncate">{act.detail}</div>
                    </div>
                    <Link
                      href={act.href}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-semibold hover:bg-slate-800 shrink-0"
                    >
                      {act.actionLabel}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>
        </>
      }
      quickLinks={quickLinks}
    />
  );
}

