'use client';

import React, { useEffect, useState } from 'react';
import { Scale, Plus, CheckCircle2, AlertCircle, RefreshCw, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/components/layout/DashboardLayout';
import { formatDateDMY } from '@/lib/formatters';
import { formatPaisaBDT, takaToPaisa } from '@/lib/accounts-money';

interface OpeningRow {
  accountId: string;
  debitTaka: string;
  creditTaka: string;
  branch: string;
  department: string;
}

export function OpeningBalancesView() {
  const { user } = useAuth();
  const role = user?.role || 'Viewer';
  const canAccess = ['Admin', 'Accountant', 'Viewer'].includes(role);
  const canWrite = ['Admin', 'Accountant'].includes(role);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [asOfDate, setAsOfDate] = useState('2026-01-01');
  const [description, setDescription] = useState('Opening Balances Cutover');
  const [autoBalance, setAutoBalance] = useState(true);
  const [rows, setRows] = useState<OpeningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cRes, oRes] = await Promise.all([
        fetch('/api/accounts/coa?leafOnly=true'),
        fetch('/api/accounts/opening-balances'),
      ]);
      const [cJson, oJson] = await Promise.all([cRes.json(), oRes.json()]);
      if (cJson.success) {
        const list = (cJson.data || []).filter((a: any) => a.systemTag !== 'OPENING_EQUITY');
        setAccounts(list);
        if (rows.length === 0 && list.length > 0) {
          const cash = list.find((a: any) => a.systemTag === 'CASH') || list[0];
          const bank = list.find((a: any) => a.systemTag === 'BANK_MAIN') || list[1] || list[0];
          setRows([
            { accountId: cash._id, debitTaka: '', creditTaka: '', branch: 'Main', department: 'General' },
            { accountId: bank._id, debitTaka: '', creditTaka: '', branch: 'Main', department: 'General' },
          ]);
        }
      }
      if (oJson.success) setHistory(oJson.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess]);

  if (!canAccess) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-600">
        Your role ({role}) does not have access to Accounts.
      </div>
    );
  }

  const totalDrPaisa = rows.reduce((s, r) => s + takaToPaisa(r.debitTaka), 0);
  const totalCrPaisa = rows.reduce((s, r) => s + takaToPaisa(r.creditTaka), 0);
  const diffPaisa = totalDrPaisa - totalCrPaisa;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPosting(true);
    setBanner(null);
    try {
      const res = await fetch('/api/accounts/opening-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asOfDate,
          description,
          autoBalanceWithEquity: autoBalance,
          lines: rows.map((r) => ({
            accountId: r.accountId,
            debitPaisa: takaToPaisa(r.debitTaka),
            creditPaisa: takaToPaisa(r.creditTaka),
            branch: r.branch || 'Main',
            department: r.department || 'General',
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to post opening balances');
      setBanner({ type: 'ok', msg: json.message });
      setRows((prev) => prev.map((r) => ({ ...r, debitTaka: '', creditTaka: '' })));
      loadData();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Scale className="w-6 h-6 text-emerald-700" />
            <span>Opening Balances</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Post cutover balances as a balanced Journal Voucher (auto-offset to Opening Balance Equity 3900 if enabled).
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

      {canWrite && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Cutover Date *</label>
              <input
                type="date"
                required
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2 text-right">Debit Opening (৳)</th>
                  <th className="px-3 py-2 text-right">Credit Opening (৳)</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2">
                      <select
                        value={r.accountId}
                        onChange={(e) => {
                          const next = [...rows];
                          next[idx].accountId = e.target.value;
                          setRows(next);
                        }}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md"
                      >
                        {accounts.map((a) => (
                          <option key={a._id} value={a._id}>
                            {a.code} — {a.name} ({a.type})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 w-28">
                      <input
                        type="text"
                        value={r.branch}
                        onChange={(e) => {
                          const next = [...rows];
                          next[idx].branch = e.target.value;
                          setRows(next);
                        }}
                        className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md"
                      />
                    </td>
                    <td className="px-3 py-2 w-32">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={r.debitTaka}
                        onChange={(e) => {
                          const next = [...rows];
                          next[idx].debitTaka = e.target.value;
                          if (Number(e.target.value) > 0) next[idx].creditTaka = '';
                          setRows(next);
                        }}
                        placeholder="0.00"
                        className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md text-right font-mono"
                      />
                    </td>
                    <td className="px-3 py-2 w-32">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={r.creditTaka}
                        onChange={(e) => {
                          const next = [...rows];
                          next[idx].creditTaka = e.target.value;
                          if (Number(e.target.value) > 0) next[idx].debitTaka = '';
                          setRows(next);
                        }}
                        placeholder="0.00"
                        className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md text-right font-mono"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-rose-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() =>
                  setRows([
                    ...rows,
                    {
                      accountId: accounts[0]?._id || '',
                      debitTaka: '',
                      creditTaka: '',
                      branch: 'Main',
                      department: 'General',
                    },
                  ])
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" /> Add Row
              </button>

              <label className="inline-flex items-center gap-2 font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoBalance}
                  onChange={(e) => setAutoBalance(e.target.checked)}
                />
                <span>Auto-balance difference to Opening Balance Equity (3900)</span>
              </label>
            </div>

            <div className="flex items-center gap-3 font-mono">
              <span>Dr: {formatPaisaBDT(totalDrPaisa)}</span>
              <span>Cr: {formatPaisaBDT(totalCrPaisa)}</span>
              {diffPaisa !== 0 && !autoBalance ? (
                <Badge variant="danger">Unbalanced ({formatPaisaBDT(diffPaisa)})</Badge>
              ) : (
                <button
                  type="submit"
                  disabled={posting || (totalDrPaisa === 0 && totalCrPaisa === 0)}
                  className="px-4 py-2 font-sans text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                >
                  {posting ? 'Posting...' : 'Post Opening Balances'}
                </button>
              )}
            </div>
          </div>
        </form>
      )}

      {/* Posted History */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 uppercase">
          Posted Opening Balance Entries ({history.length})
        </div>
        {history.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            No opening balance entries posted yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 text-xs">
            {history.map((e) => (
              <div key={e._id} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <span className="font-mono font-bold text-slate-900">{e.voucherNo}</span>{' '}
                  <Badge variant={e.status === 'Reversed' ? 'danger' : 'success'}>{e.status}</Badge>
                  <p className="text-slate-600 mt-0.5">
                    {formatDateDMY(e.entryDate)} · {e.description} ({(e.lines || []).length} lines)
                  </p>
                </div>
                <span className="font-mono font-bold text-slate-900">
                  {formatPaisaBDT(e.totalDebitPaisa)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

