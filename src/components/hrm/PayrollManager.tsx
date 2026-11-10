'use client';

import React, { useEffect, useState } from 'react';
import {
  Wallet,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Edit2,
  Check,
  X,
} from 'lucide-react';
import { formatBDT, formatDate } from '@/lib/formatters';
import { Badge } from '@/components/ui/Badge';
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

export function PayrollManager() {
  const { user } = useAuth();
  const canManage = user?.role === 'Admin' || user?.role === 'Accountant';

  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [defaultCommissionPercent, setDefaultCommissionPercent] = useState<string>('5');

  const [records, setRecords] = useState<any[]>([]);
  const [totals, setTotals] = useState({
    totalBasic: 0,
    totalCommissions: 0,
    totalDeductions: 0,
    totalNetPayable: 0,
    paidCount: 0,
  });

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Inline deduction edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deductionInput, setDeductionInput] = useState('0');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadPayroll = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/hrm/payroll?month=${month}&year=${year}`);
      const json = await res.json();
      if (json.success && json.data) {
        setRecords(json.data.records || []);
        if (json.data.totals) setTotals(json.data.totals);
      }
    } catch (err) {
      console.error('Failed to load payroll:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  const handleGeneratePayroll = async () => {
    setGenerating(true);
    setBanner(null);
    try {
      const res = await fetch('/api/hrm/payroll/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          year,
          defaultCommissionPercent: Number(defaultCommissionPercent) || 5,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Payroll generation failed');
      }
      setBanner({ type: 'ok', msg: json.message });
      loadPayroll();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleUpdatePayroll = async (
    payrollId: string,
    patch: { deductions?: number; status?: 'Draft' | 'Processed' | 'Paid' }
  ) => {
    setUpdatingId(payrollId);
    try {
      const res = await fetch('/api/hrm/payroll', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payroll_id: payrollId, ...patch }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.message || 'Failed to update payroll');
        return;
      }
      setEditingId(null);
      loadPayroll();
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Paid':
        return <Badge variant="success">Paid</Badge>;
      case 'Processed':
        return <Badge variant="info">Processed</Badge>;
      default:
        return <Badge variant="warning">Draft</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Monthly Payroll &amp; Agent Commissions
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Calculates base salaries plus automated Agent commissions from referred candidate collections.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-800"
          >
            {MONTHS.map((m, idx) => (
              <option key={m} value={idx + 1}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-800 font-mono"
          >
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          {canManage && (
            <>
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
                <span className="text-slate-500 font-medium">Agent Comm %:</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={defaultCommissionPercent}
                  onChange={(e) => setDefaultCommissionPercent(e.target.value)}
                  className="w-12 font-mono font-bold text-slate-900 focus:outline-none text-center"
                />
              </div>

              <button
                type="button"
                disabled={generating}
                onClick={handleGeneratePayroll}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Calculating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate Payroll</span>
                  </>
                )}
              </button>
            </>
          )}
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
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{banner.msg}</span>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Total Basic Salaries</span>
          <p className="text-2xl font-bold text-slate-900 font-mono mt-1">
            {formatBDT(totals.totalBasic)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-purple-200 bg-purple-50/20 shadow-xs">
          <span className="text-xs font-semibold text-purple-700 uppercase">
            Agent Commissions
          </span>
          <p className="text-2xl font-bold text-purple-800 font-mono mt-1">
            {formatBDT(totals.totalCommissions)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs">
          <span className="text-xs font-semibold text-rose-700 uppercase">Deductions</span>
          <p className="text-2xl font-bold text-rose-700 font-mono mt-1">
            {formatBDT(totals.totalDeductions)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
          <span className="text-xs font-semibold text-emerald-800 uppercase">Net Payable</span>
          <p className="text-2xl font-bold text-emerald-800 font-mono mt-1">
            {formatBDT(totals.totalNetPayable)}
          </p>
        </div>
      </div>

      {/* Payroll Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-7 h-7 animate-spin text-emerald-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500">Loading monthly payroll ledger...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <Wallet className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">
              No payroll generated for {MONTHS[month - 1]} {year}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Click &quot;Generate Payroll&quot; to compute salaries and referral commissions for this month.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Employee / Agent</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3 text-right">Basic Salary</th>
                <th className="px-4 py-3 text-right">Commission Earned</th>
                <th className="px-4 py-3 text-right">Deductions</th>
                <th className="px-4 py-3 text-right">Net Payable</th>
                <th className="px-4 py-3 text-center">Status</th>
                {canManage && <th className="px-4 py-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((rec) => {
                const emp = rec.employee_id;
                const isEditing = editingId === rec._id;
                const isPaid = rec.status === 'Paid';

                return (
                  <tr key={rec._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">
                        {emp?.firstName} {emp?.lastName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {emp?.employee_id} • {emp?.designation}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap text-xs font-semibold text-slate-700">
                      {emp?.department || '—'}
                    </td>

                    <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-semibold text-slate-800">
                      {formatBDT(rec.basic_salary)}
                    </td>

                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="font-mono font-bold text-purple-700">
                        {formatBDT(rec.commission_earned)}
                      </div>
                      {(rec.referred_collections_total > 0 || rec.commission_rate_applied > 0) && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          {rec.commission_rate_applied || 0}% of{' '}
                          {formatBDT(rec.referred_collections_total || 0)}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono">
                      {isEditing ? (
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            value={deductionInput}
                            onChange={(e) => setDeductionInput(e.target.value)}
                            className="w-24 px-2 py-1 text-xs border border-blue-400 rounded text-right font-bold"
                          />
                          <button
                            type="button"
                            disabled={updatingId === rec._id}
                            onClick={() =>
                              handleUpdatePayroll(rec._id, {
                                deductions: Math.round(Number(deductionInput) || 0),
                              })
                            }
                            className="p-1 text-white bg-emerald-600 rounded"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="p-1 text-slate-600 bg-slate-100 rounded"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <span className="text-rose-700 font-semibold">
                            {formatBDT(rec.deductions)}
                          </span>
                          {canManage && !isPaid && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(rec._id);
                                setDeductionInput(String(rec.deductions || 0));
                              }}
                              className="p-1 text-slate-400 hover:text-slate-700"
                              title="Edit Deductions"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-extrabold text-emerald-700">
                      {formatBDT(rec.net_payable)}
                    </td>

                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                      {getStatusBadge(rec.status)}
                      {rec.paid_on && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {formatDate(rec.paid_on)}
                        </div>
                      )}
                    </td>

                    {canManage && (
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        {!isPaid ? (
                          <button
                            type="button"
                            disabled={updatingId === rec._id}
                            onClick={() => handleUpdatePayroll(rec._id, { status: 'Paid' })}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Mark Paid</span>
                          </button>
                        ) : (
                          <span className="text-xs font-medium text-emerald-700">Disbursed</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

