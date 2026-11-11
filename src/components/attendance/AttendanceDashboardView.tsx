'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
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
  CalendarPlus,
  Plus,
  CheckCheck,
} from 'lucide-react';
import {
  EMPLOYEE_DEPARTMENTS,
  formatDate,
  formatTimeDhaka,
  getTodayDhaka,
  toDhakaTimeInput,
} from '@/lib/formatters';
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

const DEPARTMENTS = ['all', ...EMPLOYEE_DEPARTMENTS];

export function AttendanceDashboardView() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const now = new Date();
  const todayDhaka = getTodayDhaka();

  const [activeTab, setActiveTab] = useState<'my' | 'roster' | 'range' | 'corrections' | 'leaves'>(
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
  const [rosterSource, setRosterSource] = useState('all');
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

  // Leaves State
  const [leaves, setLeaves] = useState<any[]>([]);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    employee_id: '',
    leave_type: 'Casual',
    start_date: todayDhaka,
    end_date: todayDhaka,
    reason: '',
  });

  // HR Manual Entry Modal
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    employee_id: '',
    employee_name: '',
    date: todayDhaka,
    check_in_time: '09:00',
    check_out_time: '18:00',
    status_override: '',
    leave_type: 'Casual',
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
        fetch('/api/hrm/leaves'),
      ];
      if (isAdmin) {
        reqs.push(
          fetch(
            `/api/attendance/daily?mode=roster&date=${rosterDate}&department=${rosterDept}&status=${rosterStatus}&source=${rosterSource}`
          )
        );
        reqs.push(
          fetch(
            `/api/attendance/daily?mode=roster&startDate=${rangeStart}&endDate=${rangeEnd}&department=${rosterDept}&status=${rosterStatus}&source=${rosterSource}`
          )
        );
      }

      const [myRes, corrRes, leaveRes, rosRes, rngRes] = await Promise.all(reqs);
      const myJson = await myRes.json();
      const corrJson = await corrRes.json();
      const leaveJson = await leaveRes.json();

      if (myJson.success) setMyData(myJson.data);
      if (corrJson.success) setCorrections(corrJson.data || []);
      if (leaveJson.success) setLeaves(leaveJson.data || []);

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
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) loadAll();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myMonth, myYear, rosterDate, rosterDept, rosterStatus, rosterSource, rangeStart, rangeEnd, isAdmin]);

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

  const handleQuickManualMark = async (
    employeeId: string,
    status: 'Present' | 'Late' | 'Half-day' | 'Absent'
  ) => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/attendance/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'hr_manual',
          employee_id: employeeId,
          date: rosterDate,
          quick_status: status,
          reason: `Quick manual mark (${status})`,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Quick mark failed');
      setBanner({ type: 'ok', msg: json.message });
      loadAll();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleBulkMarkUnmarkedPresent = async () => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/attendance/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'hr_bulk_present',
          date: rosterDate,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Bulk mark failed');
      setBanner({ type: 'ok', msg: json.message });
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
          check_in_time:
            manualForm.status_override === 'Absent' || manualForm.status_override === 'Leave'
              ? undefined
              : manualForm.check_in_time || undefined,
          check_out_time:
            manualForm.status_override === 'Absent' || manualForm.status_override === 'Leave'
              ? undefined
              : manualForm.check_out_time || undefined,
          status_override: manualForm.status_override || '',
          leave_type:
            manualForm.status_override === 'Leave' ? manualForm.leave_type : undefined,
          quick_status: manualForm.status_override === 'Absent' ? 'Absent' : undefined,
          reason: manualForm.reason || 'Manual HR attendance entry',
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

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/hrm/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leaveForm),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Leave submission failed');
      setIsLeaveModalOpen(false);
      setLeaveForm({ ...leaveForm, reason: '' });
      setBanner({ type: 'ok', msg: json.message });
      loadAll();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleReviewLeave = async (leaveId: string, status: 'Approved' | 'Rejected') => {
    const res = await fetch('/api/hrm/leaves', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leave_id: leaveId, status }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setBanner({ type: 'err', msg: json.message || 'Leave review failed' });
      return;
    }
    setBanner({ type: 'ok', msg: json.message });
    loadAll();
  };

  const openNewManualModal = () => {
    const firstEmp = (rosterData?.roster || [])[0]?.employee;
    setManualForm({
      employee_id: firstEmp?._id || '',
      employee_name: firstEmp ? `${firstEmp.firstName} ${firstEmp.lastName}` : '',
      date: rosterDate,
      check_in_time: '09:00',
      check_out_time: '18:00',
      status_override: '',
      leave_type: 'Casual',
      reason: 'Manual HR attendance entry',
    });
    setIsManualModalOpen(true);
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
            Biometric, web check-in, and quick HR manual attendance maintained together in one roster.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={openNewManualModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Manual Attendance</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsLeaveModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <CalendarPlus className="w-3.5 h-3.5 text-emerald-600" />
            <span>Request Leave</span>
          </button>
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
                      First In: {formatTimeDhaka(todayRec.first_in)} • Last Out: {formatTimeDhaka(todayRec.last_out)}{' '}
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
          myData?.todayHoliday || myData?.todayWeeklyOff ? (
            <div className="px-3.5 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {myData.todayBlockReason ||
                  (myData.todayHoliday
                    ? `Holiday: ${myData.todayHoliday.title}`
                    : `Weekly Off Day: ${myData.todayWeeklyOff?.dayName}`)}{' '}
                — Check-In / Out closed.
              </span>
            </div>
          ) : (
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
              title="Check In"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              <span>Check In</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => handleSelfPunch('OUT')}
              title="Check Out"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs disabled:opacity-50"
            >
              <LogOut className="w-4 h-4" />
              <span>Check Out</span>
            </button>
          </div>
          )
        )}
      </div>

      {myData?.todayHoliday && (
        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-blue-700 shrink-0" />
          <span>
            <strong>Holiday Today ({todayDhaka}):</strong> {myData.todayHoliday.title} (
            {myData.todayHoliday.type} Holiday)
            {myData.todayHoliday.description ? ` — ${myData.todayHoliday.description}` : ''}. Self
            Check-In / Check-Out is blocked.
          </span>
        </div>
      )}

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
            Live Roster &amp; Manual Entry
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
        <button
          type="button"
          onClick={() => setActiveTab('leaves')}
          className={`px-3 py-1.5 rounded-md transition-all ${
            activeTab === 'leaves' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          Leaves ({leaves.filter((l) => l.status === 'Pending').length} Pending)
        </button>
      </div>

      {/* TAB 1: HR / ADMIN LIVE DAILY ROSTER + QUICK MANUAL ATTENDANCE */}
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
              <select
                value={rosterSource}
                onChange={(e) => setRosterSource(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="all">Source: All</option>
                <option value="Manual">Manual</option>
                <option value="Biometric">Biometric</option>
                <option value="Import">Import</option>
                <option value="Self Check-in">Self Check-in</option>
              </select>
            </div>

            {!(rosterData?.holiday || rosterData?.weeklyOff) ? (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/attendance/bulk"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Bulk Entry (Multi Check-in / Late)</span>
                </Link>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleBulkMarkUnmarkedPresent}
                  title="Mark Unmarked Present"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark Unmarked Present</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleAutoMarkAbsent}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Auto-Mark Absent ({rosterDate})</span>
                </button>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                {rosterData?.holiday
                  ? `Holiday (${rosterData.holiday.title}) — Present Section Hidden`
                  : `Weekly Off Day (${rosterData?.weeklyOff?.dayName}) — Present Section Hidden`}
              </span>
            )}
          </div>

          {(rosterData?.holiday || rosterData?.weeklyOff) && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 font-medium ${
                rosterData?.holiday
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <AlertTriangle
                className={`w-4 h-4 shrink-0 ${
                  rosterData?.holiday ? 'text-rose-600' : 'text-amber-600'
                }`}
              />
              <span>
                {rosterData?.holiday ? (
                  <>
                    <strong>Holiday Blocked ({rosterDate}):</strong> {rosterData.holiday.title} (
                    {rosterData.holiday.type} Holiday)
                    {rosterData.holiday.description
                      ? ` — ${rosterData.holiday.description}`
                      : ''}
                    . Present / Late / Half-day attendance section is closed on this holiday.
                  </>
                ) : (
                  <>
                    <strong>Weekly Off Day ({rosterDate} — {rosterData.weeklyOff?.dayName}):</strong>{' '}
                    {rosterData.blockReason ||
                      `Closed per ${rosterData.weeklyOff?.scheduleName || 'Working Schedule'}.`}{' '}
                    Present / Late / Half-day attendance section is closed on off days.
                  </>
                )}
              </span>
            </div>
          )}

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

          {/* Roster Table with 1-Click Manual Mark + Custom Edit */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">First In / Last Out</th>
                  <th className="px-4 py-3 text-right">Worked / OT</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Manual Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(rosterData?.roster || []).map((row: any) => {
                  const d = row.daily;
                  return (
                    <tr key={row.employee._id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link
                          href={`/hrm/employees/${row.employee._id}`}
                          className="font-semibold text-slate-900 hover:text-emerald-700 hover:underline block"
                        >
                          {row.employee.firstName} {row.employee.lastName}
                        </Link>
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
                        <div>
                          {formatTimeDhaka(d?.first_in)} → {formatTimeDhaka(d?.last_out)}
                          {d?.missing_checkout && (
                            <span className="ml-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                              No Out
                            </span>
                          )}
                        </div>
                        {(d?.manual_first_in || d?.biometric_first_in) && d?.has_manual_biometric_conflict && (
                          <div
                            title={d?.conflict_details || 'Manual vs Biometric time difference'}
                            className="mt-0.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                          >
                            <span>Conflict: M({formatTimeDhaka(d.manual_first_in)}) / B({formatTimeDhaka(d.biometric_first_in)})</span>
                          </div>
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
                        {d?.late_minutes > 0 && (
                          <span className="ml-1.5 text-amber-700 font-semibold">
                            ({d.late_minutes}m late)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          {getStatusBadge(d?.status)}
                          {d?.status === 'Leave' && d?.leave_id?.leave_type && (
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                d.leave_id.is_paid === false
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-purple-50 text-purple-700'
                              }`}
                            >
                              {d.leave_id.leave_type} (
                              {d.leave_id.is_paid === false ? 'Unpaid' : 'Paid'})
                            </span>
                          )}
                          {d?.source && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {d.source}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {rosterData?.holiday || rosterData?.weeklyOff ? (
                          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                            {rosterData?.holiday
                              ? `Holiday (${rosterData.holiday.title}) — Present Closed`
                              : `Weekly Off (${rosterData?.weeklyOff?.dayName}) — Present Closed`}
                          </span>
                        ) : (
                        <div className="inline-flex items-center gap-1">
                          {(['Present', 'Late', 'Half-day', 'Absent'] as const).map((st) => (
                              <button
                                key={st}
                                type="button"
                                disabled={busy}
                                onClick={() => handleQuickManualMark(row.employee._id, st)}
                                title={`Mark ${st}`}
                                className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                  d?.status === st
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {st === 'Half-day' ? 'Half' : st}
                              </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              setManualForm({
                                employee_id: row.employee._id,
                                employee_name: `${row.employee.firstName} ${row.employee.lastName}`,
                                date: rosterDate,
                                check_in_time: toDhakaTimeInput(d?.first_in) || '09:00',
                                check_out_time: toDhakaTimeInput(d?.last_out) || '18:00',
                                status_override: '',
                                leave_type: d?.leave_id?.leave_type || 'Casual',
                                reason: d?.notes || 'Manual HR attendance edit',
                              });
                              setIsManualModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded"
                            title="Custom Check-In/Out Times"
                          >
                            <Edit3 className="w-3 h-3" /> Time
                          </button>
                        </div>
                        )}
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
                      <td className="px-4 py-3 font-mono text-xs">{formatTimeDhaka(d.first_in)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{formatTimeDhaka(d.last_out)}</td>
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
            <select
              value={rosterSource}
              onChange={(e) => setRosterSource(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
            >
              <option value="all">Source: All</option>
              <option value="Manual">Manual</option>
              <option value="Biometric">Biometric</option>
              <option value="Import">Import</option>
              <option value="Self Check-in">Self Check-in</option>
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
                  <th className="px-4 py-3 text-center">Status / Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rangeRecords.map((rec) => (
                  <tr key={rec._id} className="hover:bg-slate-50/70 text-xs">
                    <td className="px-4 py-3 font-medium">{formatDate(rec.date)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {rec.employee_id?._id ? (
                        <Link
                          href={`/hrm/employees/${rec.employee_id._id}`}
                          className="hover:text-emerald-700 hover:underline"
                        >
                          {rec.employee_id.firstName} {rec.employee_id.lastName}
                        </Link>
                      ) : (
                        <>
                          {rec.employee_id?.firstName} {rec.employee_id?.lastName}
                        </>
                      )}{' '}
                      <span className="font-mono text-slate-400">
                        ({rec.employee_id?.employee_id})
                      </span>
                    </td>
                    <td className="px-4 py-3">{rec.employee_id?.department}</td>
                    <td className="px-4 py-3 font-mono">
                      <div>{formatTimeDhaka(rec.first_in)} → {formatTimeDhaka(rec.last_out)}</div>
                      {rec.has_manual_biometric_conflict && (
                        <div className="text-[10px] text-amber-700 font-sans">
                          {rec.conflict_details || 'Manual/Biometric conflict'}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {rec.worked_hours}h
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {getStatusBadge(rec.status)}
                        {rec.source && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {rec.source}
                          </span>
                        )}
                      </div>
                    </td>
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
                      In: {formatTimeDhaka(c.requested_in)} • Out: {formatTimeDhaka(c.requested_out)}
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

      {/* TAB 5: LEAVE REQUESTS */}
      {activeTab === 'leaves' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Leave Type</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3 text-center">Status</th>
                {isAdmin && <th className="px-4 py-3 text-right">Approval</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {leaves.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No leave requests recorded yet.
                  </td>
                </tr>
              ) : (
                leaves.map((lv) => (
                  <tr key={lv._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 whitespace-nowrap font-semibold text-slate-900">
                      {lv.employee_id?.firstName} {lv.employee_id?.lastName}{' '}
                      <span className="font-mono text-slate-400">
                        ({lv.employee_id?.employee_id})
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-semibold">
                      <div className="flex items-center gap-1.5">
                        <span>{lv.leave_type}</span>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            lv.is_paid === false || lv.leave_type === 'Unpaid'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {lv.is_paid === false || lv.leave_type === 'Unpaid'
                            ? 'Unpaid — Salary Deducted'
                            : 'Paid'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDate(lv.start_date)} → {formatDate(lv.end_date)}
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate">{lv.reason || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant={
                          lv.status === 'Approved'
                            ? 'success'
                            : lv.status === 'Rejected'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {lv.status}
                      </Badge>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {lv.status === 'Pending' ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleReviewLeave(lv._id, 'Approved')}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-emerald-600 rounded"
                            >
                              <Check className="w-3 h-3" /> Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewLeave(lv._id, 'Rejected')}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded"
                            >
                              <X className="w-3 h-3" /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400">{lv.reviewed_by || 'Admin'}</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* HR Manual Entry / Edit Modal (Supports any Employee & Date) */}
      <Modal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        title="Manual Attendance Entry / Edit"
        description="Maintain daily attendance manually (with In/Out times or status) alongside Biometric logs."
        maxWidth="md"
      >
        <form onSubmit={handleManualSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Employee *</label>
              <select
                required
                value={manualForm.employee_id}
                onChange={(e) => {
                  const id = e.target.value;
                  const found = (rosterData?.roster || []).find(
                    (r: any) => r.employee._id === id
                  )?.employee;
                  setManualForm({
                    ...manualForm,
                    employee_id: id,
                    employee_name: found ? `${found.firstName} ${found.lastName}` : '',
                  });
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">Select Employee...</option>
                {(rosterData?.roster || []).map((r: any) => (
                  <option key={r.employee._id} value={r.employee._id}>
                    {r.employee.firstName} {r.employee.lastName} ({r.employee.employee_id})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date *</label>
              <input
                type="date"
                required
                value={manualForm.date}
                onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Check In</label>
              <input
                type="time"
                disabled={manualForm.status_override === 'Absent'}
                value={manualForm.check_in_time}
                onChange={(e) => setManualForm({ ...manualForm, check_in_time: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Check Out</label>
              <input
                type="time"
                disabled={manualForm.status_override === 'Absent'}
                value={manualForm.check_out_time}
                onChange={(e) => setManualForm({ ...manualForm, check_out_time: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono disabled:bg-slate-100"
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
              <option value="Leave">Leave (Specify Type)</option>
            </select>
          </div>

          {manualForm.status_override === 'Leave' && (
            <div>
              <label className="block text-xs font-semibold text-purple-700 mb-1">
                Leave Type *
              </label>
              <select
                value={manualForm.leave_type}
                onChange={(e) => setManualForm({ ...manualForm, leave_type: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-purple-50 border border-purple-200 rounded-lg font-medium text-purple-900"
              >
                <option value="Casual">Casual Leave (Paid)</option>
                <option value="Sick">Sick Leave (Paid)</option>
                <option value="Earned">Earned Leave (Paid)</option>
                <option value="Emergency">Emergency Leave (Paid)</option>
                <option value="Unpaid">Unpaid Leave (Salary Deducted)</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Note / Reason (Optional)
            </label>
            <input
              type="text"
              value={manualForm.reason}
              onChange={(e) => setManualForm({ ...manualForm, reason: e.target.value })}
              placeholder="e.g. Manual HR entry / Field duty"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          {(() => {
            const modalHoliday = (rosterData?.activeHolidays || []).find(
              (h: { date: string; title: string; type: string; description?: string }) =>
                new Date(h.date).toISOString().split('T')[0] === manualForm.date
            );
            const isBlocked =
              Boolean(modalHoliday) && manualForm.status_override !== 'Absent';
            return (
              <>
                {modalHoliday && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>
                      <strong>Holiday ({manualForm.date}):</strong> {modalHoliday.title} (
                      {modalHoliday.type} Holiday)
                      {modalHoliday.description ? ` — ${modalHoliday.description}` : ''}.
                      Marking Present/Late/Half-day is blocked on holidays.
                    </span>
                  </div>
                )}

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
                    disabled={busy || isBlocked}
                    className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                  >
                    {busy ? 'Saving...' : isBlocked ? 'Blocked (Holiday)' : 'Save Attendance'}
                  </button>
                </div>
              </>
            );
          })()}
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

      {/* Leave Request Modal */}
      <Modal
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        title="Submit Leave Request"
        maxWidth="md"
      >
        <form onSubmit={handleSubmitLeave} className="space-y-4">
          {isAdmin && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Employee (Leave blank for self)
              </label>
              <select
                value={leaveForm.employee_id}
                onChange={(e) => setLeaveForm({ ...leaveForm, employee_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">Self (Linked Employee Profile)</option>
                {(rosterData?.roster || []).map((r: any) => (
                  <option key={r.employee._id} value={r.employee._id}>
                    {r.employee.firstName} {r.employee.lastName} ({r.employee.employee_id})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Leave Type *</label>
            <select
              value={leaveForm.leave_type}
              onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            >
              <option value="Casual">Casual Leave (Paid — No Salary Cut)</option>
              <option value="Sick">Sick Leave (Paid — No Salary Cut)</option>
              <option value="Earned">Earned Leave (Paid — No Salary Cut)</option>
              <option value="Emergency">Emergency Leave (Paid — No Salary Cut)</option>
              <option value="Unpaid">Unpaid Leave (Salary Deducted per Day)</option>
            </select>
            <p
              className={`mt-1.5 text-[11px] font-medium px-2.5 py-1 rounded ${
                leaveForm.leave_type === 'Unpaid'
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {leaveForm.leave_type === 'Unpaid'
                ? 'Unpaid Leave: Deducts (Basic Salary / 30) per leave day in monthly Payroll.'
                : 'Paid Leave: Employee receives full salary when approved.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date *</label>
              <input
                type="date"
                required
                value={leaveForm.start_date}
                onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">End Date *</label>
              <input
                type="date"
                required
                value={leaveForm.end_date}
                onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reason</label>
            <textarea
              rows={2}
              value={leaveForm.reason}
              onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsLeaveModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              Submit Leave
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
