'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckSquare,
  CheckCheck,
  RefreshCw,
  Save,
  AlertTriangle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import {
  EMPLOYEE_DEPARTMENTS,
  formatTimeDhaka,
  getTodayDhaka,
  toDhakaTimeInput,
} from '@/lib/formatters';
import type { DailyAttendanceStatus } from '@/models/DailyAttendance';

const DEPARTMENTS = ['all', ...EMPLOYEE_DEPARTMENTS];
const SHIFTS = ['all', 'Regular', 'Morning', 'Evening', 'Night'];
const BULK_STATUSES: DailyAttendanceStatus[] = [
  'Present',
  'Late',
  'Half-day',
  'Absent',
  'Leave',
  'Holiday',
];

interface BulkRowState {
  employee: {
    _id: string;
    employee_id: string;
    biometric_id?: string;
    shift?: string;
    firstName: string;
    lastName: string;
    department: string;
    designation: string;
  };
  schedule: {
    name: string;
    start_time: string;
    end_time: string;
  };
  existing: {
    _id: string;
    status: DailyAttendanceStatus;
    source: string;
    first_in?: string;
    last_out?: string;
    notes?: string;
    locked?: boolean;
  } | null;
  selected: boolean;
  status: DailyAttendanceStatus;
  check_in_time: string;
  check_out_time: string;
  remark: string;
}

export function BulkManualAttendanceView() {
  const [date, setDate] = useState(() => getTodayDhaka());
  const [department, setDepartment] = useState('all');
  const [shift, setShift] = useState('all');
  const [rows, setRows] = useState<BulkRowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Batch toolbar state
  const [batchStatus, setBatchStatus] = useState<DailyAttendanceStatus>('Present');
  const [batchInTime, setBatchInTime] = useState('09:00');
  const [batchOutTime, setBatchOutTime] = useState('18:00');
  const [reason, setReason] = useState('');
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  const [holidayInfo, setHolidayInfo] = useState<{
    title: string;
    type: string;
    description?: string;
  } | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const loadRoster = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/attendance/bulk?date=${date}&department=${department}&shift=${shift}`
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to load employees');
      }

      setHolidayInfo(json.data?.holiday || null);

      const mapped: BulkRowState[] = (json.data?.rows || []).map((r: any) => {
        const defaultIn = r.schedule?.start_time || '09:00';
        const defaultOut = r.schedule?.end_time || '18:00';
        const existingIn = r.existing?.first_in
          ? toDhakaTimeInput(r.existing.first_in, defaultIn)
          : defaultIn;
        const existingOut = r.existing?.last_out
          ? toDhakaTimeInput(r.existing.last_out, defaultOut)
          : defaultOut;

        return {
          ...r,
          selected: !r.existing && !r.existing?.locked,
          status: r.existing?.status || 'Present',
          check_in_time: existingIn,
          check_out_time: existingOut,
          remark: r.existing?.notes || '',
        };
      });
      setRows(mapped);
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message || 'Failed to load bulk roster' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) loadRoster();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, department, shift]);

  const toggleSelectAll = (checked: boolean) => {
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        selected: row.existing?.locked ? false : checked,
      }))
    );
  };

  const toggleRow = (empId: string) => {
    setRows((prev) =>
      prev.map((row) =>
        row.employee._id === empId && !row.existing?.locked
          ? { ...row, selected: !row.selected }
          : row
      )
    );
  };

  const updateRowField = <K extends keyof BulkRowState>(
    empId: string,
    field: K,
    value: BulkRowState[K]
  ) => {
    setRows((prev) =>
      prev.map((row) => (row.employee._id === empId ? { ...row, [field]: value } : row))
    );
  };

  const handleApplyToSelected = () => {
    const selectedCount = rows.filter((r) => r.selected).length;
    if (selectedCount === 0) {
      setBanner({ type: 'err', msg: 'Select at least one unlocked employee row first.' });
      return;
    }
    const needsTimes =
      batchStatus === 'Present' || batchStatus === 'Late' || batchStatus === 'Half-day';

    setRows((prev) =>
      prev.map((row) =>
        row.selected
          ? {
              ...row,
              status: batchStatus,
              check_in_time: needsTimes ? batchInTime : row.check_in_time,
              check_out_time: needsTimes ? batchOutTime : row.check_out_time,
            }
          : row
      )
    );
    setBanner({
      type: 'ok',
      msg: `Applied "${batchStatus}"${needsTimes ? ` (${batchInTime}–${batchOutTime})` : ''} to ${selectedCount} selected row(s). Enter a reason and click Save All to persist.`,
    });
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);

    const selectedRows = rows.filter((r) => r.selected && !r.existing?.locked);
    if (selectedRows.length === 0) {
      setBanner({ type: 'err', msg: 'Select at least one employee row to save.' });
      return;
    }
    if (!reason.trim()) {
      setBanner({ type: 'err', msg: 'Please enter a mandatory reason for bulk manual entry.' });
      return;
    }

    setSaving(true);
    try {
      const entries = selectedRows.map((r) => ({
        employee_id: r.employee._id,
        date,
        status: r.status,
        check_in_time: r.check_in_time,
        check_out_time: r.check_out_time,
        remark: r.remark,
      }));

      const res = await fetch('/api/attendance/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries,
          reason: reason.trim(),
          overwriteExisting,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Bulk save failed');
      }

      setBanner({ type: 'ok', msg: json.message });
      loadRoster();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message || 'Bulk save failed' });
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = rows.filter((r) => r.selected).length;
  const allUnlockedSelected =
    rows.some((r) => !r.existing?.locked) &&
    rows.filter((r) => !r.existing?.locked).every((r) => r.selected);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-emerald-600" />
            Bulk Manual Attendance Entry
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Mark multiple employees in one batch. Rows are prefilled from working schedules and flagged if already recorded.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
          />
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
          >
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d === 'all' ? 'Dept: All' : d}
              </option>
            ))}
          </select>
          <select
            value={shift}
            onChange={(e) => setShift(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
          >
            {SHIFTS.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'Shift: All' : `${s} Shift`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {holidayInfo && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-2 font-medium">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>
            <strong>Holiday Blocked ({date}):</strong> {holidayInfo.title} ({holidayInfo.type}{' '}
            Holiday)
            {holidayInfo.description ? ` — ${holidayInfo.description}` : ''}. Present / Late /
            Half-day attendance cannot be marked on a holiday.
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

      {/* Batch Toolbar & Save Form */}
      <form
        onSubmit={handleSaveAll}
        className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3"
      >
        <div className="flex flex-wrap items-end justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                Status
              </label>
              <select
                value={batchStatus}
                onChange={(e) => setBatchStatus(e.target.value as DailyAttendanceStatus)}
                className="px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
              >
                {BULK_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                In Time
              </label>
              <input
                type="time"
                value={batchInTime}
                onChange={(e) => setBatchInTime(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                Out Time
              </label>
              <input
                type="time"
                value={batchOutTime}
                onChange={(e) => setBatchOutTime(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
            <button
              type="button"
              disabled={Boolean(
                holidayInfo &&
                  (batchStatus === 'Present' ||
                    batchStatus === 'Late' ||
                    batchStatus === 'Half-day')
              )}
              onClick={handleApplyToSelected}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg disabled:opacity-45"
            >
              <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
              Apply to Selected ({selectedCount})
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-2 flex-1 justify-end min-w-[280px]">
            <div className="flex-1 max-w-xs">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                Audit Reason *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Morning biometric outage / Roster confirmation"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 pb-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={overwriteExisting}
                onChange={(e) => setOverwriteExisting(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600"
              />
              <span>Overwrite Existing</span>
            </label>
            <button
              type="submit"
              disabled={
                saving ||
                selectedCount === 0 ||
                Boolean(
                  holidayInfo &&
                    rows.some(
                      (r) =>
                        r.selected &&
                        (r.status === 'Present' || r.status === 'Late' || r.status === 'Half-day')
                    )
                )
              }
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs disabled:opacity-50"
            >
              {saving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{saving ? 'Saving...' : `Save Selected (${selectedCount})`}</span>
            </button>
          </div>
        </div>

        {/* Multi-Employee Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-12 text-center">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mx-auto" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No active employees match the selected Department / Shift filter.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={allUnlockedSelected}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      title="Select all unlocked rows"
                      className="rounded border-slate-300 text-emerald-600"
                    />
                  </th>
                  <th className="px-3 py-2.5">Employee</th>
                  <th className="px-3 py-2.5">Dept / Shift</th>
                  <th className="px-3 py-2.5">Existing Record</th>
                  <th className="px-3 py-2.5">Mark Status</th>
                  <th className="px-3 py-2.5">Check In</th>
                  <th className="px-3 py-2.5">Check Out</th>
                  <th className="px-3 py-2.5">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const locked = Boolean(row.existing?.locked);
                  const needsTimes =
                    row.status === 'Present' || row.status === 'Late' || row.status === 'Half-day';

                  return (
                    <tr
                      key={row.employee._id}
                      className={
                        locked
                          ? 'bg-slate-50/70 opacity-65'
                          : row.selected
                          ? 'bg-emerald-50/20'
                          : 'hover:bg-slate-50/60'
                      }
                    >
                      <td className="px-3 py-2.5">
                        {locked ? (
                          <span title="Locked by Payroll">
                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={() => toggleRow(row.employee._id)}
                            className="rounded border-slate-300 text-emerald-600"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Link
                          href={`/hrm/employees/${row.employee._id}`}
                          className="font-semibold text-slate-900 hover:text-emerald-700 hover:underline block"
                        >
                          {row.employee.firstName} {row.employee.lastName}
                        </Link>
                        <div className="text-[11px] font-mono text-slate-400">
                          {row.employee.employee_id}
                          {row.employee.biometric_id ? ` • Bio: ${row.employee.biometric_id}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">
                        <div className="font-semibold">{row.employee.department}</div>
                        <div className="text-[11px] text-slate-400">
                          {row.employee.shift || 'Regular'} ({row.schedule.start_time}–
                          {row.schedule.end_time})
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {row.existing ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1">
                              <Badge variant="default">{row.existing.status}</Badge>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                {row.existing.source}
                              </span>
                            </div>
                            {row.existing.first_in && (
                              <div className="text-[10px] font-mono text-slate-400">
                                {formatTimeDhaka(row.existing.first_in)} →{' '}
                                {row.existing.last_out ? formatTimeDhaka(row.existing.last_out) : '—'}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Not Marked</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          disabled={locked}
                          value={row.status}
                          onChange={(e) =>
                            updateRowField(
                              row.employee._id,
                              'status',
                              e.target.value as DailyAttendanceStatus
                            )
                          }
                          className="px-2 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-md"
                        >
                          {BULK_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="time"
                          disabled={locked || !needsTimes}
                          value={row.check_in_time}
                          onChange={(e) =>
                            updateRowField(row.employee._id, 'check_in_time', e.target.value)
                          }
                          className="px-2 py-1 text-xs font-mono bg-white border border-slate-200 rounded-md disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="time"
                          disabled={locked || !needsTimes}
                          value={row.check_out_time}
                          onChange={(e) =>
                            updateRowField(row.employee._id, 'check_out_time', e.target.value)
                          }
                          className="px-2 py-1 text-xs font-mono bg-white border border-slate-200 rounded-md disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          disabled={locked}
                          placeholder="Optional note"
                          value={row.remark}
                          onChange={(e) =>
                            updateRowField(row.employee._id, 'remark', e.target.value)
                          }
                          className="w-36 px-2 py-1 text-xs bg-white border border-slate-200 rounded-md"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </form>
    </div>
  );
}

