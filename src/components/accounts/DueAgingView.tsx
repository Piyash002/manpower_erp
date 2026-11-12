'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Clock,
  RefreshCw,
  Download,
  Copy,
  RotateCcw,
  Plus,
  Check,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { TableToolbar } from '@/components/ui/TableToolbar';
import { useAuth } from '@/components/layout/DashboardLayout';
import { formatPaisaBDT, paisaToTaka, takaToPaisa } from '@/lib/accounts-money';
import { formatDateDMY } from '@/lib/formatters';
import {
  downloadExcel,
  matchesSearch,
  printTableReport,
  sortTableItems,
  type SortDir,
} from '@/lib/client-export';

const REFUND_RULES = [
  { code: 'VISA_REJECTED', label: 'Visa Rejected by Embassy' },
  { code: 'MEDICAL_UNFIT', label: 'Medical / GAMCA Unfit' },
  { code: 'CANDIDATE_WITHDREW', label: 'Candidate Withdrew' },
  { code: 'PACKAGE_DOWNGRADE', label: 'Package / Country Downgrade' },
  { code: 'OVERPAYMENT', label: 'Overpayment Adjustment' },
  { code: 'OTHER', label: 'Other Approved Reason' },
] as const;

export function DueAgingView() {
  const { user } = useAuth();
  const role = user?.role || 'Viewer';
  const canAccess = ['Admin', 'Accountant', 'Viewer'].includes(role);
  const canWrite = ['Admin', 'Accountant'].includes(role);
  const isAdmin = role === 'Admin';

  const [data, setData] = useState<any | null>(null);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [allPlans, setAllPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Search / Filter / Sort
  const [search, setSearch] = useState('');
  const [bucketFilter, setBucketFilter] = useState<'all' | 'current' | '1-30' | '31-60' | '61-90' | '90+'>('all');
  const [tradeFilter, setTradeFilter] = useState('all');
  const [sortKey, setSortKey] = useState('due');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Refund / Credit Note Modal
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [savingRefund, setSavingRefund] = useState(false);
  const [refundErr, setRefundErr] = useState('');
  const [refundForm, setRefundForm] = useState({
    studentId: '',
    kind: 'CreditNote' as 'Refund' | 'CreditNote',
    refundRule: 'VISA_REJECTED',
    amountTaka: '',
    method: 'Cash',
    reference: '',
    refundDate: new Date().toISOString().split('T')[0],
    reason: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [dueRes, refRes, planRes] = await Promise.all([
        fetch('/api/accounts/dues'),
        fetch('/api/accounts/refunds'),
        fetch('/api/accounts/student-fees'),
      ]);
      const [dueJson, refJson, planJson] = await Promise.all([
        dueRes.json(),
        refRes.json(),
        planRes.json(),
      ]);
      if (dueJson.success) setData(dueJson.data);
      if (refJson.success) setRefunds(refJson.data || []);
      if (planJson.success) setAllPlans(planJson.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess]);

  const copyReminder = async (item: any) => {
    const mobile = item.student?.mobile || item.student?.phone || '';
    const dueBdt = paisaToTaka(item.totalDuePaisa || 0).toLocaleString('en-IN');
    const stage = item.openStages?.[0]?.label || 'Outstanding Fee';
    const text = `Reminder (${item.student?.student_no}): Dear ${item.student?.name}, your ${stage} balance of BDT ${dueBdt} is due (${item.maxOverdueDays}d overdue). Contact Accounts. Phone: ${mobile}`;
    await navigator.clipboard?.writeText(text);
    setBanner({ type: 'ok', msg: `Copied overdue reminder for ${item.student?.name}.` });
  };

  const openRefundModal = () => {
    setRefundErr('');
    const firstPlan = allPlans[0];
    setRefundForm({
      studentId: firstPlan ? String(firstPlan.studentId?._id || firstPlan.studentId) : '',
      kind: 'CreditNote',
      refundRule: 'VISA_REJECTED',
      amountTaka: '',
      method: 'Cash',
      reference: '',
      refundDate: new Date().toISOString().split('T')[0],
      reason: '',
    });
    setIsRefundModalOpen(true);
  };

  const handleCreateRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRefund(true);
    setRefundErr('');
    setBanner(null);
    try {
      const res = await fetch('/api/accounts/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: refundForm.studentId,
          kind: refundForm.kind,
          refundRule: refundForm.refundRule,
          amountPaisa: takaToPaisa(refundForm.amountTaka),
          method: refundForm.kind === 'Refund' ? refundForm.method : '',
          reference: refundForm.reference,
          refundDate: refundForm.refundDate,
          reason: refundForm.reason,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Request failed');
      setIsRefundModalOpen(false);
      setBanner({ type: 'ok', msg: json.message });
      loadData();
    } catch (err: any) {
      setRefundErr(err.message);
    } finally {
      setSavingRefund(false);
    }
  };

  const handleRefundDecision = async (id: string, decision: 'Approve' | 'Reject') => {
    setBanner(null);
    const res = await fetch(`/api/accounts/refunds/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setBanner({ type: 'ok', msg: json.message });
      loadData();
    } else {
      setBanner({ type: 'err', msg: json.message || 'Decision failed' });
    }
  };

  if (!canAccess) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-600">
        Your role ({role}) does not have access to Accounts.
      </div>
    );
  }

  const b = data?.buckets || {
    currentPaisa: 0,
    days1to30Paisa: 0,
    days31to60Paisa: 0,
    days61to90Paisa: 0,
    over90Paisa: 0,
  };
  const items = data?.items || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Clock className="w-6 h-6 text-emerald-700" />
            <span>Due &amp; Receivable Aging</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Outstanding student fee installments grouped by overdue aging buckets (0–30 / 31–60 / 61–90 / 90+ days).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <a
            href="/api/accounts/dues?export=csv"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </a>
          <a
            href="/api/accounts/dues?export=xlsx"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <Download className="w-3.5 h-3.5" /> Excel
          </a>
          {canWrite && (
            <button
              type="button"
              disabled={allPlans.length === 0}
              onClick={openRefundModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> New Refund / Credit Note
            </button>
          )}
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
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
          {banner.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{banner.msg}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Current (Not Due)</span>
          <p className="text-lg font-bold font-mono text-slate-900 mt-1">{formatPaisaBDT(b.currentPaisa)}</p>
        </div>
        <div className="bg-amber-50/40 p-3.5 rounded-xl border border-amber-200">
          <span className="text-[10px] font-bold text-amber-800 uppercase">1–30 Days Overdue</span>
          <p className="text-lg font-bold font-mono text-amber-800 mt-1">{formatPaisaBDT(b.days1to30Paisa)}</p>
        </div>
        <div className="bg-orange-50/40 p-3.5 rounded-xl border border-orange-200">
          <span className="text-[10px] font-bold text-orange-800 uppercase">31–60 Days Overdue</span>
          <p className="text-lg font-bold font-mono text-orange-800 mt-1">{formatPaisaBDT(b.days31to60Paisa)}</p>
        </div>
        <div className="bg-rose-50/40 p-3.5 rounded-xl border border-rose-200">
          <span className="text-[10px] font-bold text-rose-700 uppercase">61–90 Days Overdue</span>
          <p className="text-lg font-bold font-mono text-rose-700 mt-1">{formatPaisaBDT(b.days61to90Paisa)}</p>
        </div>
        <div className="bg-rose-100/50 p-3.5 rounded-xl border border-rose-300">
          <span className="text-[10px] font-bold text-rose-900 uppercase">90+ Days Overdue</span>
          <p className="text-lg font-bold font-mono text-rose-900 mt-1">{formatPaisaBDT(b.over90Paisa)}</p>
        </div>
      </div>

      {(() => {
        const tradeOptions = Array.from(
          new Set(
            items
              .map((it: any) => it.student?.trade_name || it.student?.trade)
              .filter(Boolean)
          )
        ).sort() as string[];

        const filtered = items.filter((it: any) => {
          const days = Number(it.maxOverdueDays || 0);
          if (bucketFilter === 'current' && days > 0) return false;
          if (bucketFilter === '1-30' && (days < 1 || days > 30)) return false;
          if (bucketFilter === '31-60' && (days < 31 || days > 60)) return false;
          if (bucketFilter === '61-90' && (days < 61 || days > 90)) return false;
          if (bucketFilter === '90+' && days <= 90) return false;
          const tr = it.student?.trade_name || it.student?.trade || '';
          if (tradeFilter !== 'all' && tr !== tradeFilter) return false;
          return matchesSearch(search, [
            it.student?.name,
            it.student?.student_no,
            it.student?.mobile,
            it.student?.phone,
            tr,
            it.student?.destination_country || it.student?.country_of_interest,
          ]);
        });

        const sortedItems = sortTableItems(filtered, sortKey, sortDir, {
          student: (it: any) => it.student?.name || '',
          code: (it: any) => it.student?.student_no || '',
          netPayable: (it: any) => Number(it.netPayablePaisa || 0),
          paid: (it: any) => Number(it.totalPaidPaisa || 0),
          due: (it: any) => Number(it.totalDuePaisa || 0),
          overdueDays: (it: any) => Number(it.maxOverdueDays || 0),
        });

        const headers = [
          'Student ID',
          'Student Name',
          'Phone',
          'Trade',
          'Country',
          'Net Payable (BDT)',
          'Paid (BDT)',
          'Total Due (BDT)',
          'Overdue Days',
        ];
        const rows = sortedItems.map((it: any) => [
          it.student?.student_no || '',
          it.student?.name || '',
          it.student?.mobile || it.student?.phone || '',
          it.student?.trade_name || it.student?.trade || '',
          it.student?.destination_country || it.student?.country_of_interest || '',
          paisaToTaka(it.netPayablePaisa || 0),
          paisaToTaka(it.totalPaidPaisa || 0),
          paisaToTaka(it.totalDuePaisa || 0),
          Number(it.maxOverdueDays || 0),
        ]);

        return (
          <>
            <TableToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search student name, ID, phone, trade, country..."
              filters={
                <>
                  <select
                    value={bucketFilter}
                    onChange={(e) => setBucketFilter(e.target.value as any)}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
                  >
                    <option value="all">All Aging Buckets</option>
                    <option value="current">Current (Not Overdue)</option>
                    <option value="1-30">1–30 Days Overdue</option>
                    <option value="31-60">31–60 Days Overdue</option>
                    <option value="61-90">61–90 Days Overdue</option>
                    <option value="90+">90+ Days Overdue</option>
                  </select>
                  <select
                    value={tradeFilter}
                    onChange={(e) => setTradeFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
                  >
                    <option value="all">All Trades</option>
                    {tradeOptions.map((tr) => (
                      <option key={tr} value={tr}>
                        {tr}
                      </option>
                    ))}
                  </select>
                </>
              }
              sortKey={sortKey}
              sortDir={sortDir}
              sortOptions={[
                { value: 'due', label: 'Total Due' },
                { value: 'overdueDays', label: 'Overdue Days' },
                { value: 'netPayable', label: 'Net Payable' },
                { value: 'paid', label: 'Total Paid' },
                { value: 'student', label: 'Student Name' },
                { value: 'code', label: 'Student ID' },
              ]}
              onSortChange={(k, d) => {
                setSortKey(k);
                setSortDir(d);
              }}
              totalCount={items.length}
              filteredCount={sortedItems.length}
              hasActiveFilters={bucketFilter !== 'all' || tradeFilter !== 'all'}
              onReset={() => {
                setSearch('');
                setBucketFilter('all');
                setTradeFilter('all');
              }}
              onExportExcel={() =>
                downloadExcel({
                  filename: 'student-due-aging-filtered',
                  sheetName: 'Due Aging',
                  headers,
                  rows,
                })
              }
              onPrint={() =>
                printTableReport({
                  title: 'Due & Receivable Aging Report',
                  subtitle: 'Outstanding Student Installments',
                  meta: `Aging: ${bucketFilter} | Trade: ${tradeFilter}`,
                  headers,
                  rows,
                  rightAlignCols: [5, 6, 7, 8],
                  landscape: true,
                })
              }
            />

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Trade &amp; Country</th>
                <th className="px-4 py-3 text-right">Net Payable</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Total Due</th>
                <th className="px-4 py-3 text-center">Overdue Age</th>
                <th className="px-4 py-3 text-right">Collect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Calculating aging buckets...
                  </td>
                </tr>
              ) : sortedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No matching overdue or outstanding student receivables.
                  </td>
                </tr>
              ) : (
                sortedItems.map((item: any) => (
                  <tr key={item._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-slate-900 block">
                        {item.student?.name}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {item.student?.student_no} · {item.student?.mobile || item.student?.phone || ''}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {item.student?.trade_name || item.student?.trade} ·{' '}
                      {item.student?.destination_country || item.student?.country_of_interest}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {formatPaisaBDT(item.netPayablePaisa)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-emerald-700">
                      {formatPaisaBDT(item.totalPaidPaisa)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-rose-700">
                      {formatPaisaBDT(item.totalDuePaisa)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {item.maxOverdueDays > 0 ? (
                        <Badge variant="danger">{item.maxOverdueDays}d overdue</Badge>
                      ) : (
                        <Badge variant="info">Current</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => copyReminder(item)}
                          title="Copy Due Reminder Text"
                          className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <Link
                          href={`/accounts/receipts?studentId=${item.student?._id || ''}`}
                          className="px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-600 rounded hover:bg-emerald-700"
                        >
                          Receive
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
          </>
        );
      })()}

      {/* REFUNDS & CREDIT NOTES DESK */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-amber-700" />
            <h2 className="text-sm font-bold text-slate-800">
              Refunds &amp; Credit Notes (Admin Approval Posts Ledger)
            </h2>
          </div>
          <span className="text-[11px] text-slate-500">{refunds.length} requests</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">Ref / Voucher</th>
                <th className="px-4 py-2.5">Student</th>
                <th className="px-4 py-2.5">Kind &amp; Rule</th>
                <th className="px-4 py-2.5">Reason &amp; Date</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                {isAdmin && <th className="px-4 py-2.5 text-right">Approval</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {refunds.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-4 py-6 text-center text-slate-400">
                    No refund or credit note requests recorded.
                  </td>
                </tr>
              ) : (
                refunds.map((rf) => (
                  <tr key={rf._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-mono">
                      <span className="font-bold text-slate-900 block">{rf.refundNo}</span>
                      <span className="text-[10px] text-blue-700">
                        {rf.journalEntryId?.voucherNo || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-slate-900 block">
                        {rf.studentId?.name || 'Student'}
                      </span>
                      <span className="text-[11px] text-slate-400">{rf.studentId?.student_no}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={rf.kind === 'CreditNote' ? 'info' : 'warning'}>{rf.kind}</Badge>
                      <span className="block text-[10px] text-slate-500 mt-0.5">{rf.refundRule}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      <p className="text-slate-800">{rf.reason}</p>
                      <span className="text-[10px] text-slate-400">{formatDateDMY(rf.refundDate)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                      {formatPaisaBDT(rf.amountPaisa)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <StatusBadge status={rf.status} />
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {rf.status === 'Pending' && (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleRefundDecision(rf._id, 'Approve')}
                              title="Approve & Post to Ledger"
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded"
                            >
                              <Check className="w-3 h-3" /> Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRefundDecision(rf._id, 'Reject')}
                              title="Reject Request"
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded"
                            >
                              <X className="w-3 h-3" /> Reject
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Refund / Credit Note Modal */}
      <Modal
        isOpen={isRefundModalOpen}
        onClose={() => setIsRefundModalOpen(false)}
        title="New Fee Refund or Credit Note Request"
        maxWidth="md"
      >
        <form onSubmit={handleCreateRefund} className="space-y-4 text-xs">
          {refundErr && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
              {refundErr}
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Student Fee Plan *</label>
            <select
              required
              value={refundForm.studentId}
              onChange={(e) => setRefundForm({ ...refundForm, studentId: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            >
              {allPlans.map((p) => {
                const sid = p.studentId?._id || p.studentId;
                return (
                  <option key={p._id} value={sid}>
                    {p.studentNo} — {p.studentId?.name} (Paid: {formatPaisaBDT(p.totalPaidPaisa)}, Due:{' '}
                    {formatPaisaBDT(p.totalDuePaisa)})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Type *</label>
              <select
                value={refundForm.kind}
                onChange={(e) => setRefundForm({ ...refundForm, kind: e.target.value as any })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="CreditNote">Credit Note (Reduce Due)</option>
                <option value="Refund">Cash/Bank Refund Payout</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Rule *</label>
              <select
                value={refundForm.refundRule}
                onChange={(e) => setRefundForm({ ...refundForm, refundRule: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {REFUND_RULES.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Amount (BDT) *</label>
              <input
                type="number"
                min={1}
                step="0.01"
                required
                value={refundForm.amountTaka}
                onChange={(e) => setRefundForm({ ...refundForm, amountTaka: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Date *</label>
              <input
                type="date"
                required
                value={refundForm.refundDate}
                onChange={(e) => setRefundForm({ ...refundForm, refundDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {refundForm.kind === 'Refund' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Payout Method *</label>
                <select
                  value={refundForm.method}
                  onChange={(e) => setRefundForm({ ...refundForm, method: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  <option value="Cash">Cash</option>
                  <option value="bKash">bKash</option>
                  <option value="Nagad">Nagad</option>
                  <option value="Bank transfer">Bank transfer</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Reference</label>
                <input
                  type="text"
                  value={refundForm.reference}
                  onChange={(e) => setRefundForm({ ...refundForm, reference: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Detailed Reason *</label>
            <input
              type="text"
              required
              minLength={3}
              value={refundForm.reason}
              onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })}
              placeholder="e.g. Embassy rejection letter ref #..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsRefundModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingRefund}
              className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg"
            >
              {savingRefund ? 'Submitting...' : 'Submit for Admin Approval'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

