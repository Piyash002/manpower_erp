'use client';

import React, { useEffect, useState } from 'react';
import { BookMarked, Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { TableToolbar } from '@/components/ui/TableToolbar';
import { useAuth } from '@/components/layout/DashboardLayout';
import { EMPLOYEE_DEPARTMENTS, formatDateDMY } from '@/lib/formatters';
import { formatPaisaBDT, paisaToTaka } from '@/lib/accounts-money';
import {
  downloadExcel,
  matchesSearch,
  printTableReport,
  sortTableItems,
  type SortDir,
} from '@/lib/client-export';

export function GeneralLedgerView() {
  const { user } = useAuth();
  const role = user?.role || 'Viewer';
  const canAccess = ['Admin', 'Accountant', 'Viewer'].includes(role);

  const now = new Date();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>(
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
  );
  const [endDate, setEndDate] = useState<string>(now.toISOString().split('T')[0]);
  const [branch, setBranch] = useState<string>('all');
  const [department, setDepartment] = useState<string>('all');
  const [ledger, setLedger] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    if (!canAccess) return;
    (async () => {
      const res = await fetch('/api/accounts/coa?leafOnly=true');
      const json = await res.json();
      if (json.success && json.data?.length) {
        setAccounts(json.data);
        const qs = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const reqAcc = qs?.get('accountId');
        setAccountId(
          reqAcc && json.data.some((a: any) => a._id === reqAcc) ? reqAcc : json.data[0]._id
        );
      } else {
        setLoading(false);
      }
    })();
  }, [canAccess]);

  const loadLedger = async (targetAccId = accountId) => {
    if (!targetAccId) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ accountId: targetAccId, branch, department });
      if (startDate) qs.set('startDate', startDate);
      if (endDate) qs.set('endDate', endDate);

      const res = await fetch(`/api/accounts/ledger?${qs.toString()}`);
      const json = await res.json();
      if (json.success) setLedger(json.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess && accountId) loadLedger(accountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, accountId, startDate, endDate, branch, department]);

  if (!canAccess) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-600">
        Your role ({role}) does not have access to Accounts.
      </div>
    );
  }

  const exportQs = new URLSearchParams({ accountId, branch, department });
  if (startDate) exportQs.set('startDate', startDate);
  if (endDate) exportQs.set('endDate', endDate);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BookMarked className="w-6 h-6 text-emerald-700" />
            <span>General Ledger</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Account-by-account transaction statement with running balance and branch/department slice.
          </p>
        </div>

        {accountId && (
          <div className="flex items-center gap-2">
            <a
              href={`/api/accounts/ledger?${exportQs.toString()}&export=csv`}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </a>
            <a
              href={`/api/accounts/ledger?${exportQs.toString()}&export=xlsx`}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
            </a>
            <button
              type="button"
              onClick={() => loadLedger()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs grid grid-cols-1 md:grid-cols-5 gap-2.5 text-xs">
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Account</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
          >
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.code} — {a.name} ({a.type})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">From Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">To Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Department</label>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
          >
            <option value="all">All Departments</option>
            <option value="General">General</option>
            {EMPLOYEE_DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Strip */}
      {ledger && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Opening Balance</span>
            <p className="text-xl font-bold text-slate-900 font-mono mt-1">
              {formatPaisaBDT(ledger.openingBalancePaisa)}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Period Debit</span>
            <p className="text-xl font-bold text-slate-900 font-mono mt-1">
              {formatPaisaBDT(ledger.periodDebitPaisa)}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Period Credit</span>
            <p className="text-xl font-bold text-slate-900 font-mono mt-1">
              {formatPaisaBDT(ledger.periodCreditPaisa)}
            </p>
          </div>
          <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-200 shadow-2xs">
            <span className="text-[11px] font-semibold text-emerald-800 uppercase">Closing Balance</span>
            <p className="text-xl font-bold text-emerald-800 font-mono mt-1">
              {formatPaisaBDT(ledger.closingBalancePaisa)}
            </p>
          </div>
        </div>
      )}

      {/* Ledger Search / Sort / Export / Print + Table */}
      {(() => {
        const rawRows: any[] = ledger?.rows || [];
        const filteredRows = rawRows.filter((r) =>
          matchesSearch(search, [r.voucherNo, r.journalType, r.branch, r.department, r.description])
        );
        const sortedRows = sortTableItems(filteredRows, sortKey, sortDir, {
          date: (r) => new Date(r.entryDate || 0),
          voucherNo: (r) => r.voucherNo || '',
          debit: (r) => Number(r.debitPaisa || 0),
          credit: (r) => Number(r.creditPaisa || 0),
          balance: (r) => Number(r.runningBalancePaisa || 0),
        });
        const selectedAcc = accounts.find((a) => a._id === accountId);
        const headers = ['Date', 'Voucher', 'Type', 'Branch / Dept', 'Description', 'Debit (BDT)', 'Credit (BDT)', 'Balance (BDT)'];
        const exportRows = sortedRows.map((r) => [
          formatDateDMY(r.entryDate),
          r.voucherNo,
          r.journalType,
          `${r.branch || 'Main'} / ${r.department || 'General'}`,
          r.description,
          r.debitPaisa > 0 ? paisaToTaka(r.debitPaisa) : 0,
          r.creditPaisa > 0 ? paisaToTaka(r.creditPaisa) : 0,
          paisaToTaka(r.runningBalancePaisa || 0),
        ]);

        return (
          <>
            <TableToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search voucher no, description, dept..."
              sortKey={sortKey}
              sortDir={sortDir}
              sortOptions={[
                { value: 'date', label: 'Entry Date' },
                { value: 'voucherNo', label: 'Voucher No' },
                { value: 'debit', label: 'Debit' },
                { value: 'credit', label: 'Credit' },
                { value: 'balance', label: 'Balance' },
              ]}
              onSortChange={(k, d) => {
                setSortKey(k);
                setSortDir(d);
              }}
              totalCount={rawRows.length}
              filteredCount={sortedRows.length}
              onReset={() => setSearch('')}
              onExportExcel={
                ledger
                  ? () =>
                      downloadExcel({
                        filename: `ledger-${selectedAcc?.code || 'account'}`,
                        sheetName: 'General Ledger',
                        headers,
                        rows: exportRows,
                      })
                  : undefined
              }
              onPrint={
                ledger
                  ? () =>
                      printTableReport({
                        title: `General Ledger — ${selectedAcc ? `${selectedAcc.code} ${selectedAcc.name}` : ''}`,
                        meta: `Period: ${startDate} to ${endDate} | Dept: ${department}`,
                        headers,
                        rows: exportRows,
                        rightAlignCols: [5, 6, 7],
                        landscape: true,
                      })
                  : undefined
              }
            />

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Voucher</th>
                <th className="px-4 py-3">Dimension</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Debit</th>
                <th className="px-4 py-3 text-right">Credit</th>
                <th className="px-4 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Loading General Ledger...
                  </td>
                </tr>
              ) : !ledger ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Select an account to view its ledger.
                  </td>
                </tr>
              ) : (
                <>
                  <tr className="bg-slate-50/70 font-semibold text-slate-700">
                    <td className="px-4 py-2.5">{startDate ? formatDateDMY(startDate) : '-'}</td>
                    <td className="px-4 py-2.5 font-mono">OPENING</td>
                    <td className="px-4 py-2.5">-</td>
                    <td className="px-4 py-2.5">Opening Balance brought forward</td>
                    <td className="px-4 py-2.5 text-right font-mono">-</td>
                    <td className="px-4 py-2.5 text-right font-mono">-</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {formatPaisaBDT(ledger.openingBalancePaisa)}
                    </td>
                  </tr>
                  {sortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        No matching ledger entries found.
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map((r: any) => (
                      <tr key={r._id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">
                          {formatDateDMY(r.entryDate)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap font-mono font-semibold text-slate-900">
                          {r.voucherNo}{' '}
                          <Badge variant={r.isReversal ? 'danger' : 'gray'}>{r.journalType}</Badge>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">
                          {r.branch} · {r.department}
                        </td>
                        <td className="px-4 py-2.5 text-slate-800">{r.description}</td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          {r.debitPaisa > 0 ? formatPaisaBDT(r.debitPaisa) : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          {r.creditPaisa > 0 ? formatPaisaBDT(r.creditPaisa) : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                          {formatPaisaBDT(r.runningBalancePaisa)}
                        </td>
                      </tr>
                    ))
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
          </>
        );
      })()}
    </div>
  );
}

