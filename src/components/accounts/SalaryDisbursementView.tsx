'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Wallet,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Send,
  FileSpreadsheet,
  ShieldCheck,
  Building2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Download,
  ExternalLink,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { TableToolbar } from '@/components/ui/TableToolbar';
import { useAuth } from '@/components/layout/DashboardLayout';
import { formatBDT, formatDateDMY } from '@/lib/formatters';
import {
  downloadExcel,
  matchesSearch,
  printTableReport,
  sortTableItems,
  type SortDir,
} from '@/lib/client-export';

interface RecipientRow {
  payslipId: string;
  payslipNo: string;
  employeeObjId: string;
  employeeCode: string;
  name: string;
  department: string;
  method: string;
  bankName: string;
  bankBranch: string;
  accountNo: string;
  phone: string;
  netPay: number;
  status: string;
  paymentReference?: string;
}

function RecipientAccountTable({
  recipients,
  copiedKey,
  onCopy,
  canEditEmployee,
  compact = false,
}: {
  recipients: RecipientRow[];
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void;
  canEditEmployee: boolean;
  compact?: boolean;
}) {
  if (!recipients || recipients.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-slate-400">
        No employee payslips found in this payroll run.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-100/80 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase">
          <tr>
            <th className={compact ? 'px-3 py-2' : 'px-4 py-2'}>Employee</th>
            <th className={compact ? 'px-3 py-2' : 'px-4 py-2'}>Method</th>
            <th className={compact ? 'px-3 py-2' : 'px-4 py-2'}>Bank / Wallet &amp; Branch</th>
            <th className={compact ? 'px-3 py-2' : 'px-4 py-2'}>Account / Wallet No</th>
            <th className={`${compact ? 'px-3 py-2' : 'px-4 py-2'} text-right`}>Net Salary</th>
            <th className={`${compact ? 'px-3 py-2' : 'px-4 py-2'} text-center`}>Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {recipients.map((rec) => {
            const copyId = `${compact ? 'modal' : 'row'}-${rec.payslipId}`;
            const isMissingAcc = rec.method !== 'Cash' && !rec.accountNo;
            return (
              <tr key={rec.payslipId} className="hover:bg-slate-50/70">
                <td className={compact ? 'px-3 py-2' : 'px-4 py-2.5'}>
                  <div className="font-semibold text-slate-900">{rec.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {rec.employeeCode}
                    {rec.department ? ` · ${rec.department}` : ''} · {rec.payslipNo}
                  </div>
                </td>
                <td className={compact ? 'px-3 py-2' : 'px-4 py-2.5'}>
                  <Badge variant={rec.method === 'Bank' ? 'info' : 'gray'}>{rec.method}</Badge>
                </td>
                <td className={compact ? 'px-3 py-2' : 'px-4 py-2.5'}>
                  {rec.method === 'Cash' ? (
                    <span className="text-slate-500">Cash in Hand</span>
                  ) : rec.bankName ? (
                    <div>
                      <span className="font-medium text-slate-800">{rec.bankName}</span>
                      {rec.bankBranch && (
                        <span className="block text-[10px] text-slate-500">{rec.bankBranch}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-amber-700">Bank not set</span>
                  )}
                </td>
                <td className={compact ? 'px-3 py-2' : 'px-4 py-2.5'}>
                  {rec.method === 'Cash' ? (
                    <span className="text-[11px] text-slate-400">—</span>
                  ) : rec.accountNo ? (
                    <div className="inline-flex items-center gap-1.5">
                      <span className="font-mono font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {rec.accountNo}
                      </span>
                      <button
                        type="button"
                        onClick={() => onCopy(copyId, rec.accountNo)}
                        title="Copy account number"
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded border border-slate-200"
                      >
                        {copiedKey === copyId ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" /> Copy
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                        <AlertTriangle className="w-3 h-3" /> Missing Bank A/C
                      </span>
                      {canEditEmployee && rec.employeeObjId && (
                        <Link
                          href={`/hrm/employees/${rec.employeeObjId}/edit`}
                          className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 hover:underline"
                        >
                          Add A/C <ExternalLink className="w-2.5 h-2.5" />
                        </Link>
                      )}
                    </div>
                  )}
                  {isMissingAcc && rec.phone && (
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      Phone: {rec.phone}
                    </span>
                  )}
                </td>
                <td className={`${compact ? 'px-3 py-2' : 'px-4 py-2.5'} text-right font-mono font-bold text-slate-900`}>
                  {formatBDT(rec.netPay)}
                </td>
                <td className={`${compact ? 'px-3 py-2' : 'px-4 py-2.5'} text-center`}>
                  <Badge variant={rec.status === 'Paid' ? 'success' : 'info'}>{rec.status}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SalaryDisbursementView() {
  const { user } = useAuth();
  const role = user?.role || 'Viewer';
  const canAccess = ['Admin', 'Accountant', 'Viewer', 'HR'].includes(role);
  const canWrite = ['Admin', 'Accountant'].includes(role);
  const canEditEmployee = ['Admin', 'HR'].includes(role);

  const [runs, setRuns] = useState<any[]>([]);
  const [payoutAccounts, setPayoutAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Search / Filter / Sort state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Confirmed' | 'Paid'>('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [sortKey, setSortKey] = useState('period');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [disburseRun, setDisburseRun] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState('');
  const [form, setForm] = useState({
    method: 'Bank' as 'Bank' | 'bKash' | 'Nagad' | 'Cash',
    payoutAccountId: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentReference: '',
    note: '',
  });

  const handleCopy = (key: string, value: string) => {
    if (!value) return;
    navigator.clipboard?.writeText(value);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1500);
  };

  const loadRuns = async () => {
    setLoading(true);
    try {
      const [runsRes, coaRes] = await Promise.all([
        fetch('/api/accounts/payroll-disbursements'),
        fetch('/api/accounts/coa?leafOnly=true'),
      ]);
      const runsJson = await runsRes.json();
      if (runsJson.success) {
        const list = runsJson.data || [];
        setRuns(list);
        // Auto-expand first awaiting run so employee bank accounts are immediately visible
        setExpandedRunId((prev) => {
          if (prev) return prev;
          const pending = list.find((r: any) => r.status === 'Confirmed');
          return pending?._id || null;
        });
      }
      const coaJson = await coaRes.json();
      if (coaJson.success) {
        const cashBank = (coaJson.data || []).filter(
          (a: any) => a.type === 'Asset' && String(a.code || '').startsWith('11')
        );
        setPayoutAccounts(cashBank);
      }
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
          payoutAccountId: form.payoutAccountId || undefined,
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

      {/* How Salary Payout Works — Simple 3-Step Guide */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs">
        <div className="font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-emerald-700" />
          <span>How Employee Bank Salary Payout Works (3 Simple Steps)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px] text-slate-600">
          <div className="bg-white border border-slate-200/80 rounded-lg p-2.5">
            <span className="font-bold text-slate-900 block mb-0.5">1. HRM Confirms Payroll (JV)</span>
            HRM confirms monthly salary run. Accounts automatically records <span className="font-mono text-slate-800">5210 Expense Dr / 2110 Payable Cr</span>.
          </div>
          <div className="bg-white border border-slate-200/80 rounded-lg p-2.5">
            <span className="font-bold text-slate-900 block mb-0.5">2. Verify Bank A/C &amp; Transfer (BEFTN)</span>
            Click <strong>Bank A/C</strong> to copy each employee&apos;s Bank/bKash number or download the <strong>Excel (BEFTN)</strong> sheet to pay from your bank.
          </div>
          <div className="bg-white border border-slate-200/80 rounded-lg p-2.5">
            <span className="font-bold text-slate-900 block mb-0.5">3. Click Disburse (PV)</span>
            Enter Bank Advice / BEFTN Reference &amp; pick Company Bank/Cash COA. Accounts posts <strong>PV</strong> and marks all HRM payslips <strong>Paid</strong>.
          </div>
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

      {(() => {
        const branches = Array.from(new Set(runs.map((r) => r.branch || 'Main'))).sort();
        const filtered = runs.filter((r) => {
          if (statusFilter !== 'all' && r.status !== statusFilter) return false;
          if (branchFilter !== 'all' && (r.branch || 'Main') !== branchFilter) return false;
          const recText = (r.recipients || [])
            .map((rec: any) => `${rec.name} ${rec.employeeCode} ${rec.accountNo} ${rec.bankName}`)
            .join(' ');
          const voucherText = (r.journalEntries || []).map((je: any) => je.voucherNo).join(' ');
          return matchesSearch(search, [
            r.batch_code,
            r.name,
            r.branch,
            r.payment_method,
            r.payment_reference,
            recText,
            voucherText,
          ]);
        });
        const sortedRuns = sortTableItems(filtered, sortKey, sortDir, {
          period: (r) => (Number(r.year || 0) * 100) + Number(r.month || 0),
          code: (r) => r.batch_code || '',
          name: (r) => r.name || '',
          employees: (r) => Number(r.payslip_count || 0),
          gross: (r) => Number(r.total_gross_pay || 0),
          net: (r) => Number(r.total_net_pay || 0),
          status: (r) => r.status || '',
        });

        const exportRows = () =>
          sortedRuns.map((r) => [
            r.batch_code,
            r.name,
            r.branch || 'Main',
            Number(r.payslip_count || 0),
            Number(r.total_gross_pay || 0),
            Number(r.total_net_pay || 0),
            r.status,
            r.payment_method || '',
            r.payment_reference || '',
            r.payment_date ? formatDateDMY(r.payment_date) : '',
            (r.journalEntries || []).map((j: any) => j.voucherNo).join(', '),
          ]);

        const headers = [
          'Run Code',
          'Run Name',
          'Branch',
          'Employees',
          'Gross Pay (BDT)',
          'Net Payable (BDT)',
          'Status',
          'Payout Method',
          'Reference',
          'Paid Date',
          'Accounts Vouchers',
        ];

        return (
          <>
            <TableToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search run code, employee, bank A/C, ref, voucher..."
              filters={
                <>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
                  >
                    <option value="all">All Status</option>
                    <option value="Confirmed">Awaiting Pay (Confirmed)</option>
                    <option value="Paid">Paid</option>
                  </select>
                  <select
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
                  >
                    <option value="all">All Branches</option>
                    {branches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </>
              }
              sortKey={sortKey}
              sortDir={sortDir}
              sortOptions={[
                { value: 'period', label: 'Payroll Month' },
                { value: 'code', label: 'Run Code' },
                { value: 'name', label: 'Run Name' },
                { value: 'employees', label: 'Employees' },
                { value: 'gross', label: 'Gross Pay' },
                { value: 'net', label: 'Net Payable' },
                { value: 'status', label: 'Status' },
              ]}
              onSortChange={(k, d) => {
                setSortKey(k);
                setSortDir(d);
              }}
              totalCount={runs.length}
              filteredCount={sortedRuns.length}
              hasActiveFilters={statusFilter !== 'all' || branchFilter !== 'all'}
              onReset={() => {
                setSearch('');
                setStatusFilter('all');
                setBranchFilter('all');
              }}
              onExportExcel={() =>
                downloadExcel({
                  filename: 'salary-disbursements',
                  sheetName: 'Salary Disbursement',
                  headers,
                  rows: exportRows(),
                })
              }
              onPrint={() =>
                printTableReport({
                  title: 'Salary Disbursement Register',
                  subtitle: 'HRM Payroll Runs & Accounts Payment Vouchers',
                  meta: `Status: ${statusFilter} | Branch: ${branchFilter}`,
                  headers,
                  rows: exportRows(),
                  rightAlignCols: [3, 4, 5],
                  landscape: true,
                })
              }
            />

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
              ) : sortedRuns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No matching Confirmed or Paid payroll runs found.
                  </td>
                </tr>
              ) : (
                sortedRuns.map((r) => {
                  const hasAccrual = (r.journalEntries || []).some(
                    (je: any) => je.sourceModule === 'PAYROLL_CONFIRM' && je.status === 'Posted'
                  );
                  const isExpanded = expandedRunId === r._id;
                  const recipients: RecipientRow[] = r.recipients || [];
                  const missingCount = Number(r.missingBankCount || 0);
                  return (
                    <React.Fragment key={r._id}>
                      <tr className="hover:bg-slate-50/70">
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
                        <td className="px-4 py-3 text-center">
                          <span className="font-mono font-semibold">{r.payslip_count}</span>
                          {missingCount > 0 && (
                            <span
                              title="Some employees do not have a bank/wallet account number saved in HRM"
                              className="block text-[10px] font-semibold text-amber-700 mt-0.5"
                            >
                              {missingCount} missing A/C
                            </span>
                          )}
                        </td>
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
                            <button
                              type="button"
                              onClick={() => setExpandedRunId(isExpanded ? null : r._id)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded border ${
                                isExpanded
                                  ? 'bg-slate-800 text-white border-slate-800'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              <Building2 className="w-3 h-3" />
                              Bank A/C ({recipients.length || r.payslip_count})
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
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
                                    payoutAccountId: '',
                                    paymentDate: new Date().toISOString().split('T')[0],
                                    paymentReference: `BEFTN-${r.batch_code}`,
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
                              <>
                                <a
                                  href={`/api/payroll/batches/${r._id}?export=bank_xlsx`}
                                  title="Download BEFTN Bank Transfer Excel"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded hover:bg-slate-200"
                                >
                                  <FileSpreadsheet className="w-3 h-3" /> Excel
                                </a>
                                <a
                                  href={`/api/payroll/batches/${r._id}?export=bank_csv`}
                                  title="Download Bank Transfer CSV"
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded hover:bg-slate-200"
                                >
                                  <Download className="w-3 h-3" /> CSV
                                </a>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={8} className="p-0 border-t border-slate-200">
                            <div className="px-4 py-2.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                              <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-emerald-700" />
                                <span>
                                  Employee Bank &amp; Payout Account Sheet — {r.batch_code} ({recipients.length} employees)
                                </span>
                              </div>
                              {missingCount > 0 && (
                                <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-medium">
                                  {missingCount} employee(s) missing Bank A/C — click &quot;Add A/C&quot; to update in HRM
                                </span>
                              )}
                            </div>
                            <RecipientAccountTable
                              recipients={recipients}
                              copiedKey={copiedKey}
                              onCopy={handleCopy}
                              canEditEmployee={canEditEmployee}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
          </>
        );
      })()}

      {/* Disburse Salary Modal */}
      <Modal
        isOpen={Boolean(disburseRun)}
        onClose={() => setDisburseRun(null)}
        title={`Disburse Payroll — ${disburseRun?.batch_code || ''}`}
        maxWidth="4xl"
      >
        {disburseRun && (
          <form onSubmit={handleDisburse} className="space-y-4 text-xs">
            {modalErr && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
                {modalErr}
              </div>
            )}

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] text-slate-500">Payroll Run</div>
                <div className="font-bold text-slate-900 text-sm">
                  {disburseRun.name} ({disburseRun.payslip_count} employees)
                </div>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`/api/payroll/batches/${disburseRun._id}?export=bank_xlsx`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" /> Download Bank Excel (BEFTN)
                </a>
                <div className="text-right">
                  <div className="text-[11px] text-slate-500">Total Payable (2110 Dr)</div>
                  <div className="font-mono font-bold text-emerald-700 text-base">
                    {formatBDT(disburseRun.total_net_pay)}
                  </div>
                </div>
              </div>
            </div>

            {Number(disburseRun.missingBankCount || 0) > 0 && form.method !== 'Cash' && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  {disburseRun.missingBankCount} employee(s) do not have a Bank / Wallet account number saved yet. Check the table below before transferring via bank.
                </span>
              </div>
            )}

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 font-semibold text-slate-700 flex items-center justify-between">
                <span>Employee Bank &amp; Account Numbers in this Run</span>
                <span className="text-[11px] font-normal text-slate-500">
                  Copy individual account numbers or use Download Bank Excel above
                </span>
              </div>
              <div className="max-h-56 overflow-y-auto">
                <RecipientAccountTable
                  recipients={disburseRun.recipients || []}
                  copiedKey={copiedKey}
                  onCopy={handleCopy}
                  canEditEmployee={canEditEmployee}
                  compact
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <label className="block font-semibold text-slate-700 mb-1">
                  Company Source Bank / Cash Ledger
                </label>
                <select
                  value={form.payoutAccountId}
                  onChange={(e) => setForm({ ...form, payoutAccountId: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  <option value="">Auto — matches selected Method</option>
                  {payoutAccounts.map((acc) => (
                    <option key={acc._id} value={acc._id}>
                      {acc.code} — {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Bank Advice / BEFTN Reference *
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
