'use client';

import React, { useEffect, useState } from 'react';
import {
  Clock,
  LogIn,
  LogOut,
  MapPin,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  FileWarning,
  Check,
  X,
  UserCheck,
} from 'lucide-react';
import { formatDate } from '@/lib/formatters';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/components/layout/DashboardLayout';

const MONTHS = [
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

const DEPARTMENTS = [
  'all',
  'Visa',
  'Training',
  'Accounts',
  'Agent',
  'Counseling',
  'Administration',
  'Other',
];

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtInputTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function AttendanceDashboardView() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const now = new Date();
  const todayDhaka = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(now);

  const [activeTab, setActiveTab] = useState<'my' | 'roster' | 'range' | 'corrections'>(
    isAdmin ? 'roster' : 'my'
  );

  // My Calendar State
  const [myMonth, setMyMonth] = useState<number>(now.getMonth() + 1);
  const [myYear, setMyYear] = useState<number>(now.getFullYear());
  const [myData, setMyData] = useState<any | null>(null);
  const [locationNote, setLocationNote] = useState('');

  // Roster State (HR / Admin)
  const [rosterDate, setRosterDate] = useState(todayDhaka);
  const [rosterDept, setRosterDept] = useState('all');
  const [rosterStatus, setRosterStatus] = useState('all');
  const [rosterData, setRosterData] = useState<any | null>(null);

  // Date-Range Report State
  const [rangeStart, setRangeStart] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  );
  const [rangeEnd, setRangeEnd] = useState(todayDhaka);
  const [rangeRecords, setRangeRecords] = useState<any[]>([]);

  // Corrections State
  const [corrections, setCorrections] = useState<any[]>([]);
  const [isCorrModalOpen, setIsCorrModalOpen] = useState(false);
  const [corrForm, setCorrForm] = useState({
    date: todayDhaka,
    requested_in_time: '09:00',
    requested_out_time: '18:00',
    reason: '',
  });

  // HR Manual Edit Modal
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    employee_id: '',
    employee_name: '',
    date: todayDhaka,
    check_in_time: '09:00',
    check_out_time: '18:00',
    status_override: '',
    reason: '',
  });

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const reqs: Promise<Response>[] = [
        fetch(`/api/attendance/daily?mode=my&month=${myMonth}&year=${myYear}`),
        fetch('/api/attendance/corrections'),
      ];
      if (isAdmin) {
        reqs.push(
          fetch(
            `/api/attendance/daily?mode=roster&date=${rosterDate}&department=${rosterDept}&status=${rosterStatus}`
          )
        );
        reqs.push(
          fetch(
            `/api/attendance/daily?mode=roster&startDate=${rangeStart}&endDate=${rangeEnd}&department=${rosterDept}&status=${rosterStatus}`
          )
        );
      }

      const [myRes, corrRes, rosRes, rngRes] = await Promise.all(reqs);
      const myJson = await myRes.json();
      const corrJson = await corrRes.json();

      if (myJson.success) setMyData(myJson.data);
      if (corrJson.success) setCorrections(corrJson.data || []);

      if (rosRes) {
        const rosJson = await rosRes.json();
        if (rosJson.success) setRosterData(rosJson.data);
      }
      if (rngRes) {
        const rngJson = await rngRes.json();
        if (rngJson.success) setRangeRecords(rngJson.data?.records || []);
      }
    } catch (err) {
      console.error('Failed to load attendance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myMonth, myYear, rosterDate, rosterDept, rosterStatus, rangeStart, rangeEnd, isAdmin]);

  const handleSelfPunch = async (punchType: 'IN' | 'OUT') => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/attendance/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'self',
          punch_type: punchType,
          location: locationNote,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Punch failed');
      setBanner({ type: 'ok', msg: json.message });
      setLocationNote('');
      loadAll();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/attendance/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'hr_manual',
          employee_id: manualForm.employee_id,
          date: manualForm.date,
          check_in_time: manualForm.check_in_time || undefined,
          check_out_time: manualForm.check_out_time || undefined,
          status_override: manualForm.status_override || '',
          reason: manualForm.reason,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Save failed');
      setIsManualModalOpen(false);
      setBanner({ type: 'ok', msg: json.message });
      loadAll();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleAutoMarkAbsent = async () => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/attendance/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto_mark_absent', date: rosterDate }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Auto-absent failed');
      setBanner({ type: 'ok', msg: json.message });
      loadAll();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/attendance/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corrForm),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Submit failed');
      setIsCorrModalOpen(false);
      setCorrForm({ ...corrForm, reason: '' });
      setBanner({ type: 'ok', msg: json.message });
      loadAll();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleReviewCorrection = async (id: string, status: 'Approved' | 'Rejected') => {
    const res = await fetch('/api/attendance/corrections', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correction_id: id, status }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setBanner({ type: 'err', msg: json.message || 'Review failed' });
      return;
    }
    setBanner({ type: 'ok', msg: json.message });
    loadAll();
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'Present':
        return <Badge variant="success">Present</Badge>;
      case 'Late':
        return <Badge variant="warning">Late</Badge>;
      case 'Half-day':
        return <Badge variant="info">Half-day</Badge>;
      case 'Absent':
        return <Badge variant="danger">Absent</Badge>;
      case 'Leave':
        return <Badge variant="purple">Leave</Badge>;
      case 'Holiday':
        return <Badge variant="default">Holiday</Badge>;
      case 'Weekend':
        return <Badge variant="gray">Weekend</Badge>;
      default:
        return <Badge variant="gray">Not Marked</Badge>;
    }
  };

  const myEmp = myData?.myEmployee;
  const todayRec = myData?.todayRecord;
  const rosterSummary = rosterData?.summary || {
    total: 0,
    present: 0,
    late: 0,
    halfDay: 0,
    absent: 0,
    onLeave: 0,
    holidayOrWeekend: 0,
    unmarked: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Attendance &amp; Daily Summary
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Schedule-aware punches, overtime &amp; late calculation, corrections, and live roster.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {myEmp && (
            <button
              type="button"
              onClick={() => setIsCorrModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
            >
              <FileWarning className="w-3.5 h-3.5 text-amber-600" />
              <span>Request Correction</span>
            </button>
          )}
          <button
            type="button"
            onClick={loadAll}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Employee Self Check-In / Check-Out Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            {myEmp ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-sm">
                    {myEmp.firstName} {myEmp.lastName} ({myEmp.employee_id})
                  </h3>
                  {myData?.schedule && (
                    <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {myData.schedule.name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Today ({todayDhaka}):{' '}
                  {todayRec ? (
                    <span className="font-semibold text-slate-800">
                      First In: {fmtTime(todayRec.first_in)} • Last Out: {fmtTime(todayRec.last_out)}{' '}
                      • Worked: {todayRec.worked_hours || 0}h •{' '}
                      <span className="text-emerald-700">{todayRec.status}</span>
                    </span>
                  ) : (
                    <span>No punch recorded yet today</span>
                  )}
                </p>
              </>
            ) : (
              <>
                <h3 className="font-bold text-slate-800 text-sm">Self Check-In / Check-Out</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Link your ERP user account to an Employee profile in Employees &amp; Agents to punch directly.
                </p>
              </>
            )}
          </div>
        </div>

        {myEmp && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Location / Office note (optional)"
                value={locationNote}
                onChange={(e) => setLocationNote(e.target.value)}
                className="pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg w-52"
              />
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => handleSelfPunch('IN')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              <span>Check In</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => handleSelfPunch('OUT')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs disabled:opacity-50"
            >
              <LogOut className="w-4 h-4" />
              <span>Check Out</span>
            </button>
          </div>
        )}
      </div>

      {banner && (
        <div
          className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 border ${
            banner.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {banner.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{banner.msg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-semibold w-fit">
        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('roster')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'roster' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Live Daily Roster
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('my')}
          className={`px-3 py-1.5 rounded-md transition-all ${
            activeTab === 'my' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          My Calendar &amp; Summary
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('range')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'range' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Date-Range &amp; Dept Log
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('corrections')}
          className={`px-3 py-1.5 rounded-md transition-all ${
            activeTab === 'corrections' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          Corrections ({corrections.filter((c) => c.status === 'Pending').length} Pending)
        </button>
      </div>

      {/* TAB 1: HR / ADMIN LIVE DAILY ROSTER */}
      {activeTab === 'roster' && isAdmin && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={rosterDate}
                onChange={(e) => setRosterDate(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
              />
              <select
                value={rosterDept}
                onChange={(e) => setRosterDept(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d === 'all' ? 'Dept: All' : d}
                  </option>
                ))}
              </select>
              <select
                value={rosterStatus}
                onChange={(e) => setRosterStatus(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="all">Status: All</option>
                <option value="Present">Present</option>
                <option value="Late">Late</option>
                <option value="Half-day">Half-day</option>
                <option value="Absent">Absent</option>
                <option value="Leave">Leave</option>
                <option value="Unmarked">Not Marked</option>
              </select>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={handleAutoMarkAbsent}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Run Auto-Mark Absent / Holiday ({rosterDate})</span>
            </button>
          </div>

          {/* Live Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-emerald-200">
              <span className="text-[11px] font-semibold text-emerald-700 uppercase">Present</span>
              <p className="text-xl font-bold text-emerald-800 mt-0.5">{rosterSummary.present}</p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-amber-200">
              <span className="text-[11px] font-semibold text-amber-700 uppercase">Late</span>
              <p className="text-xl font-bold text-amber-800 mt-0.5">{rosterSummary.late}</p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-rose-200">
              <span className="text-[11px] font-semibold text-rose-700 uppercase">Absent</span>
              <p className="text-xl font-bold text-rose-800 mt-0.5">{rosterSummary.absent}</p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-purple-200">
              <span className="text-[11px] font-semibold text-purple-700 uppercase">Leave</span>
              <p className="text-xl font-bold text-purple-800 mt-0.5">{rosterSummary.onLeave}</p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Not Marked</span>
              <p className="text-xl font-bold text-slate-700 mt-0.5">{rosterSummary.unmarked}</p>
            </div>
          </div>

          {/* Roster Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">First In</th>
                  <th className="px-4 py-3">Last Out</th>
                  <th className="px-4 py-3 text-right">Worked / OT</th>
                  <th className="px-4 py-3 text-right">Late (min)</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Manual Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(rosterData?.roster || []).map((row: any) => {
                  const d = row.daily;
                  return (
                    <tr key={row.employee._id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">
                          {row.employee.firstName} {row.employee.lastName}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {row.employee.employee_id}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">
                          {row.employee.department}
                        </span>{' '}
                        • {row.employee.designation}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                        {fmtTime(d?.first_in)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                        {fmtTime(d?.last_out)}
                        {d?.missing_checkout && (
                          <span className="ml-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                            No Out
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-mono text-xs">
                        <span className="font-semibold text-slate-800">
                          {d?.worked_hours || 0}h
                        </span>
                        {d?.overtime_hours > 0 && (
                          <span className="ml-1 text-emerald-700 font-bold">
                            (+{d.overtime_hours}h OT)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-mono text-xs">
                        {d?.late_minutes > 0 ? (
                          <span className="text-amber-700 font-bold">{d.late_minutes}m</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {getStatusBadge(d?.status)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setManualForm({
                              employee_id: row.employee._id,
                              employee_name: `${row.employee.firstName} ${row.employee.lastName}`,
                              date: rosterDate,
                              check_in_time: fmtInputTime(d?.first_in) || '09:00',
                              check_out_time: fmtInputTime(d?.last_out) || '18:00',
                              status_override: '',
                              reason: '',
                            });
                            setIsManualModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                        >
                          <Edit3 className="w-3 h-3" /> Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: MY ATTENDANCE CALENDAR & MONTHLY SUMMARY */}
      {activeTab === 'my' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <select
                value={myMonth}
                onChange={(e) => setMyMonth(Number(e.target.value))}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
              >
                {MONTHS.map((m, idx) => (
                  <option key={m} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={myYear}
                onChange={(e) => setMyYear(Number(e.target.value))}
                className="w-24 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg font-mono"
              />
            </div>

            {myData?.summary && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-md font-semibold">
                  Present: {myData.summary.present}
                </span>
                <span className="px-2.5 py-1 bg-amber-50 text-amber-800 rounded-md font-semibold">
                  Late: {myData.summary.late}
                </span>
                <span className="px-2.5 py-1 bg-rose-50 text-rose-800 rounded-md font-semibold">
                  Absent: {myData.summary.absent}
                </span>
                <span className="px-2.5 py-1 bg-blue-50 text-blue-800 rounded-md font-semibold">
                  Worked: {myData.summary.workedHours}h (OT: {myData.summary.overtimeHours}h)
                </span>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">First In</th>
                  <th className="px-4 py-3">Last Out</th>
                  <th className="px-4 py-3 text-right">Worked Hours</th>
                  <th className="px-4 py-3 text-right">Late / OT</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(myData?.days || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-xs text-slate-400">
                      No daily attendance records for {MONTHS[myMonth - 1]} {myYear}.
                    </td>
                  </tr>
                ) : (
                  (myData?.days || []).map((d: any) => (
                    <tr key={d._id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-800 text-xs">
                        {formatDate(d.date)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{fmtTime(d.first_in)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{fmtTime(d.last_out)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold">
                        {d.worked_hours || 0}h
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {d.late_minutes > 0 && (
                          <span className="text-amber-700 mr-2">{d.late_minutes}m late</span>
                        )}
                        {d.overtime_hours > 0 && (
                          <span className="text-emerald-700 font-bold">+{d.overtime_hours}h OT</span>
                        )}
                        {!d.late_minutes && !d.overtime_hours && '—'}
                      </td>
                      <td className="px-4 py-3 text-center">{getStatusBadge(d.status)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DATE-RANGE & DEPT LOG */}
      {activeTab === 'range' && isAdmin && (
        <div className="space-y-4">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-slate-600">From:</span>
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-slate-600">To:</span>
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
            <select
              value={rosterDept}
              onChange={(e) => setRosterDept(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d === 'all' ? 'Dept: All' : d}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">In / Out</th>
                  <th className="px-4 py-3 text-right">Worked</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rangeRecords.map((rec) => (
                  <tr key={rec._id} className="hover:bg-slate-50/70 text-xs">
                    <td className="px-4 py-3 font-medium">{formatDate(rec.date)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {rec.employee_id?.firstName} {rec.employee_id?.lastName}{' '}
                      <span className="font-mono text-slate-400">
                        ({rec.employee_id?.employee_id})
                      </span>
                    </td>
                    <td className="px-4 py-3">{rec.employee_id?.department}</td>
                    <td className="px-4 py-3 font-mono">
                      {fmtTime(rec.first_in)} → {fmtTime(rec.last_out)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {rec.worked_hours}h
                    </td>
                    <td className="px-4 py-3 text-center">{getStatusBadge(rec.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: CORRECTIONS QUEUE */}
      {activeTab === 'corrections' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Requested Times</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {corrections.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-slate-400">
                    No attendance correction requests.
                  </td>
                </tr>
              ) : (
                corrections.map((c) => (
                  <tr key={c._id} className="hover:bg-slate-50/70 text-xs">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {c.employee_id?.firstName} {c.employee_id?.lastName}
                    </td>
                    <td className="px-4 py-3">{formatDate(c.date)}</td>
                    <td className="px-4 py-3 font-mono">
                      In: {fmtTime(c.requested_in)} • Out: {fmtTime(c.requested_out)}
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate">{c.reason}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant={
                          c.status === 'Approved'
                            ? 'success'
                            : c.status === 'Rejected'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.status === 'Pending' && isAdmin ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleReviewCorrection(c._id, 'Approved')}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-emerald-600 rounded"
                          >
                            <Check className="w-3 h-3" /> Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewCorrection(c._id, 'Rejected')}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded"
                          >
                            <X className="w-3 h-3" /> Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">{c.reviewed_by || '—'}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* HR Manual Entry Modal */}
      <Modal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        title={`Manual Attendance: ${manualForm.employee_name}`}
        description={`Date: ${manualForm.date} • Every edit is logged in System Audit Logs`}
        maxWidth="md"
      >
        <form onSubmit={handleManualSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Check In</label>
              <input
                type="time"
                value={manualForm.check_in_time}
                onChange={(e) => setManualForm({ ...manualForm, check_in_time: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Check Out</label>
              <input
                type="time"
                value={manualForm.check_out_time}
                onChange={(e) => setManualForm({ ...manualForm, check_out_time: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Status Override (Leave blank to auto-calculate from times)
            </label>
            <select
              value={manualForm.status_override}
              onChange={(e) => setManualForm({ ...manualForm, status_override: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            >
              <option value="">Auto-calculate from Schedule &amp; Times</option>
              <option value="Present">Present</option>
              <option value="Late">Late</option>
              <option value="Half-day">Half-day</option>
              <option value="Absent">Absent</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason for Manual Entry / Edit *
            </label>
            <input
              type="text"
              required
              value={manualForm.reason}
              onChange={(e) => setManualForm({ ...manualForm, reason: e.target.value })}
              placeholder="e.g. Forgot biometric punch / Field visit"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsManualModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Save & Recalculate'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Employee Correction Request Modal */}
      <Modal
        isOpen={isCorrModalOpen}
        onClose={() => setIsCorrModalOpen(false)}
        title="Request Attendance Correction"
        maxWidth="md"
      >
        <form onSubmit={handleSubmitCorrection} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Date *</label>
            <input
              type="date"
              required
              value={corrForm.date}
              onChange={(e) => setCorrForm({ ...corrForm, date: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Correct In Time
              </label>
              <input
                type="time"
                value={corrForm.requested_in_time}
                onChange={(e) => setCorrForm({ ...corrForm, requested_in_time: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Correct Out Time
              </label>
              <input
                type="time"
                value={corrForm.requested_out_time}
                onChange={(e) => setCorrForm({ ...corrForm, requested_out_time: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reason *</label>
            <textarea
              rows={2}
              required
              value={corrForm.reason}
              onChange={(e) => setCorrForm({ ...corrForm, reason: e.target.value })}
              placeholder="Explain why attendance needs correction..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsCorrModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              Submit Request
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

