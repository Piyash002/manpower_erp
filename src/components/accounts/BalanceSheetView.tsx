'use client';

import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  RefreshCw,
  FileSpreadsheet,
  Printer,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatDateDMY } from '@/lib/formatters';
import { formatPaisaBDT, paisaToTaka } from '@/lib/accounts-money';
import { downloadExcel, printTableReport } from '@/lib/client-export';

interface BalanceSheetData {
  asOfDate: string;
  assets: Array<{ code: string; name: string; isContra: boolean; balancePaisa: number }>;
  totalAssetsPaisa: number;
  liabilities: Array<{ code: string; name: string; balancePaisa: number }>;
  totalLiabilitiesPaisa: number;
  equity: Array<{ code: string; name: string; balancePaisa: number }>;
  currentPeriodNetProfitPaisa: number;
  totalEquityPaisa: number;
  liabilitiesPlusEquityPaisa: number;
  differencePaisa: number;
  isBalanced: boolean;
}

interface AssetRegisterData {
  rows: Array<{
    _id: string;
    assetCode: string;
    name: string;
    categoryTag: string;
    purchaseDate: string;
    costPaisa: number;
    accumulatedDepreciationPaisa: number;
    netBookValuePaisa: number;
    status: string;
  }>;
  summary: {
    activeCount: number;
    disposedCount: number;
    totalCostPaisa: number;
    totalAccumulatedDepreciationPaisa: number;
    totalNetBookValuePaisa: number;
    glGrossCostPaisa: number;
    glAccumDepPaisa: number;
    glNetBookValuePaisa: number;
  };
}

interface ExpenseSummaryData {
  categories: Array<{
    categoryName: string;
    accountCode: string;
    count: number;
    totalPaisa: number;
    paidPaisa: number;
    unpaidPaisa: number;
    prepaidPaisa: number;
  }>;
  glBreakdown: Array<{ code: string; name: string; amountPaisa: number }>;
  totalGlExpensePaisa: number;
}

export function BalanceSheetView() {
  const [tab, setTab] = useState<'bs' | 'assets' | 'expenses'>('bs');
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [bs, setBs] = useState<BalanceSheetData | null>(null);
  const [ar, setAr] = useState<AssetRegisterData | null>(null);
  const [es, setEs] = useState<ExpenseSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const expParams = new URLSearchParams();
      if (startDate) expParams.set('startDate', startDate);
      if (endDate) expParams.set('endDate', endDate);

      const [bsRes, arRes, esRes] = await Promise.all([
        fetch(`/api/accounts/reports/balance-sheet?asOfDate=${encodeURIComponent(asOfDate)}`),
        fetch('/api/accounts/reports/asset-register'),
        fetch(`/api/accounts/reports/expense-summary?${expParams.toString()}`),
      ]);
      const [bsJson, arJson, esJson] = await Promise.all([
        bsRes.json(),
        arRes.json(),
        esRes.json(),
      ]);
      if (!bsJson.success) throw new Error(bsJson.message || 'Failed to load balance sheet');
      setBs(bsJson.data);
      if (arJson.success) setAr(arJson.data);
      if (esJson.success) setEs(esJson.data);
    } catch (err: any) {
      setError(err?.message || 'Error loading financial reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const exportBalanceSheet = async () => {
    if (!bs) return;
    const rows: Array<[string, string, string, number]> = [
      ...bs.assets.map(
        (a) => ['Assets', a.code, a.name, paisaToTaka(a.balancePaisa)] as [string, string, string, number]
      ),
      ['Assets', '', 'TOTAL ASSETS', paisaToTaka(bs.totalAssetsPaisa)],
      ...bs.liabilities.map(
        (l) => ['Liabilities', l.code, l.name, paisaToTaka(l.balancePaisa)] as [string, string, string, number]
      ),
      ['Liabilities', '', 'TOTAL LIABILITIES', paisaToTaka(bs.totalLiabilitiesPaisa)],
      ...bs.equity.map(
        (eq) => ['Equity', eq.code, eq.name, paisaToTaka(eq.balancePaisa)] as [string, string, string, number]
      ),
      ['Equity', '', 'Current Period Net Profit / (Loss)', paisaToTaka(bs.currentPeriodNetProfitPaisa)],
      ['Equity', '', 'TOTAL EQUITY', paisaToTaka(bs.totalEquityPaisa)],
      ['Summary', '', 'TOTAL LIABILITIES + EQUITY', paisaToTaka(bs.liabilitiesPlusEquityPaisa)],
    ];
    await downloadExcel({
      filename: `balance-sheet-${asOfDate}`,
      sheetName: 'Balance Sheet',
      headers: ['Section', 'Code', 'Account', 'Amount (BDT)'],
      rows,
    });
  };

  const printBalanceSheet = () => {
    if (!bs) return;
    const rows: Array<[string, string, string, string]> = [
      ...bs.assets.map((a) => ['Assets', a.code, a.name, formatPaisaBDT(a.balancePaisa)] as [string, string, string, string]),
      ['Assets', '', 'TOTAL ASSETS', formatPaisaBDT(bs.totalAssetsPaisa)],
      ...bs.liabilities.map((l) => ['Liabilities', l.code, l.name, formatPaisaBDT(l.balancePaisa)] as [string, string, string, string]),
      ['Liabilities', '', 'TOTAL LIABILITIES', formatPaisaBDT(bs.totalLiabilitiesPaisa)],
      ...bs.equity.map((eq) => ['Equity', eq.code, eq.name, formatPaisaBDT(eq.balancePaisa)] as [string, string, string, string]),
      ['Equity', '', 'Current Period Net Profit / (Loss)', formatPaisaBDT(bs.currentPeriodNetProfitPaisa)],
      ['Equity', '', 'TOTAL LIABILITIES + EQUITY', formatPaisaBDT(bs.liabilitiesPlusEquityPaisa)],
    ];
    printTableReport({
      title: `Balance Sheet as of ${formatDateDMY(bs.asOfDate)}`,
      subtitle: 'CodeZenX ERP — General Ledger Derived',
      headers: ['Section', 'Code', 'Account', 'Amount (BDT)'],
      rows,
      rightAlignCols: [3],
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
            Financial Reports & Balance Sheet
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            GL-derived Balance Sheet, Fixed Asset Register reconciliation, and Expense Summary.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {tab === 'bs' && bs && (
            <>
              <button
                onClick={exportBalanceSheet}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
              </button>
              <button
                onClick={printBalanceSheet}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex gap-2">
          {[
            { key: 'bs', label: 'Balance Sheet' },
            { key: 'assets', label: 'Fixed Asset Register' },
            { key: 'expenses', label: 'Expense Summary' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as 'bs' | 'assets' | 'expenses')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                tab === t.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'bs' && (
          <div className="flex items-center gap-2 text-xs">
            <label className="text-slate-600 font-medium">As of:</label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1 bg-white"
            />
            <button
              onClick={loadAll}
              className="px-3 py-1 rounded-lg bg-slate-900 text-white font-medium"
            >
              Apply
            </button>
          </div>
        )}

        {tab === 'expenses' && (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1 bg-white"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1 bg-white"
            />
            <button
              onClick={loadAll}
              className="px-3 py-1 rounded-lg bg-slate-900 text-white font-medium"
            >
              Filter
            </button>
          </div>
        )}
      </div>

      {loading && <div className="py-10 text-center text-xs text-slate-400">Loading report...</div>}

      {!loading && tab === 'bs' && bs && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl p-3.5 text-xs">
            <div className="flex items-center gap-2">
              {bs.isBalanced ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600" />
              )}
              <span className="font-semibold text-slate-800">
                {bs.isBalanced
                  ? 'Balance Sheet is Balanced (Assets = Liabilities + Equity)'
                  : `Out of Balance by ${formatPaisaBDT(bs.differencePaisa)}`}
              </span>
            </div>
            <div className="text-slate-500">As of {formatDateDMY(bs.asOfDate)}</div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Assets */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2 mb-3">
                Assets
              </h2>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  {bs.assets.map((a) => (
                    <tr key={a.code}>
                      <td className="py-2 font-mono text-slate-500 w-16">{a.code}</td>
                      <td className="py-2 text-slate-800">
                        {a.name}{' '}
                        {a.isContra && (
                          <span className="text-[10px] text-amber-600">(Contra-Asset)</span>
                        )}
                      </td>
                      <td className="py-2 text-right font-medium text-slate-900">
                        {formatPaisaBDT(a.balancePaisa)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-bold text-slate-900">
                    <td colSpan={2} className="py-2.5">
                      Total Assets
                    </td>
                    <td className="py-2.5 text-right text-emerald-700">
                      {formatPaisaBDT(bs.totalAssetsPaisa)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Liabilities & Equity */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2 mb-3">
                  Liabilities
                </h2>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-slate-100">
                    {bs.liabilities.length === 0 ? (
                      <tr>
                        <td className="py-2 text-slate-400">No liability balances.</td>
                      </tr>
                    ) : (
                      bs.liabilities.map((l) => (
                        <tr key={l.code}>
                          <td className="py-2 font-mono text-slate-500 w-16">{l.code}</td>
                          <td className="py-2 text-slate-800">{l.name}</td>
                          <td className="py-2 text-right font-medium text-slate-900">
                            {formatPaisaBDT(l.balancePaisa)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-300 font-semibold text-slate-900">
                      <td colSpan={2} className="py-2">
                        Total Liabilities
                      </td>
                      <td className="py-2 text-right">{formatPaisaBDT(bs.totalLiabilitiesPaisa)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div>
                <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2 mb-3">
                  Equity
                </h2>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-slate-100">
                    {bs.equity.map((eq) => (
                      <tr key={eq.code}>
                        <td className="py-2 font-mono text-slate-500 w-16">{eq.code}</td>
                        <td className="py-2 text-slate-800">{eq.name}</td>
                        <td className="py-2 text-right font-medium text-slate-900">
                          {formatPaisaBDT(eq.balancePaisa)}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td className="py-2 font-mono text-slate-500 w-16">P&amp;L</td>
                      <td className="py-2 text-slate-800">Current Period Net Profit / (Loss)</td>
                      <td className="py-2 text-right font-medium text-slate-900">
                        {formatPaisaBDT(bs.currentPeriodNetProfitPaisa)}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-300 font-semibold text-slate-900">
                      <td colSpan={2} className="py-2">
                        Total Equity
                      </td>
                      <td className="py-2 text-right">{formatPaisaBDT(bs.totalEquityPaisa)}</td>
                    </tr>
                    <tr className="border-t-2 border-slate-300 font-bold text-slate-900">
                      <td colSpan={2} className="py-2.5">
                        Total Liabilities + Equity
                      </td>
                      <td className="py-2.5 text-right text-emerald-700">
                        {formatPaisaBDT(bs.liabilitiesPlusEquityPaisa)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && tab === 'assets' && ar && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="text-[11px] text-slate-500">Active / Disposed</div>
              <div className="text-sm font-bold mt-1">
                {ar.summary.activeCount} Active · {ar.summary.disposedCount} Disposed
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="text-[11px] text-slate-500">Register Gross Cost</div>
              <div className="text-sm font-bold mt-1">
                {formatPaisaBDT(ar.summary.totalCostPaisa)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="text-[11px] text-slate-500">Register Accum. Depr.</div>
              <div className="text-sm font-bold text-amber-700 mt-1">
                {formatPaisaBDT(ar.summary.totalAccumulatedDepreciationPaisa)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="text-[11px] text-slate-500">GL Net Book Value (1310-1390)</div>
              <div className="text-sm font-bold text-emerald-700 mt-1">
                {formatPaisaBDT(ar.summary.glNetBookValuePaisa)}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                  <th className="py-2 px-2">Code</th>
                  <th className="py-2 px-2">Name</th>
                  <th className="py-2 px-2">Purchase Date</th>
                  <th className="py-2 px-2 text-right">Cost</th>
                  <th className="py-2 px-2 text-right">Accum. Depr.</th>
                  <th className="py-2 px-2 text-right">NBV</th>
                  <th className="py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ar.rows.map((r) => (
                  <tr key={r._id}>
                    <td className="py-2 px-2 font-mono font-semibold">{r.assetCode}</td>
                    <td className="py-2 px-2">{r.name}</td>
                    <td className="py-2 px-2">{formatDateDMY(r.purchaseDate)}</td>
                    <td className="py-2 px-2 text-right">{formatPaisaBDT(r.costPaisa)}</td>
                    <td className="py-2 px-2 text-right text-amber-700">
                      {formatPaisaBDT(r.accumulatedDepreciationPaisa || 0)}
                    </td>
                    <td className="py-2 px-2 text-right font-semibold text-emerald-700">
                      {formatPaisaBDT(r.netBookValuePaisa)}
                    </td>
                    <td className="py-2 px-2">
                      <Badge variant={r.status === 'Active' ? 'success' : 'info'}>
                        {r.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && tab === 'expenses' && es && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2 mb-3">
              Expense Records by Category
            </h2>
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2">Category</th>
                  <th className="py-2 text-right">Count</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {es.categories.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-400">
                      No expense records in range.
                    </td>
                  </tr>
                ) : (
                  es.categories.map((c) => (
                    <tr key={`${c.accountCode}-${c.categoryName}`}>
                      <td className="py-2 font-medium">
                        {c.categoryName}{' '}
                        <span className="text-[10px] text-slate-400">({c.accountCode})</span>
                      </td>
                      <td className="py-2 text-right">{c.count}</td>
                      <td className="py-2 text-right font-semibold">
                        {formatPaisaBDT(c.totalPaisa)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2 mb-3">
              GL Expense Accounts (Posted Vouchers)
            </h2>
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2">Code</th>
                  <th className="py-2">Account</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {es.glBreakdown.map((g) => (
                  <tr key={g.code}>
                    <td className="py-2 font-mono text-slate-500">{g.code}</td>
                    <td className="py-2">{g.name}</td>
                    <td className="py-2 text-right font-semibold">{formatPaisaBDT(g.amountPaisa)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-bold">
                  <td colSpan={2} className="py-2">
                    Total GL Expenses
                  </td>
                  <td className="py-2 text-right text-emerald-700">
                    {formatPaisaBDT(es.totalGlExpensePaisa)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

