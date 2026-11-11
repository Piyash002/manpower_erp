'use client';

import React, { useEffect, useState } from 'react';
import { Wallet, RefreshCw, CheckCircle2, AlertCircle, Send, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/components/layout/DashboardLayout';
import { formatBDT, formatDateDMY } from '@/lib/formatters';

export function SalaryDisbursementView() {
  const { user } = useAuth();
  const role = user?.role || 'Viewer';
  const canAccess = ['Admin', 'Accountant', 'Viewer', 'HR'].includes(role);
  const canWrite = ['Admin', 'Accountant'].includes(role);

  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const [disburseRun, setDisburseRun] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState('');
  const [form, setForm] = useState({
    method: 'Bank' as 'Bank' | 'bKash' | 'Nagad' | 'Cash',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentReference: '',
    note: '',
  });

  const loadRuns = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/accounts/payroll-disbursements');
      const json = await res.json();
      if (json.success) setRuns(json.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess]);

  if (!canAccess) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-600">
        Your role ({role}) does not have access to Salary Disbursement.
      </div>
    );
  }

  const handleSyncAccrual = async (runId: string) => {
    setBanner(null);
    const res = await fetch('/api/accounts/payroll-disbursements', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setBanner({ type: 'ok', msg: json.message });
      loadRuns();
    } else {
      setBanner({ type: 'err', msg: json.message || 'Failed to sync accrual' });
    }
  };

  const handleDisburse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disburseRun) return;
    setSaving(true);
    setModalErr('');
    setBanner(null);
    try {
      const res = await fetch('/api/accounts/payroll-disbursements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: disburseRun._id,
          method: form.method,
          paymentDate: form.paymentDate,
          paymentReference: form.paymentReference,
          note: form.note,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Disbursement failed');
      setDisburseRun(null);
      setBanner({ type: 'ok', msg: json.message });
      loadRuns();
    } catch (err: any) {
      setModalErr(err.message);
    } finally {
      setSaving(false);
    }
  };

  const totalPendingNet = runs
    .filter((r) => r.status === 'Confirmed')
    .reduce((s, r) => s + (r.total_net_pay || 0), 0);
  const totalPaidNet = runs
    .filter((r) => r.status === 'Paid')
    .reduce((s, r) => s + (r.total_net_pay || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Wallet className="w-6 h-6 text-emerald-700" />
            <span>Salary Disbursement</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Confirmed HRM payroll runs accrue Salary Expense (5210) Dr / Salary Payable (2110) Cr. Disburse here to post PV vouchers and mark HRM payslips Paid.
          </p>
        </div>

        <button
          type="button"
          onClick={loadRuns}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Payroll Runs Listed</span>
          <p className="text-xl font-bold text-slate-900 mt-1">{runs.length}</p>
        </div>
        <div className="bg-amber-50/40 p-4 rounded-xl border border-amber-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-amber-800 uppercase">Awaiting Disbursement</span>
          <p className="text-xl font-bold font-mono text-amber-800 mt-1">{formatBDT(totalPendingNet)}</p>
        </div>
        <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-800 uppercase">Disbursed to Date</span>
          <p className="text-xl font-bold font-mono text-emerald-800 mt-1">{formatBDT(totalPaidNet)}</p>
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
          {banner.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{banner.msg}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Run Code &amp; Name</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3 text-center">Employees</th>
                <th className="px-4 py-3 text-right">Gross Pay</th>
                <th className="px-4 py-3 text-right">Net Payable</th>
                <th className="px-4 py-3">Accounts Vouchers</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Loading Confirmed payroll runs...
                  </td>
                </tr>
              ) : runs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No Confirmed or Paid payroll runs yet. Confirm a run in HRM first.
                  </td>
                </tr>
              ) : (
                runs.map((r) => {
                  const hasAccrual = (r.journalEntries || []).some(
                    (je: any) => je.sourceModule === 'PAYROLL_CONFIRM' && je.status === 'Posted'
                  );
                  return (
                    <tr key={r._id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-slate-900 block">{r.batch_code}</span>
                        <span className="text-slate-600">{r.name}</span>
                        {r.status === 'Paid' && (
                          <span className="block text-[10px] text-emerald-700">
                            {r.payment_method} · Ref: {r.payment_reference} · {formatDateDMY(r.payment_date)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.branch || 'Main'}</td>
                      <td className="px-4 py-3 text-center font-mono">{r.payslip_count}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatBDT(r.total_gross_pay)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-800">
                        {formatBDT(r.total_net_pay)}
                      </td>
                      <td className="px-4 py-3">
                        {r.journalEntries?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {r.journalEntries.map((je: any) => (
                              <span
                                key={je._id}
                                title={je.sourceModule}
                                className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${
                                  je.sourceModule === 'PAYROLL_PAY'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-blue-50 text-blue-700'
                                }`}
                              >
                                {je.voucherNo}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-amber-700">Not accrued yet</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={r.status === 'Paid' ? 'success' : 'info'}>{r.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {canWrite && r.status === 'Confirmed' && !hasAccrual && (
                            <button
                              type="button"
                              onClick={() => handleSyncAccrual(r._id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
                            >
                              <ShieldCheck className="w-3 h-3" /> Sync Accrual
                            </button>
                          )}
                          {canWrite && r.status === 'Confirmed' && (
                            <button
                              type="button"
                              onClick={() => {
                                setModalErr('');
                                setForm({
                                  method: 'Bank',
                                  paymentDate: new Date().toISOString().split('T')[0],
                                  paymentReference: '',
                                  note: '',
                                });
                                setDisburseRun(r);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-600 rounded hover:bg-emerald-700"
                            >
                              <Send className="w-3 h-3" /> Disburse
                            </button>
                          )}
                          {role !== 'Viewer' && role !== 'HR' && (
                            <a
                              href={`/api/payroll/batches/${r._id}?export=bank_xlsx`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded hover:bg-slate-200"
                            >
                              <FileSpreadsheet className="w-3 h-3" /> Excel
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disburse Salary Modal */}
      <Modal
        isOpen={Boolean(disburseRun)}
        onClose={() => setDisburseRun(null)}
        title={`Disburse Payroll — ${disburseRun?.batch_code || ''}`}
        maxWidth="md"
      >
        {disburseRun && (
          <form onSubmit={handleDisburse} className="space-y-4 text-xs">
            {modalErr && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
                {modalErr}
              </div>
            )}

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Payroll Run:</span>
                <span className="font-bold text-slate-900">{disburseRun.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Employees:</span>
                <span className="font-semibold">{disburseRun.payslip_count}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1">
                <span className="font-bold text-slate-800">Amount to Disburse (2110 Dr):</span>
                <span className="font-mono font-bold text-emerald-700 text-sm">
                  {formatBDT(disburseRun.total_net_pay)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Payout Method *</label>
                <select
                  value={form.method}
                  onChange={(e) => setForm({ ...form, method: e.target.value as any })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  <option value="Bank">Bank Transfer (1130)</option>
                  <option value="Cash">Cash (1110)</option>
                  <option value="bKash">bKash (1140)</option>
                  <option value="Nagad">Nagad (1150)</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Disbursement Date *</label>
                <input
                  type="date"
                  required
                  value={form.paymentDate}
                  onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Bank Advice / Transaction Reference *
              </label>
              <input
                type="text"
                required
                minLength={2}
                placeholder="e.g. BEFTN-2026-11-0094"
                value={form.paymentReference}
                onChange={(e) => setForm({ ...form, paymentReference: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Note</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Optional bank transfer memo"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDisburseRun(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
              >
                {saving ? 'Posting PV & Paying...' : 'Disburse Salary & Post PV'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
