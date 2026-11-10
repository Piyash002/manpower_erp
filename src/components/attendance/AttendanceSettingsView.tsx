'use client';

import React, { useEffect, useState } from 'react';
import {
  Settings2,
  Plus,
  Calendar,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { formatDate } from '@/lib/formatters';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function AttendanceSettingsView() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Schedule Modal
  const [isSchedModalOpen, setIsSchedModalOpen] = useState(false);
  const [schedForm, setSchedForm] = useState({
    _id: '',
    name: '',
    code: '',
    department: '',
    shift: 'Regular',
    working_days: [0, 1, 2, 3, 4],
    start_time: '09:00',
    end_time: '18:00',
    grace_minutes: '10',
    standard_hours: '8',
    half_day_hours: '4',
    overtime_after_hours: '8',
    overtime_multiplier: '1.5',
    overtime_needs_approval: false,
    late_rule_enabled: true,
    late_days_per_deduction: '3',
    duplicate_punch_window_minutes: '5',
    is_night_shift: false,
    manual_priority_over_biometric: true,
    is_default: false,
  });

  // Holiday Modal
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [holidayForm, setHolidayForm] = useState({
    title: '',
    date: new Date().toISOString().split('T')[0],
    type: 'Government',
    description: '',
  });

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/attendance/settings');
      const json = await res.json();
      if (json.success && json.data) {
        setSchedules(json.data.schedules || []);
        setHolidays(json.data.holidays || []);
        setEmployees(json.data.employees || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const toggleDay = (d: number) => {
    setSchedForm((prev) => ({
      ...prev,
      working_days: prev.working_days.includes(d)
        ? prev.working_days.filter((x) => x !== d)
        : [...prev.working_days, d].sort(),
    }));
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    const method = schedForm._id ? 'PUT' : 'POST';
    const res = await fetch('/api/attendance/settings', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...schedForm,
        grace_minutes: Number(schedForm.grace_minutes),
        standard_hours: Number(schedForm.standard_hours),
        half_day_hours: Number(schedForm.half_day_hours),
        overtime_after_hours: Number(schedForm.overtime_after_hours),
        overtime_multiplier: Number(schedForm.overtime_multiplier),
        late_days_per_deduction: Number(schedForm.late_days_per_deduction),
        duplicate_punch_window_minutes: Number(schedForm.duplicate_punch_window_minutes),
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setBanner({ type: 'err', msg: json.message || 'Save failed' });
      return;
    }
    setIsSchedModalOpen(false);
    setBanner({ type: 'ok', msg: json.message });
    loadSettings();
  };

  const handleAssignSchedule = async (employeeId: string, scheduleId: string) => {
    const res = await fetch('/api/attendance/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'assign_schedule',
        employee_id: employeeId,
        schedule_id: scheduleId || null,
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setBanner({ type: 'ok', msg: json.message });
      loadSettings();
    }
  };

  const handleSaveHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/attendance/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'holiday', ...holidayForm }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setBanner({ type: 'err', msg: json.message || 'Failed to add holiday' });
      return;
    }
    setIsHolidayModalOpen(false);
    setHolidayForm({ ...holidayForm, title: '', description: '' });
    setBanner({ type: 'ok', msg: json.message });
    loadSettings();
  };

  const handleDeleteHoliday = async (id: string) => {
    const res = await fetch(`/api/attendance/settings?kind=holiday&id=${id}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (res.ok && json.success) loadSettings();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Working Schedules, Late/OT Rules &amp; Holidays
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure weekly working days, grace periods, overtime multipliers, late rules, and holiday calendar.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSchedForm({
                _id: '',
                name: '',
                code: '',
                department: '',
                shift: 'Regular',
                working_days: [0, 1, 2, 3, 4],
                start_time: '09:00',
                end_time: '18:00',
                grace_minutes: '10',
                standard_hours: '8',
                half_day_hours: '4',
                overtime_after_hours: '8',
                overtime_multiplier: '1.5',
                overtime_needs_approval: false,
                late_rule_enabled: true,
                late_days_per_deduction: '3',
                duplicate_punch_window_minutes: '5',
                is_night_shift: false,
                manual_priority_over_biometric: true,
                is_default: false,
              });
              setIsSchedModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
          >
            <Plus className="w-4 h-4" /> New Schedule
          </button>
          <button
            type="button"
            onClick={() => setIsHolidayModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <Calendar className="w-4 h-4 text-blue-600" /> Add Holiday
          </button>
        </div>
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

      {loading ? (
        <div className="py-12 text-center bg-white rounded-xl border border-slate-200">
          <RefreshCw className="w-7 h-7 animate-spin text-emerald-600 mx-auto" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Working Schedules */}
          <div className="lg:col-span-7 space-y-3">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Working Schedules
            </h2>
            {schedules.map((s) => (
              <div
                key={s._id}
                className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Settings2 className="w-4 h-4 text-emerald-600" />
                      <h3 className="font-bold text-slate-900 text-sm">{s.name}</h3>
                      {s.is_default && <Badge variant="success">Default</Badge>}
                    </div>
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                      {s.code} • Shift: {s.shift || 'Regular'} {s.is_night_shift ? '(Night)' : ''}{' '}
                      {s.department ? `• Dept: ${s.department}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSchedForm({
                        _id: s._id,
                        name: s.name,
                        code: s.code,
                        department: s.department || '',
                        shift: s.shift || 'Regular',
                        working_days: s.working_days || [0, 1, 2, 3, 4],
                        start_time: s.start_time,
                        end_time: s.end_time,
                        grace_minutes: String(s.grace_minutes),
                        standard_hours: String(s.standard_hours),
                        half_day_hours: String(s.half_day_hours),
                        overtime_after_hours: String(s.overtime_after_hours),
                        overtime_multiplier: String(s.overtime_multiplier),
                        overtime_needs_approval: Boolean(s.overtime_needs_approval),
                        late_rule_enabled: Boolean(s.late_rule_enabled),
                        late_days_per_deduction: String(s.late_days_per_deduction),
                        duplicate_punch_window_minutes: String(
                          s.duplicate_punch_window_minutes ?? 5
                        ),
                        is_night_shift: Boolean(s.is_night_shift),
                        manual_priority_over_biometric:
                          s.manual_priority_over_biometric !== false,
                        is_default: Boolean(s.is_default),
                      });
                      setIsSchedModalOpen(true);
                    }}
                    className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                  >
                    Edit
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {DAY_LABELS.map((lbl, idx) => {
                    const isWork = (s.working_days || []).includes(idx);
                    return (
                      <span
                        key={lbl}
                        className={`px-2 py-0.5 text-[11px] rounded font-semibold ${
                          isWork
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {lbl}
                      </span>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 text-[11px] text-slate-600 border-t border-slate-100">
                  <div>
                    Hours: <strong>{s.start_time}–{s.end_time}</strong>
                  </div>
                  <div>
                    Grace: <strong>{s.grace_minutes}m</strong>
                  </div>
                  <div>
                    OT: <strong>&gt;{s.overtime_after_hours}h ({s.overtime_multiplier}x)</strong>
                  </div>
                  <div>
                    Late Rule:{' '}
                    <strong>
                      {s.late_rule_enabled ? `${s.late_days_per_deduction} late = 1d` : 'Off'}
                    </strong>
                  </div>
                  <div>
                    Debounce: <strong>{s.duplicate_punch_window_minutes ?? 5}m</strong>
                  </div>
                  <div>
                    Priority:{' '}
                    <strong>
                      {s.manual_priority_over_biometric !== false ? 'Manual Wins' : 'Latest'}
                    </strong>
                  </div>
                </div>
              </div>
            ))}

            {/* Employee Schedule Assignment */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden mt-4">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 uppercase">
                Assign Schedule Per Employee
              </div>
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {employees.map((e) => (
                  <div key={e._id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="text-xs">
                      <span className="font-semibold text-slate-900">
                        {e.firstName} {e.lastName}
                      </span>{' '}
                      <span className="text-slate-400 font-mono">
                        ({e.employee_id} • {e.department})
                      </span>
                    </div>
                    <select
                      value={e.schedule_id || ''}
                      onChange={(ev) => handleAssignSchedule(e._id, ev.target.value)}
                      className="px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white"
                    >
                      <option value="">Use Dept / Default Schedule</option>
                      {schedules.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Holiday Calendar */}
          <div className="lg:col-span-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Holiday Calendar
            </h2>
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100">
              {holidays.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">No holidays defined.</div>
              ) : (
                holidays.map((h) => (
                  <div key={h._id} className="p-3.5 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900 text-xs">{h.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {formatDate(h.date)} • <Badge variant="default">{h.type}</Badge>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteHoliday(h._id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      <Modal
        isOpen={isSchedModalOpen}
        onClose={() => setIsSchedModalOpen(false)}
        title={schedForm._id ? 'Edit Working Schedule' : 'Create Working Schedule'}
        maxWidth="lg"
      >
        <form onSubmit={handleSaveSchedule} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Name *</label>
              <input
                type="text"
                required
                value={schedForm.name}
                onChange={(e) => setSchedForm({ ...schedForm, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Code *</label>
              <input
                type="text"
                required
                disabled={!!schedForm._id}
                value={schedForm.code}
                onChange={(e) => setSchedForm({ ...schedForm, code: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono uppercase disabled:bg-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Working Days (Unchecked = Weekly Off)
            </label>
            <div className="flex flex-wrap gap-2">
              {DAY_LABELS.map((lbl, idx) => {
                const checked = schedForm.working_days.includes(idx);
                return (
                  <button
                    key={lbl}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                      checked
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Start Time</label>
              <input
                type="time"
                value={schedForm.start_time}
                onChange={(e) => setSchedForm({ ...schedForm, start_time: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">End Time</label>
              <input
                type="time"
                value={schedForm.end_time}
                onChange={(e) => setSchedForm({ ...schedForm, end_time: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Grace (Min)
              </label>
              <input
                type="number"
                min="0"
                value={schedForm.grace_minutes}
                onChange={(e) => setSchedForm({ ...schedForm, grace_minutes: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Half-Day (&lt;Hrs)
              </label>
              <input
                type="number"
                step="0.5"
                value={schedForm.half_day_hours}
                onChange={(e) => setSchedForm({ ...schedForm, half_day_hours: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                OT After (Hrs)
              </label>
              <input
                type="number"
                step="0.5"
                value={schedForm.overtime_after_hours}
                onChange={(e) =>
                  setSchedForm({ ...schedForm, overtime_after_hours: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                OT Multiplier
              </label>
              <input
                type="number"
                step="0.1"
                value={schedForm.overtime_multiplier}
                onChange={(e) =>
                  setSchedForm({ ...schedForm, overtime_multiplier: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lates = 1 Day Ded
              </label>
              <input
                type="number"
                min="1"
                value={schedForm.late_days_per_deduction}
                onChange={(e) =>
                  setSchedForm({ ...schedForm, late_days_per_deduction: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Dept (Optional)
              </label>
              <input
                type="text"
                value={schedForm.department}
                onChange={(e) => setSchedForm({ ...schedForm, department: e.target.value })}
                placeholder="e.g. Training"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Shift Name
              </label>
              <select
                value={schedForm.shift}
                onChange={(e) => setSchedForm({ ...schedForm, shift: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Regular">Regular</option>
                <option value="Morning">Morning</option>
                <option value="Evening">Evening</option>
                <option value="Night">Night</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Dup Punch Window (Min)
              </label>
              <input
                type="number"
                min="0"
                value={schedForm.duplicate_punch_window_minutes}
                onChange={(e) =>
                  setSchedForm({ ...schedForm, duplicate_punch_window_minutes: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={schedForm.late_rule_enabled}
                onChange={(e) =>
                  setSchedForm({ ...schedForm, late_rule_enabled: e.target.checked })
                }
              />
              <span>Enable Late Deduction Rule</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={schedForm.is_night_shift}
                onChange={(e) =>
                  setSchedForm({ ...schedForm, is_night_shift: e.target.checked })
                }
              />
              <span>Night Shift (Crosses Midnight)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={schedForm.manual_priority_over_biometric}
                onChange={(e) =>
                  setSchedForm({
                    ...schedForm,
                    manual_priority_over_biometric: e.target.checked,
                  })
                }
              />
              <span>Manual Overrides Biometric Priority</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={schedForm.is_default}
                onChange={(e) => setSchedForm({ ...schedForm, is_default: e.target.checked })}
              />
              <span>Set as Company Default Schedule</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsSchedModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              Save Schedule
            </button>
          </div>
        </form>
      </Modal>

      {/* Holiday Modal */}
      <Modal
        isOpen={isHolidayModalOpen}
        onClose={() => setIsHolidayModalOpen(false)}
        title="Add Company / Govt Holiday"
        maxWidth="md"
      >
        <form onSubmit={handleSaveHoliday} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Holiday Title *</label>
            <input
              type="text"
              required
              value={holidayForm.title}
              onChange={(e) => setHolidayForm({ ...holidayForm, title: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date *</label>
              <input
                type="date"
                required
                value={holidayForm.date}
                onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Type *</label>
              <select
                value={holidayForm.type}
                onChange={(e) => setHolidayForm({ ...holidayForm, type: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="Government">Government</option>
                <option value="Company">Company</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsHolidayModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              Add Holiday
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

