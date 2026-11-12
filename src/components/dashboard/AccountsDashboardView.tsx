'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Landmark,
  Banknote,
  Users2,
  ClockAlert,
  Building2,
  ReceiptText,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  FileSpreadsheet,
  BookMarked,
  Wallet,
  RefreshCw,
} from 'lucide-react';
import {
  DashboardShell,
  DashboardCard,
  VerticalBarChart,
} from '@/components/dashboard/DashboardShell';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/components/layout/DashboardLayout';
import { formatDateDMY, formatBDT } from '@/lib/formatters';
import { formatPaisaBDT, paisaToTaka } from '@/lib/accounts-money';
import { downloadExcel } from '@/lib/client-export';
import type { DateRangePreset } from '@/lib/dashboard-helpers';

interface AccountsDashboardData {
  range: { preset: DateRangePreset; label: string; startIso: string; endIso: string };
  kpis: {
    cashBankBalancePaisa: number;
    cashBreakdown: Array<{ code: string; name: string; balancePaisa: number }>;
    collectionsPaisa: number;
    collectionsCount: number;
    receivablePaisa: number;
    overdueCount: number;
    overdueAmountPaisa: number;
  };
  statusStrip: {
    fiscalPeriodName: string;
    fiscalPeriodStatus: string;
    trialBalanceBalanced: boolean;
    trialBalanceDiffPaisa: number;
  };
  modules: {
    fixedAssetsNbvPaisa: number;
    fixedAssetsCount: number;
    expensesThisMonthPaisa: number;
    payablesDuePaisa: number;
    payablesCount: number;
  };
  charts: {
    incomeVsExpense: Array<{ label: string; primary: number; secondary: number }>;
    collectionsTrend: Array<{ label: string; primary: number }>;
  };
  tables: {
    candidateDuesSummary: Array<{
      planId: string;
      studentId: string;
      studentNo: string;
      name: string;
      tradeName: string;
      batch: string;
      totalFeePaisa: number;
      totalPaidPaisa: number;
      duePaisa: number;
      nextInstallment: {
        label: string;
        dueDate: string;
        remainingPaisa: number;
      } | null;
      status: string;
    }>;
    pendingActions: Array<{
      id: string;
      title: string;
      detail: string;
      count: number;
      href: string;
      actionLabel: string;
    }>;
  };
}

export function AccountsDashboardView() {
  const { user } = useAuth();
  const canWrite = user?.role === 'Admin' || user?.role === 'Accountant';

  const [dateRange, setDateRange] = useState<DateRangePreset>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [data, setData] = useState<AccountsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ range: dateRange });
      if (dateRange === 'custom') {
        if (customStart) params.set('startDate', customStart);
        if (customEnd) params.set('endDate', customEnd);
      }

      const res = await fetch(`/api/dashboard/accounts?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to load accounts dashboard');
      }
      setData(json);
    } catch (err: any) {
      setError(err?.message || 'Unable to load accounts dashboard');
    } finally {
      setLoading(false);
    }
  }, [dateRange, customStart, customEnd]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExport = async () => {
    if (!data) return;
    await downloadExcel({
      filename: `accounts-dashboard-dues-${data.range.preset}`,
      sheetName: 'Candidate Dues',
      headers: [
        'Roll No',
        'Candidate',
        'Trade',
        'Batch',
        'Total Fee (BDT)',
        'Total Paid (BDT)',
        'Due Balance (BDT)',
        'Status',
      ],
      rows: data.tables.candidateDuesSummary.map((r) => [
        r.studentNo,
        r.name,
        r.tradeName,
        r.batch,
        paisaToTaka(r.totalFeePaisa),
        paisaToTaka(r.totalPaidPaisa),
        paisaToTaka(r.duePaisa),
        r.status,
      ]),
    });
  };

  const cashTooltip = data
    ? data.kpis.cashBreakdown
        .map((c) => `${c.code} ${c.name}: ${formatPaisaBDT(c.balancePaisa)}`)
        .join(' | ')
    : undefined;

  const kpis = [
    {
      label: 'Cash & Bank Balance',
      value: data ? formatPaisaBDT(data.kpis.cashBankBalancePaisa) : '৳0',
      helper: 'GL 1110–1150 (hover for breakdown)',
      href: '/accounts/ledger',
      icon: <Landmark className="w-4 h-4" />,
      accent: 'emerald' as const,
      tooltip: cashTooltip,
    },
    {
      label: 'Collections',
      value: data ? formatPaisaBDT(data.kpis.collectionsPaisa) : '৳0',
      helper: data
        ? `${data.kpis.collectionsCount} posted receipts (${data.range.label})`
        : 'Posted money receipts',
      href: '/accounts/receipts',
      icon: <Banknote className="w-4 h-4" />,
      accent: 'sky' as const,
    },
    {
      label: 'Outstanding Receivable',
      value: data ? formatPaisaBDT(data.kpis.receivablePaisa) : '৳0',
      helper: 'GL 1210 Student Fee Receivable',
      href: '/accounts/student-fees',
      icon: <Users2 className="w-4 h-4" />,
      accent: 'indigo' as const,
    },
    {
      label: 'Overdue Installments',
      value: data ? formatPaisaBDT(data.kpis.overdueAmountPaisa) : '৳0',
      helper: data
        ? `${data.kpis.overdueCount} overdue installment${data.kpis.overdueCount === 1 ? '' : 's'}`
        : 'Past due installments',
      href: '/accounts/dues',
      icon: <ClockAlert className="w-4 h-4" />,
      accent: 'rose' as const,
    },
  ];

  const quickLinks = [
    { label: 'Money Receipts', href: '/accounts/receipts', icon: <Banknote className="w-4 h-4" /> },
    { label: 'Student Fees', href: '/accounts/student-fees', icon: <Users2 className="w-4 h-4" /> },
    { label: 'Due & Aging', href: '/accounts/dues', icon: <ClockAlert className="w-4 h-4" /> },
    { label: 'Vouchers', href: '/accounts/vouchers', icon: <FileSpreadsheet className="w-4 h-4" /> },
    { label: 'General Ledger', href: '/accounts/ledger', icon: <BookMarked className="w-4 h-4" /> },
    { label: 'Salary Disbursement', href: '/accounts/payroll', icon: <Wallet className="w-4 h-4" /> },
  ];

  const extraStrip = data ? (
    <div className="space-y-3">
      {/* Status Strip: Fiscal Period & Trial Balance */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          {data.statusStrip.fiscalPeriodStatus === 'Open' ? (
            <Unlock className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <Lock className="w-3.5 h-3.5 text-amber-600" />
          )}
          <span className="text-slate-500">Current Fiscal Period:</span>
          <span className="font-semibold text-slate-900">{data.statusStrip.fiscalPeriodName}</span>
          <Badge variant={data.statusStrip.fiscalPeriodStatus === 'Open' ? 'success' : 'warning'}>
            {data.statusStrip.fiscalPeriodStatus}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {data.statusStrip.trialBalanceBalanced ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="font-semibold text-emerald-700">
                Trial Balance Reconciled (1 paisa tolerance)
              </span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span className="font-semibold text-rose-700">
                Trial Balance Out of Balance by {formatPaisaBDT(data.statusStrip.trialBalanceDiffPaisa)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Optional Module Cards: Fixed Assets NBV, Expenses This Month, Payables Due */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Link
          href="/accounts/assets"
          className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 shadow-xs flex items-center justify-between gap-3 transition-colors"
        >
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Fixed Assets Net Book Value</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">
              {formatPaisaBDT(data.modules.fixedAssetsNbvPaisa)}
            </div>
            <div className="text-[11px] text-slate-400">
              {data.modules.fixedAssetsCount} active asset{data.modules.fixedAssetsCount === 1 ? '' : 's'}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
            <Building2 className="w-4 h-4" />
          </div>
        </Link>

        <Link
          href="/accounts/expenses"
          className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 shadow-xs flex items-center justify-between gap-3 transition-colors"
        >
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Expenses This Month</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">
              {formatPaisaBDT(data.modules.expensesThisMonthPaisa)}
            </div>
            <div className="text-[11px] text-slate-400">Posted operating expenses</div>
          </div>
          <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
            <ReceiptText className="w-4 h-4" />
          </div>
        </Link>

        <Link
          href="/accounts/liabilities"
          className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 shadow-xs flex items-center justify-between gap-3 transition-colors"
        >
          <div>
            <div className="text-[11px] font-semibold text-slate-500">Payables Due</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">
              {formatPaisaBDT(data.modules.payablesDuePaisa)}
            </div>
            <div className="text-[11px] text-slate-400">
              {data.modules.payablesCount} open vendor bill{data.modules.payablesCount === 1 ? '' : 's'}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
            <CreditCard className="w-4 h-4" />
          </div>
        </Link>
      </div>
    </div>
  ) : null;

  return (
    <DashboardShell
      title="Accounts Dashboard"
      subtitle="General ledger balances, fee collections, receivables, and pending financial actions"
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      customStart={customStart}
      customEnd={customEnd}
      onCustomDateChange={(s, e) => {
        setCustomStart(s);
        setCustomEnd(e);
      }}
      onExport={handleExport}
      kpis={kpis}
      extraStrip={extraStrip}
      loading={loading}
      error={error}
      headerRightExtra={
        <button
          type="button"
          onClick={loadData}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          Refresh
        </button>
      }
      charts={
        <>
          <DashboardCard
            title="Income vs Expense"
            subtitle={`Posted GL income and expense by month (${new Date().getFullYear()})`}
            actionHref="/accounts/balance-sheet"
            actionLabel="Reports"
          >
            <VerticalBarChart
              items={data?.charts.incomeVsExpense || []}
              primaryLabel="Income"
              secondaryLabel="Expense"
              formatValue={(v) => formatBDT(v)}
              emptyText="No posted income or expense entries this year."
            />
          </DashboardCard>

          <DashboardCard
            title="Collections Trend"
            subtitle={`Daily posted receipts (${data?.range.label || 'This Month'})`}
            actionHref="/accounts/receipts"
          >
            <VerticalBarChart
              items={data?.charts.collectionsTrend || []}
              primaryLabel="Collected"
              formatValue={(v) => formatBDT(v)}
              emptyText="No posted money receipts in this date range."
            />
          </DashboardCard>
        </>
      }
      tables={
        <>
          <DashboardCard
            title="Candidate Installment & Dues Summary"
            subtitle="Top 5 outstanding candidate balances"
            actionHref="/accounts/dues"
          >
            {!data || data.tables.candidateDuesSummary.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No outstanding candidate dues found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-[11px] uppercase text-slate-400 border-b border-slate-100">
                    <tr>
                      <th className="py-2 pr-2">Candidate</th>
                      <th className="py-2 px-2 text-right">Total Fee</th>
                      <th className="py-2 px-2 text-right">Paid</th>
                      <th className="py-2 px-2 text-right">Due</th>
                      <th className="py-2 px-2">Next Installment</th>
                      <th className="py-2 px-2">Status</th>
                      {canWrite && <th className="py-2 pl-2 text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.tables.candidateDuesSummary.map((row) => (
                      <tr key={row.planId} className="hover:bg-slate-50/70">
                        <td className="py-2 pr-2">
                          <div className="font-medium text-slate-900">{row.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {row.studentNo} · {row.tradeName} ({row.batch})
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right text-slate-600 whitespace-nowrap">
                          {formatPaisaBDT(row.totalFeePaisa)}
                        </td>
                        <td className="py-2 px-2 text-right text-emerald-700 whitespace-nowrap">
                          {formatPaisaBDT(row.totalPaidPaisa)}
                        </td>
                        <td className="py-2 px-2 text-right font-semibold text-rose-700 whitespace-nowrap">
                          {formatPaisaBDT(row.duePaisa)}
                        </td>
                        <td className="py-2 px-2 text-slate-600 whitespace-nowrap">
                          {row.nextInstallment ? (
                            <div>
                              <div className="font-medium">{row.nextInstallment.label}</div>
                              <div className="text-[10px] text-slate-400">
                                {formatDateDMY(row.nextInstallment.dueDate)}
                              </div>
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-2 px-2">
                          <Badge variant={row.status === 'Overdue' ? 'danger' : 'warning'}>
                            {row.status}
                          </Badge>
                        </td>
                        {canWrite && (
                          <td className="py-2 pl-2 text-right whitespace-nowrap">
                            <Link
                              href={`/accounts/receipts?studentId=${row.studentId}`}
                              className="px-2 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700"
                            >
                              Collect Due
                            </Link>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="Pending Actions"
            subtitle="Disbursements, approvals, and draft vouchers"
            actionHref="/accounts/vouchers"
          >
            {!data || data.tables.pendingActions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No pending accounting approvals or disbursements.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.tables.pendingActions.map((act) => (
                  <div
                    key={act.id}
                    className="py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 truncate">{act.title}</span>
                        <Badge variant="warning">{act.count}</Badge>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{act.detail}</div>
                    </div>
                    <Link
                      href={act.href}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-semibold hover:bg-slate-800 shrink-0"
                    >
                      {act.actionLabel}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>
        </>
      }
      quickLinks={quickLinks}
    />
  );
}

