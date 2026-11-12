'use client';

import React, { useEffect, useState } from 'react';
import { Lock, Unlock, Plus, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { TableToolbar } from '@/components/ui/TableToolbar';
import { useAuth } from '@/components/layout/DashboardLayout';
import { formatDateDMY } from '@/lib/formatters';
import {
  downloadExcel,
  matchesSearch,
  printTableReport,
  sortTableItems,
  type SortDir,
} from '@/lib/client-export';

export function PeriodsLockView() {
  const { user } = useAuth();
  const role = user?.role || 'Viewer';
  const canAccess = ['Admin', 'Accountant', 'Viewer'].includes(role);
  const isAdmin = role === 'Admin';

  const [periods, setPeriods] = useState<any[]>([]);
  const [fiscalYears, setFiscalYears] = useState<any[]>([]);
  const [selectedFy, setSelectedFy] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Open' | 'Locked'>('all');
  const [sortKey, setSortKey] = useState('startDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [newYear, setNewYear] = useState(String(new Date().getUTCFullYear() + 1));
  const [creatingFy, setCreatingFy] = useState(false);

  const [modalTarget, setModalTarget] = useState<{ period: any; action: 'lock' | 'unlock' } | null>(
    null
  );
  const [reason, setReason] = useState('');
  const [modalErr, setModalErr] = useState('');
  const [busy, setBusy] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const qs = selectedFy !== 'all' ? `?fiscalYearId=${selectedFy}` : '';
      const res = await fetch(`/api/accounts/periods${qs}`);
      const json = await res.json();
      if (json.success && json.data) {
        setPeriods(json.data.periods || []);
        setFiscalYears(json.data.fiscalYears || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, selectedFy]);

  if (!canAccess) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-600">
        Your role ({role}) does not have access to Accounts.
      </div>
    );
  }

  const handleCreateFiscalYear = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingFy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/accounts/fiscal-years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: Number(newYear) }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to create fiscal year');
      setBanner({ type: 'ok', msg: json.message });
      loadData();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setCreatingFy(false);
    }
  };

  const handleToggleLock = async () => {
    if (!modalTarget) return;
    setBusy(true);
    setModalErr('');
    try {
      const res = await fetch('/api/accounts/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodId: modalTarget.period._id,
          action: modalTarget.action,
          reason: reason.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Action failed');
      setModalTarget(null);
      setReason('');
      setBanner({ type: 'ok', msg: json.message });
      loadData();
    } catch (err: any) {
      setModalErr(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Lock className="w-6 h-6 text-emerald-700" />
            <span>Fiscal Years &amp; Period Lock</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Locked periods block all posting and draft edits. Only Admin can lock or unlock periods (audited).
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {banner && (
        <div
          className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 border ${
            banner.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {banner.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{banner.msg}</span>
        </div>
      )}

      {/* Fiscal Year Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <span className="font-bold text-slate-600 uppercase">Fiscal Year:</span>
          <select
            value={selectedFy}
            onChange={(e) => setSelectedFy(e.target.value)}
            className="px-3 py-1.5 font-semibold bg-slate-50 border border-slate-200 rounded-lg"
          >
            <option value="all">All Fiscal Years ({fiscalYears.length})</option>
            {fiscalYears.map((fy) => (
              <option key={fy._id} value={fy._id}>
                {fy.code} — {fy.name} ({fy.status})
              </option>
            ))}
          </select>
        </div>

        {isAdmin && (
          <form onSubmit={handleCreateFiscalYear} className="flex items-center gap-2">
            <input
              type="number"
              min={2020}
              max={2099}
              value={newYear}
              onChange={(e) => setNewYear(e.target.value)}
              className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
            />
            <button
              type="submit"
              disabled={creatingFy}
              className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              {creatingFy ? 'Creating...' : 'Add Fiscal Year'}
            </button>
          </form>
        )}
      </div>

      {/* Periods Table */}
      {(() => {
        const filtered = periods.filter((p) => {
          if (statusFilter !== 'all' && p.status !== statusFilter) return false;
          return matchesSearch(search, [
            p.name,
            p.fiscalYearId?.code || `FY${p.year}`,
            p.status,
            p.lockReason,
            p.lockedBy,
            p.unlockedBy,
          ]);
        });
        const sortedPeriods = sortTableItems(filtered, sortKey, sortDir, {
          startDate: (p) => new Date(p.startDate || 0),
          name: (p) => p.name || '',
          fy: (p) => p.fiscalYearId?.code || `FY${p.year}`,
          status: (p) => p.status || '',
        });
        const headers = ['Period', 'Fiscal Year', 'Start Date', 'End Date', 'Status', 'Governance Note'];
        const rows = sortedPeriods.map((p) => [
          p.name,
          p.fiscalYearId?.code || `FY${p.year}`,
          formatDateDMY(p.startDate),
          formatDateDMY(p.endDate),
          p.status,
          p.lockReason || '',
        ]);

        return (
          <div className="space-y-3">
            <TableToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search period, fiscal year, lock note..."
              filters={
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
                >
                  <option value="all">All Status</option>
                  <option value="Open">Open</option>
                  <option value="Locked">Locked</option>
                </select>
              }
              sortKey={sortKey}
              sortDir={sortDir}
              sortOptions={[
                { value: 'startDate', label: 'Start Date' },
                { value: 'name', label: 'Period Name' },
                { value: 'fy', label: 'Fiscal Year' },
                { value: 'status', label: 'Status' },
              ]}
              onSortChange={(k, d) => {
                setSortKey(k);
                setSortDir(d);
              }}
              totalCount={periods.length}
              filteredCount={sortedPeriods.length}
              hasActiveFilters={statusFilter !== 'all'}
              onReset={() => {
                setSearch('');
                setStatusFilter('all');
              }}
              onExportExcel={() =>
                downloadExcel({
                  filename: 'accounting-periods',
                  sheetName: 'Periods',
                  headers,
                  rows,
                })
              }
              onPrint={() =>
                printTableReport({
                  title: 'Accounting Periods & Lock Governance',
                  headers,
                  rows,
                })
              }
            />

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Fiscal Year</th>
                <th className="px-4 py-3">Date Range</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3">Last Governance Note</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Loading accounting periods...
                  </td>
                </tr>
              ) : sortedPeriods.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No matching accounting periods found.
                  </td>
                </tr>
              ) : (
                sortedPeriods.map((p) => (
                  <tr key={p._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{p.name}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-600">
                      {p.fiscalYearId?.code || `FY${p.year}`}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                      {formatDateDMY(p.startDate)} → {formatDateDMY(p.endDate)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {p.status === 'Locked' ? (
                        <Badge variant="danger">Locked</Badge>
                      ) : (
                        <Badge variant="success">Open</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {p.lockReason ? (
                        <span>
                          {p.lockReason}{' '}
                          <span className="text-[11px] text-slate-400">
                            ({p.status === 'Locked' ? p.lockedBy : p.unlockedBy})
                          </span>
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {isAdmin ? (
                        p.status === 'Open' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setModalErr('');
                              setReason('');
                              setModalTarget({ period: p, action: 'lock' });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-md hover:bg-rose-100"
                          >
                            <Lock className="w-3 h-3" /> Lock
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setModalErr('');
                              setReason('');
                              setModalTarget({ period: p, action: 'unlock' });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100"
                          >
                            <Unlock className="w-3 h-3" /> Unlock
                          </button>
                        )
                      ) : (
                        <span className="text-[11px] text-slate-400">Admin only</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
          </div>
        );
      })()}

      {/* Lock / Unlock Confirmation Modal */}
      <Modal
        isOpen={Boolean(modalTarget)}
        onClose={() => setModalTarget(null)}
        title={
          modalTarget
            ? `${modalTarget.action === 'lock' ? 'Lock' : 'Unlock'} Period: ${modalTarget.period.name}`
            : 'Period Lock'
        }
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          {modalErr && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium">
              {modalErr}
            </div>
          )}
          <p className="text-slate-600">
            {modalTarget?.action === 'lock'
              ? 'Locking blocks any new vouchers, edits, or reversals inside this month.'
              : 'Unlocking re-opens this period for audited adjustments. This action is recorded in System Audit Logs.'}
          </p>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Mandatory Reason *</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Monthly closing completed / Audit adjustment..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setModalTarget(null)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || reason.trim().length < 3}
              onClick={handleToggleLock}
              className={`px-4 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-50 ${
                modalTarget?.action === 'lock'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {busy ? 'Updating...' : modalTarget?.action === 'lock' ? 'Lock Period' : 'Unlock Period'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

