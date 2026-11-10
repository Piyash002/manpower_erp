'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Clock,
  DollarSign,
  Edit3,
  FileText,
  History,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { EmployeeAvatar } from './EmployeeAvatar';
import { Badge } from '@/components/ui/Badge';
import { formatBDT, formatDate, formatTimeDhaka } from '@/lib/formatters';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

type ProfileTab = 'overview' | 'attendance' | 'salary' | 'leaves' | 'documents' | 'audit';

export function EmployeeProfileView({ employeeId }: { employeeId: string }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/hrm/employees/${employeeId}/profile?month=${month}&year=${year}`
        );
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          throw new Error(json.message || 'Failed to load profile');
        }
        setData(json.data);
        setError('');
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load employee profile');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [employeeId, month, year]);

  if (loading && !data) {
    return (
      <div className="py-16 text-center bg-white rounded-xl border border-slate-200">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <span>{error || 'Employee profile unavailable.'}</span>
      </div>
    );
  }

  const emp = data.employee;
  const att = data.attendance;
  const sal = data.salary;
  const perms = data.permissions || {};

  const getStatusBadge = (status: string) => {
    if (status === 'Active' || status === 'Present' || status === 'Paid' || status === 'Approved') {
      return <Badge variant="success">{status}</Badge>;
    }
    if (status === 'Late' || status === 'Half-day' || status === 'On Leave' || status === 'Confirmed' || status === 'Pending') {
      return <Badge variant="warning">{status}</Badge>;
    }
    if (status === 'Absent' || status === 'Terminated' || status === 'Rejected' || status === 'Cancelled') {
      return <Badge variant="danger">{status}</Badge>;
    }
    if (status === 'Leave' || status === 'Resigned') {
      return <Badge variant="purple">{status}</Badge>;
    }
    return <Badge variant="default">{status}</Badge>;
  };

  // Build month calendar day map
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dailyByDate = new Map<string, any>();
  for (const rec of att.monthAttendance || []) {
    const key = new Date(rec.date).toISOString().split('T')[0];
    dailyByDate.set(key, rec);
  }
  const holidayByDate = new Map<string, string>();
  for (const h of att.monthHolidays || []) {
    const key = new Date(h.date).toISOString().split('T')[0];
    holidayByDate.set(key, h.title);
  }

  const firstDow = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)).getUTCDay();
  const calendarCells = Array.from({ length: firstDow + daysInMonth }, (_, idx) => {
    if (idx < firstDow) return null;
    const day = idx - firstDow + 1;
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return {
      day,
      iso,
      record: dailyByDate.get(iso) || null,
      holidayTitle: holidayByDate.get(iso) || null,
    };
  });

  const tabs: Array<{ id: ProfileTab; label: string; icon: React.ElementType }> = [
    { id: 'overview', label: 'Overview', icon: UserCheck },
    { id: 'attendance', label: 'Attendance & History', icon: Clock },
    ...(perms.canViewSalary
      ? [{ id: 'salary' as const, label: 'Salary & Payslips', icon: DollarSign }]
      : []),
    { id: 'leaves', label: 'Leaves', icon: Calendar },
    { id: 'documents', label: `Documents (${(emp.documents || []).length})`, icon: FileText },
    ...(perms.canViewAudit
      ? [{ id: 'audit' as const, label: 'Activity Log', icon: History }]
      : []),
  ];

  return (
    <div className="space-y-6">
      {/* Top Profile Header Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Link
              href="/hrm/employees"
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 mt-1"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <EmployeeAvatar
              photoUrl={emp.photo_url}
              firstName={emp.firstName}
              lastName={emp.lastName}
              size="xl"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">
                  {emp.firstName} {emp.lastName}
                </h1>
                {getStatusBadge(emp.status)}
                <Badge variant="default">{emp.employee_type || 'Permanent'}</Badge>
              </div>
              <p className="text-xs font-mono text-slate-500 mt-1">
                {emp.employee_id} • {emp.designation} • {emp.department}
                {emp.biometric_id ? ` • Bio PIN: ${emp.biometric_id}` : ''}
              </p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 mt-2">
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" /> {emp.phone}
                </span>
                {emp.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-slate-400" /> {emp.email}
                  </span>
                )}
                <span>
                  Service Duration: <strong>{data.serviceDuration}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {perms.canViewAudit && (
              <Link
                href={`/hrm/employees/${emp._id}/edit`}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit Employee
              </Link>
            )}
          </div>
        </div>

        {/* Instant Summary KPI Ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold text-emerald-800 uppercase">
              Total Days Worked (All Time)
            </span>
            <p className="text-2xl font-bold text-emerald-900 mt-0.5">
              {att.totalDaysWorkedSinceJoining} <span className="text-xs font-normal">day(s)</span>
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold text-slate-600 uppercase">
              {MONTH_NAMES[month - 1]} {year} Attendance
            </span>
            <p className="text-lg font-bold text-slate-900 mt-1">
              {att.monthSummary.present} Present • {att.monthSummary.late} Late •{' '}
              {att.monthSummary.absent} Absent
            </p>
          </div>
          {perms.canViewSalary && (
            <>
              <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5">
                <span className="text-[11px] font-semibold text-blue-800 uppercase">
                  Basic Salary (Contract)
                </span>
                <p className="text-2xl font-bold text-blue-900 mt-0.5 font-mono">
                  {formatBDT(sal?.activeContract?.basic_salary ?? emp.basic_salary)}
                </p>
              </div>
              <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-3.5">
                <span className="text-[11px] font-semibold text-purple-800 uppercase">
                  {year} Salary Paid (YTD)
                </span>
                <p className="text-2xl font-bold text-purple-900 mt-0.5 font-mono">
                  {formatBDT(sal?.ytd?.totalPaid || 0)}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Profile Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-semibold w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition-all ${
                activeTab === tab.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3 text-xs">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Personal &amp; Identity Info
            </h2>
            <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
              <div><span className="text-slate-400 block">Father&apos;s Name</span><strong>{emp.father_name || '—'}</strong></div>
              <div><span className="text-slate-400 block">Mother&apos;s Name</span><strong>{emp.mother_name || '—'}</strong></div>
              <div><span className="text-slate-400 block">Date of Birth</span><strong>{emp.date_of_birth ? formatDate(emp.date_of_birth) : '—'}</strong></div>
              <div><span className="text-slate-400 block">Gender</span><strong>{emp.gender || '—'}</strong></div>
              <div><span className="text-slate-400 block">NID Number</span><strong className="font-mono">{emp.nid_number || '—'}</strong></div>
              <div><span className="text-slate-400 block">Blood / Marital</span><strong>{emp.blood_group || '—'} • {emp.marital_status || '—'}</strong></div>
            </div>
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <div className="flex items-start gap-1.5"><MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5" /><span><strong>Present:</strong> {emp.present_address || '—'}</span></div>
              <div className="flex items-start gap-1.5"><MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5" /><span><strong>Permanent:</strong> {emp.permanent_address || '—'}</span></div>
              <div><strong>Emergency:</strong> {emp.emergency_contact?.name || '—'} {emp.emergency_contact?.relation ? `(${emp.emergency_contact.relation})` : ''} — {emp.emergency_contact?.phone || '—'}</div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3 text-xs">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Employment, Schedule &amp; Banking
            </h2>
            <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
              <div><span className="text-slate-400 block">Department</span><strong>{emp.department}</strong></div>
              <div><span className="text-slate-400 block">Designation</span><strong>{emp.designation}</strong></div>
              <div>
                <span className="text-slate-400 block">Reporting Manager</span>
                <strong>
                  {emp.manager_id
                    ? `${emp.manager_id.firstName} ${emp.manager_id.lastName} (${emp.manager_id.employee_id})`
                    : '—'}
                </strong>
              </div>
              <div><span className="text-slate-400 block">Joining Date</span><strong>{emp.joining_date ? formatDate(emp.joining_date) : '—'}</strong></div>
              <div><span className="text-slate-400 block">Shift / Schedule</span><strong>{emp.shift || 'Regular'} ({att.schedule?.start_time}–{att.schedule?.end_time})</strong></div>
              <div><span className="text-slate-400 block">ERP Login User</span><strong>{emp.userId ? `@${emp.userId.username} (${emp.userId.role})` : 'Not Linked'}</strong></div>
              <div><span className="text-slate-400 block">Payment Method</span><strong>{emp.payment_method || 'Bank'}</strong></div>
              <div><span className="text-slate-400 block">Bank / Branch</span><strong>{emp.bank_name || '—'} {emp.bank_branch ? `(${emp.bank_branch})` : ''}</strong></div>
              <div className="col-span-2"><span className="text-slate-400 block">Account / Wallet No</span><strong className="font-mono">{emp.bank_account_no || '—'}</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ATTENDANCE & HISTORY */}
      {activeTab === 'attendance' && (
        <div className="space-y-5">
          {/* Month/Year Selector & Summary */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-900">
                Live Attendance — {MONTH_NAMES[month - 1]} {year}
              </h2>
              <div className="flex items-center gap-2 text-xs">
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold"
                >
                  {MONTH_NAMES.map((m, idx) => (
                    <option key={m} value={idx + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold"
                >
                  {[year - 1, year, year + 1].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2 text-center text-xs">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-200"><div className="text-[10px] text-slate-500">Work Days</div><strong className="text-sm">{att.monthSummary.workingDays}</strong></div>
              <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200"><div className="text-[10px] text-emerald-700">Present</div><strong className="text-sm text-emerald-800">{att.monthSummary.present}</strong></div>
              <div className="p-2 bg-amber-50 rounded-lg border border-amber-200"><div className="text-[10px] text-amber-700">Late</div><strong className="text-sm text-amber-800">{att.monthSummary.late}</strong></div>
              <div className="p-2 bg-amber-50 rounded-lg border border-amber-200"><div className="text-[10px] text-amber-700">Half-day</div><strong className="text-sm text-amber-800">{att.monthSummary.halfDay}</strong></div>
              <div className="p-2 bg-rose-50 rounded-lg border border-rose-200"><div className="text-[10px] text-rose-700">Absent</div><strong className="text-sm text-rose-800">{att.monthSummary.absent}</strong></div>
              <div className="p-2 bg-purple-50 rounded-lg border border-purple-200"><div className="text-[10px] text-purple-700">Paid Leave</div><strong className="text-sm text-purple-800">{att.monthSummary.paidLeave}</strong></div>
              <div className="p-2 bg-purple-50 rounded-lg border border-purple-200"><div className="text-[10px] text-purple-700">Unpaid Lv</div><strong className="text-sm text-purple-800">{att.monthSummary.unpaidLeave}</strong></div>
              <div className="p-2 bg-blue-50 rounded-lg border border-blue-200"><div className="text-[10px] text-blue-700">Hol / Off</div><strong className="text-sm text-blue-800">{att.monthSummary.holiday + att.monthSummary.weekend}</strong></div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-200"><div className="text-[10px] text-slate-500">Worked Hrs</div><strong className="text-sm font-mono">{att.monthSummary.workedHours}h</strong></div>
              <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200"><div className="text-[10px] text-emerald-700">OT Hours</div><strong className="text-sm font-mono text-emerald-800">{att.monthSummary.overtimeHours}h</strong></div>
            </div>

            {/* Color-Coded Monthly Calendar */}
            <div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 uppercase mb-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1 text-xs">
                {calendarCells.map((cell, i) => {
                  if (!cell) return <div key={`empty-${i}`} className="h-14 bg-slate-50/40 rounded-lg" />;
                  const st = cell.record?.status || (cell.holidayTitle ? 'Holiday' : '');
                  const color =
                    st === 'Present'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : st === 'Late' || st === 'Half-day'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : st === 'Absent'
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : st === 'Leave'
                      ? 'bg-purple-50 border-purple-200 text-purple-900'
                      : st === 'Holiday' || st === 'Weekend'
                      ? 'bg-blue-50 border-blue-200 text-blue-800'
                      : 'bg-white border-slate-200 text-slate-600';
                  return (
                    <div
                      key={cell.iso}
                      className={`h-14 p-1.5 rounded-lg border flex flex-col justify-between ${color}`}
                    >
                      <span className="font-bold text-[11px]">{cell.day}</span>
                      <span className="text-[10px] font-semibold truncate">
                        {st || '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Day-by-Day Log Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
              Day-by-Day Breakdown ({MONTH_NAMES[month - 1]} {year})
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Check In</th>
                  <th className="px-4 py-2.5">Check Out</th>
                  <th className="px-4 py-2.5 text-right">Worked</th>
                  <th className="px-4 py-2.5 text-right">Late / OT</th>
                  <th className="px-4 py-2.5">Source</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(att.monthAttendance || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No attendance records for {MONTH_NAMES[month - 1]} {year}.
                    </td>
                  </tr>
                ) : (
                  att.monthAttendance.map((d: any) => (
                    <tr key={d._id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-medium">{formatDate(d.date)}</td>
                      <td className="px-4 py-2.5 font-mono">{formatTimeDhaka(d.first_in)}</td>
                      <td className="px-4 py-2.5 font-mono">{formatTimeDhaka(d.last_out)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">{d.worked_hours}h</td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {d.late_minutes > 0 && <span className="text-amber-700 mr-2">{d.late_minutes}m late</span>}
                        {d.overtime_hours > 0 && <span className="text-emerald-700 font-bold">+{d.overtime_hours}h OT</span>}
                        {!d.late_minutes && !d.overtime_hours && '—'}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-600">{d.source}</td>
                      <td className="px-4 py-2.5 text-center">{getStatusBadge(d.status)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 12-Month History Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
              Month-wise Attendance Summary ({year})
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Month</th>
                  <th className="px-4 py-2.5 text-right">Present</th>
                  <th className="px-4 py-2.5 text-right">Late</th>
                  <th className="px-4 py-2.5 text-right">Half-day</th>
                  <th className="px-4 py-2.5 text-right">Absent</th>
                  <th className="px-4 py-2.5 text-right">Leave</th>
                  <th className="px-4 py-2.5 text-right">Worked Hrs</th>
                  <th className="px-4 py-2.5 text-right">OT Hrs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(att.monthlyHistory || []).map((row: any) => (
                  <tr
                    key={row.month}
                    onClick={() => setMonth(row.month)}
                    className={`cursor-pointer hover:bg-slate-50 ${
                      row.month === month ? 'bg-emerald-50/40 font-semibold' : ''
                    }`}
                  >
                    <td className="px-4 py-2">{MONTH_NAMES[row.month - 1]}</td>
                    <td className="px-4 py-2 text-right font-mono text-emerald-700">{row.present}</td>
                    <td className="px-4 py-2 text-right font-mono text-amber-700">{row.late}</td>
                    <td className="px-4 py-2 text-right font-mono">{row.halfDay}</td>
                    <td className="px-4 py-2 text-right font-mono text-rose-700">{row.absent}</td>
                    <td className="px-4 py-2 text-right font-mono text-purple-700">{row.leave}</td>
                    <td className="px-4 py-2 text-right font-mono">{row.workedHours}h</td>
                    <td className="px-4 py-2 text-right font-mono">{row.overtimeHours}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SALARY & PAYSLIPS */}
      {activeTab === 'salary' && perms.canViewSalary && (
        <div className="space-y-5">
          {/* YTD Totals */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200"><div className="text-[10px] text-slate-500 uppercase">{year} Gross Earned</div><div className="text-lg font-bold font-mono mt-0.5">{formatBDT(sal?.ytd?.totalEarnedGross || 0)}</div></div>
            <div className="bg-white p-3.5 rounded-xl border border-emerald-200"><div className="text-[10px] text-emerald-700 uppercase">{year} Net Paid</div><div className="text-lg font-bold font-mono text-emerald-800 mt-0.5">{formatBDT(sal?.ytd?.totalPaid || 0)}</div></div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200"><div className="text-[10px] text-slate-500 uppercase">{year} Deductions</div><div className="text-lg font-bold font-mono text-rose-700 mt-0.5">{formatBDT(sal?.ytd?.totalDeductions || 0)}</div></div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200"><div className="text-[10px] text-slate-500 uppercase">{year} Tax (TDS)</div><div className="text-lg font-bold font-mono mt-0.5">{formatBDT(sal?.ytd?.totalTax || 0)}</div></div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200"><div className="text-[10px] text-slate-500 uppercase">{year} Provident Fund</div><div className="text-lg font-bold font-mono mt-0.5">{formatBDT(sal?.ytd?.totalPF || 0)}</div></div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200"><div className="text-[10px] text-slate-500 uppercase">{year} Overtime Paid</div><div className="text-lg font-bold font-mono text-emerald-700 mt-0.5">{formatBDT(sal?.ytd?.totalOvertimePaid || 0)}</div></div>
          </div>

          {/* Active Contract & Rules */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-900">Active Payroll Contract</h3>
              <span className="font-mono text-slate-500">
                Structure: <strong>{sal?.activeContract?.structure_id?.name || 'Not Assigned'}</strong>
              </span>
            </div>
            {(sal?.rules || []).length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {sal.rules.map((r: any) => (
                  <div key={r._id} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="font-semibold text-slate-800">{r.name}</div>
                    <div className="text-[11px] font-mono text-slate-500">
                      {r.category} • {r.type === 'percentage_of_basic' ? `${r.amount_or_percentage}%` : r.type === 'fixed' ? formatBDT(r.amount_or_percentage) : 'Formula'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400">No active contract assigned yet in Payroll Contracts.</p>
            )}
          </div>

          {/* Month-wise Payslips List */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
              Month-wise Payslips Taken / Generated
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Month / Year</th>
                  <th className="px-4 py-2.5">Payslip No</th>
                  <th className="px-4 py-2.5 text-right">Gross Pay</th>
                  <th className="px-4 py-2.5 text-right">Deductions</th>
                  <th className="px-4 py-2.5 text-right">Net Pay</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                  <th className="px-4 py-2.5">Paid Date</th>
                  <th className="px-4 py-2.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(sal?.payslips || []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No payslips generated yet for this employee.
                    </td>
                  </tr>
                ) : (
                  sal.payslips.map((p: any) => (
                    <tr key={p._id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-semibold">
                        {MONTH_NAMES[(p.month || 1) - 1]} {p.year}
                      </td>
                      <td className="px-4 py-2.5 font-mono">{p.payslip_no}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatBDT(p.gross_pay)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-rose-700">
                        -{formatBDT(p.total_deductions)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700">
                        {formatBDT(p.net_pay)}
                      </td>
                      <td className="px-4 py-2.5 text-center">{getStatusBadge(p.status)}</td>
                      <td className="px-4 py-2.5">
                        {p.paid_at ? formatDate(p.paid_at) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/payroll/payslips/${p._id}`}
                          className="inline-flex items-center gap-1 text-emerald-700 font-semibold hover:underline"
                        >
                          View / PDF <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Salary History */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
              Salary Increments &amp; History
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Effective Date</th>
                  <th className="px-4 py-2.5 text-right">Previous Basic</th>
                  <th className="px-4 py-2.5 text-right">New Basic</th>
                  <th className="px-4 py-2.5">Reason</th>
                  <th className="px-4 py-2.5">Updated By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(sal?.salaryHistory || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No salary change history recorded yet.
                    </td>
                  </tr>
                ) : (
                  sal.salaryHistory.map((h: any) => (
                    <tr key={h._id}>
                      <td className="px-4 py-2.5">{formatDate(h.effective_date)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatBDT(h.previous_basic)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700">
                        {formatBDT(h.new_basic)}
                      </td>
                      <td className="px-4 py-2.5">{h.reason || '—'}</td>
                      <td className="px-4 py-2.5">{h.changed_by}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: LEAVES */}
      {activeTab === 'leaves' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {(data.leaves?.summary || []).map((ls: any) => (
              <div key={ls.type} className="bg-white p-3.5 rounded-xl border border-slate-200 text-xs">
                <div className="font-bold text-slate-800">{ls.type} Leave</div>
                <div className="mt-1 text-slate-600">
                  Used: <strong>{ls.used}d</strong> {ls.allowed > 0 ? `/ ${ls.allowed}d` : ''}
                </div>
                {ls.remaining !== null && (
                  <div className="text-[11px] text-emerald-700 font-semibold">
                    Remaining: {ls.remaining}d
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Start Date</th>
                  <th className="px-4 py-2.5">End Date</th>
                  <th className="px-4 py-2.5">Reason</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data.leaves?.history || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No leave history.
                    </td>
                  </tr>
                ) : (
                  data.leaves.history.map((lv: any) => (
                    <tr key={lv._id}>
                      <td className="px-4 py-2.5 font-semibold">{lv.leave_type}</td>
                      <td className="px-4 py-2.5">{formatDate(lv.start_date)}</td>
                      <td className="px-4 py-2.5">{formatDate(lv.end_date)}</td>
                      <td className="px-4 py-2.5">{lv.reason || '—'}</td>
                      <td className="px-4 py-2.5 text-center">{getStatusBadge(lv.status)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: DOCUMENTS */}
      {activeTab === 'documents' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Uploaded Employee Documents</h3>
            {perms.canViewAudit && (
              <Link
                href={`/hrm/employees/${emp._id}/edit`}
                className="text-xs font-semibold text-emerald-700 hover:underline"
              >
                Upload / Manage in Edit Form →
              </Link>
            )}
          </div>
          {(emp.documents || []).length === 0 ? (
            <p className="text-xs text-slate-400">No documents attached yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {emp.documents.map((doc: any, idx: number) => (
                <div
                  key={`${doc.url}-${idx}`}
                  className="px-4 py-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <Badge variant="default">{doc.category}</Badge>
                    <span className="font-semibold text-slate-900">{doc.title}</span>
                  </div>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold text-slate-800"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: ACTIVITY / AUDIT LOG */}
      {activeTab === 'audit' && perms.canViewAudit && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">By</th>
                <th className="px-4 py-2.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data.auditLogs || []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">
                    No audit activity recorded yet.
                  </td>
                </tr>
              ) : (
                data.auditLogs.map((log: any) => (
                  <tr key={log._id}>
                    <td className="px-4 py-2.5 whitespace-nowrap font-mono">
                      {formatDate(log.timestamp)} {formatTimeDhaka(log.timestamp)}
                    </td>
                    <td className="px-4 py-2.5 font-semibold flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      {log.action}
                    </td>
                    <td className="px-4 py-2.5">{log.userName} ({log.userRole})</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500 max-w-md truncate">
                      {JSON.stringify(log.newValues || log.oldValues || {})}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

