'use client';

import React, { useEffect, useState } from 'react';
import {
  CalendarCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  LogIn,
  LogOut,
  RefreshCw,
  CalendarPlus,
  Check,
  X,
} from 'lucide-react';
import { formatDate } from '@/lib/formatters';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/components/layout/DashboardLayout';

function formatTimeBDT(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AttendanceTracker() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const [activeSubTab, setActiveSubTab] = useState<'attendance' | 'leaves'>('attendance');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date())
  );

  const [roster, setRoster] = useState<any[]>([]);
  const [myEmployee, setMyEmployee] = useState<any | null>(null);
  const [myTodayRecord, setMyTodayRecord] = useState<any | null>(null);
  const [summary, setSummary] = useState({
    total: 0,
    present: 0,
    late: 0,
    halfDay: 0,
    absent: 0,
    unmarked: 0,
  });

  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Leave Modal
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    employee_id: '',
    leave_type: 'Casual',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    reason: '',
  });
  const [submittingLeave, setSubmittingLeave] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [attRes, leaveRes] = await Promise.all([
        fetch(`/api/hrm/attendance?date=${selectedDate}`),
        fetch('/api/hrm/leaves'),
      ]);

      const attJson = await attRes.json();
      const leaveJson = await leaveRes.json();

      if (attJson.success && attJson.data) {
        setRoster(attJson.data.roster || []);
        setMyEmployee(attJson.data.myEmployee || null);
        setMyTodayRecord(attJson.data.myTodayRecord || null);
        if (attJson.data.summary) setSummary(attJson.data.summary);
      }

      if (leaveJson.success) {
        setLeaves(leaveJson.data || []);
      }
    } catch (err) {
      console.error('Failed to load attendance/leaves:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const handleSelfAction = async (action: 'check_in' | 'check_out') => {
    setActionBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/hrm/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Action failed');
      }
      setFeedback({ type: 'ok', msg: json.message });
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'err', msg: err.message });
    } finally {
      setActionBusy(false);
    }
  };

  const handleAdminMark = async (employeeId: string, status: string) => {
    setActionBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/hrm/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          date: selectedDate,
          status,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to update roster');
      }
      setFeedback({ type: 'ok', msg: json.message });
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'err', msg: err.message });
    } finally {
      setActionBusy(false);
    }
  };

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingLeave(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/hrm/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leaveForm),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to submit leave request');
      }
      setIsLeaveModalOpen(false);
      setFeedback({ type: 'ok', msg: json.message });
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'err', msg: err.message });
    } finally {
      setSubmittingLeave(false);
    }
  };

  const handleLeaveReview = async (leaveId: string, status: 'Approved' | 'Rejected') => {
    const res = await fetch('/api/hrm/leaves', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leave_id: leaveId, status }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      loadData();
    } else {
      alert(json.message || 'Failed to update leave status');
    }
  };

  const getAttBadge = (status?: string | null) => {
    switch (status) {
      case 'Present':
        return <Badge variant="success">Present</Badge>;
      case 'Late':
        return <Badge variant="warning">Late</Badge>;
      case 'Half-Day':
        return <Badge variant="info">Half-Day</Badge>;
      case 'Absent':
        return <Badge variant="danger">Absent</Badge>;
      default:
        return <Badge variant="gray">Not Marked</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Daily Attendance &amp; Leave Desk
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Staff self check-in/out, Admin daily roster management, and leave approvals.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsLeaveModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-xs"
          >
            <CalendarPlus className="w-4 h-4 text-emerald-600" />
            <span>Request Leave</span>
          </button>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Staff Self Check-In Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            {myEmployee ? (
              <>
                <h3 className="font-bold text-slate-900 text-sm">
                  {myEmployee.firstName} {myEmployee.lastName} ({myEmployee.employee_id})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Today&apos;s Log:{' '}
                  {myTodayRecord ? (
                    <span className="font-semibold text-slate-800">
                      In: {formatTimeBDT(myTodayRecord.check_in)} • Out:{' '}
                      {formatTimeBDT(myTodayRecord.check_out)} ({myTodayRecord.status})
                    </span>
                  ) : (
                    <span>Not checked in yet today</span>
                  )}
                </p>
              </>
            ) : (
              <>
                <h3 className="font-bold text-slate-800 text-sm">Personal Attendance Punch</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Link your ERP user account to an Employee profile in Employees &amp; Agents to enable 1-click self Check-In.
                </p>
              </>
            )}
          </div>
        </div>

        {myEmployee && (
          <div className="flex items-center gap-2 shrink-0">
            {!myTodayRecord?.check_in ? (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => handleSelfAction('check_in')}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                <span>Check In Now</span>
              </button>
            ) : !myTodayRecord?.check_out ? (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => handleSelfAction('check_out')}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
                <span>Check Out</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle2 className="w-4 h-4" /> Completed for Today
              </span>
            )}
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 border ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* Sub-Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex p-1 bg-slate-100 rounded-lg text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveSubTab('attendance')}
            className={`px-3.5 py-1.5 rounded-md transition-all ${
              activeSubTab === 'attendance'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Daily Roster ({summary.total})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('leaves')}
            className={`px-3.5 py-1.5 rounded-md transition-all ${
              activeSubTab === 'leaves'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Leave Requests ({leaves.filter((l) => l.status === 'Pending').length} Pending)
          </button>
        </div>

        {activeSubTab === 'attendance' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-slate-600">Roster Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-800"
            />
          </div>
        )}
      </div>

      {activeSubTab === 'attendance' ? (
        <>
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-emerald-200">
              <span className="text-[11px] font-semibold text-emerald-700 uppercase">Present</span>
              <p className="text-xl font-bold text-emerald-800 mt-0.5">{summary.present}</p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-amber-200">
              <span className="text-[11px] font-semibold text-amber-700 uppercase">Late</span>
              <p className="text-xl font-bold text-amber-800 mt-0.5">{summary.late}</p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-blue-200">
              <span className="text-[11px] font-semibold text-blue-700 uppercase">Half-Day</span>
              <p className="text-xl font-bold text-blue-800 mt-0.5">{summary.halfDay}</p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-rose-200">
              <span className="text-[11px] font-semibold text-rose-700 uppercase">Absent</span>
              <p className="text-xl font-bold text-rose-800 mt-0.5">{summary.absent}</p>
            </div>
          </div>

          {/* Daily Roster Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Check In</th>
                  <th className="px-4 py-3">Check Out</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  {isAdmin && <th className="px-4 py-3 text-right">Mark Attendance</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roster.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-xs text-slate-400">
                      No active employees found. Add employees first in Employees &amp; Agents.
                    </td>
                  </tr>
                ) : (
                  roster.map((row) => (
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
                        <span className="font-semibold text-slate-800">{row.employee.department}</span>{' '}
                        • {row.employee.designation}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-slate-700">
                        {formatTimeBDT(row.attendance?.check_in)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-slate-700">
                        {formatTimeBDT(row.attendance?.check_out)}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {getAttBadge(row.attendance?.status)}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {(['Present', 'Late', 'Half-Day', 'Absent'] as const).map((st) => (
                              <button
                                key={st}
                                type="button"
                                disabled={actionBusy}
                                onClick={() => handleAdminMark(row.employee._id, st)}
                                className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors ${
                                  row.attendance?.status === st
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        /* Leave Requests Table */
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
            <tbody className="divide-y divide-slate-100">
              {leaves.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-slate-400">
                    No leave requests recorded yet.
                  </td>
                </tr>
              ) : (
                leaves.map((lv) => (
                  <tr key={lv._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">
                        {lv.employee_id?.firstName} {lv.employee_id?.lastName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {lv.employee_id?.employee_id} • {lv.employee_id?.department}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-slate-700">
                      {lv.leave_type}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                      {formatDate(lv.start_date)} → {formatDate(lv.end_date)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">
                      {lv.reason || '—'}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
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
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleLeaveReview(lv._id, 'Approved')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md"
                            >
                              <Check className="w-3 h-3" /> Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLeaveReview(lv._id, 'Rejected')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md"
                            >
                              <X className="w-3 h-3" /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            By {lv.reviewed_by || 'Admin'}
                          </span>
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

      {/* Request Leave Modal */}
      <Modal
        isOpen={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        title="Submit Leave Request"
        maxWidth="md"
      >
        <form onSubmit={handleLeaveSubmit} className="space-y-4">
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
                {roster.map((r) => (
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
              <option value="Casual">Casual Leave</option>
              <option value="Sick">Sick Leave</option>
              <option value="Earned">Earned Leave</option>
              <option value="Emergency">Emergency Leave</option>
              <option value="Unpaid">Unpaid Leave</option>
            </select>
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
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reason / Note</label>
            <textarea
              rows={2}
              value={leaveForm.reason}
              onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
              placeholder="Optional reason for leave..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsLeaveModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingLeave}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {submittingLeave ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

