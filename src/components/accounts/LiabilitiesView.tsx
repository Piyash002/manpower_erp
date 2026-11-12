'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  CreditCard,
  Plus,
  RefreshCw,
  DollarSign,
  Eye,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { TableToolbar } from '@/components/ui/TableToolbar';
import { DocumentUploadField } from '@/components/accounts/DocumentUploadField';
import { useAuth } from '@/components/layout/DashboardLayout';
import { formatDateDMY } from '@/lib/formatters';
import { formatPaisaBDT, paisaToTaka, takaToPaisa } from '@/lib/accounts-money';
import {
  downloadExcel,
  matchesSearch,
  printTableReport,
  sortTableItems,
  type SortDir,
} from '@/lib/client-export';

interface BillRow {
  _id: string;
  billNo: string;
  vendorName: string;
  billDate: string;
  dueDate: string;
  description: string;
  totalPaisa: number;
  paidPaisa: number;
  duePaisa: number;
  status: 'Open' | 'PartiallyPaid' | 'Paid' | 'Reversed';
  kind: 'Expense' | 'AssetPurchase';
  attachmentUrl?: string;
}

interface BillPaymentRow {
  _id: string;
  paymentNo: string;
  paymentDate: string;
  amountPaisa: number;
  method: string;
  reference: string;
  attachmentUrl?: string;
  status: 'Posted' | 'Reversed';
}

interface AgingData {
  buckets: {
    currentPaisa: number;
    days0to30Paisa: number;
    days31to60Paisa: number;
    days61to90Paisa: number;
    days90PlusPaisa: number;
    totalDuePaisa: number;
  };
  glPayableBalancePaisa: number;
  rows: Array<BillRow & { overdueDays: number; bucket: string }>;
}

interface LoanRow {
  _id: string;
  loanNo: string;
  lenderName: string;
  loanType: 'Bank' | 'Other';
  principalPaisa: number;
  outstandingPaisa: number;
  receivedDate: string;
  depositMethod: string;
  interestNote: string;
  attachmentUrl?: string;
  status: string;
}

export function LiabilitiesView() {
  const { user } = useAuth();
  const role = user?.role || 'Viewer';
  const canWrite = role === 'Admin' || role === 'Accountant';
  const isAdmin = role === 'Admin';

  const [tab, setTab] = useState<'bills' | 'aging' | 'loans'>('bills');
  const [bills, setBills] = useState<BillRow[]>([]);
  const [aging, setAging] = useState<AgingData | null>(null);
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortKey, setSortKey] = useState('billDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Create Bill Modal
  const [showAddBill, setShowAddBill] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [billForm, setBillForm] = useState({
    vendorName: '',
    billDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    description: '',
    expenseAccountCode: '5299',
    totalTaka: '',
    attachmentUrl: '',
  });

  // Pay Bill Modal
  const [payTarget, setPayTarget] = useState<BillRow | null>(null);
  const [payForm, setPayForm] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    amountTaka: '',
    method: 'Bank',
    reference: '',
    attachmentUrl: '',
  });

  // View Payments Modal
  const [detailBill, setDetailBill] = useState<BillRow | null>(null);
  const [detailPayments, setDetailPayments] = useState<BillPaymentRow[]>([]);

  // Add Loan Modal
  const [showAddLoan, setShowAddLoan] = useState(false);
  const [loanForm, setLoanForm] = useState({
    lenderName: '',
    loanType: 'Bank' as 'Bank' | 'Other',
    principalTaka: '',
    receivedDate: new Date().toISOString().slice(0, 10),
    depositMethod: 'Bank',
    interestNote: '',
    attachmentUrl: '',
  });

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [bRes, aRes, lRes] = await Promise.all([
        fetch('/api/accounts/vendor-bills'),
        fetch('/api/accounts/reports/payables-aging'),
        fetch('/api/accounts/loans'),
      ]);
      const [bJson, aJson, lJson] = await Promise.all([bRes.json(), aRes.json(), lRes.json()]);
      if (!bJson.success) throw new Error(bJson.message || 'Failed to load vendor bills');
      setBills(bJson.data || []);
      if (aJson.success) setAging(aJson.data);
      if (lJson.success) setLoans(lJson.data || []);
    } catch (err: any) {
      setError(err?.message || 'Error loading liabilities');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const filteredBills = useMemo(() => {
    const list = bills.filter((b) => {
      if (statusFilter !== 'All' && b.status !== statusFilter) return false;
      return matchesSearch(search, [b.billNo, b.vendorName, b.description, b.kind]);
    });
    return sortTableItems(list, sortKey, sortDir, {
      billDate: (b) => b.billDate,
      dueDate: (b) => b.dueDate,
      duePaisa: (b) => b.duePaisa,
      billNo: (b) => b.billNo,
    });
  }, [bills, search, statusFilter, sortKey, sortDir]);

  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/accounts/vendor-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorName: billForm.vendorName,
          billDate: billForm.billDate,
          dueDate: billForm.dueDate,
          description: billForm.description,
          expenseAccountCode: billForm.expenseAccountCode,
          totalPaisa: takaToPaisa(Number(billForm.totalTaka || 0)),
          attachmentUrl: billForm.attachmentUrl || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to create bill');
      setShowAddBill(false);
      setBillForm({
        vendorName: '',
        billDate: new Date().toISOString().slice(0, 10),
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        description: '',
        expenseAccountCode: '5299',
        totalTaka: '',
        attachmentUrl: '',
      });
      setMessage('Vendor bill created and accrued to 2130 Payable.');
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to create bill');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/accounts/vendor-bills/${payTarget._id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentDate: payForm.paymentDate,
          amountPaisa: takaToPaisa(Number(payForm.amountTaka || 0)),
          method: payForm.method,
          reference: payForm.reference,
          attachmentUrl: payForm.attachmentUrl || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Payment failed');
      setPayTarget(null);
      setPayForm({
        paymentDate: new Date().toISOString().slice(0, 10),
        amountTaka: '',
        method: 'Bank',
        reference: '',
        attachmentUrl: '',
      });
      setMessage('Bill payment posted (PV) and payable balance updated.');
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const openBillDetail = async (bill: BillRow) => {
    setDetailBill(bill);
    setDetailPayments([]);
    try {
      const res = await fetch(`/api/accounts/vendor-bills/${bill._id}`);
      const json = await res.json();
      if (json.success) setDetailPayments(json.data.payments || []);
    } catch {
      // ignore
    }
  };

  const handleReversePayment = async (paymentId: string) => {
    if (!detailBill) return;
    const reason = window.prompt('Enter reason for reversing this payment (min 3 chars):');
    if (!reason || reason.trim().length < 3) return;
    setError('');
    try {
      const res = await fetch(`/api/accounts/vendor-bills/${detailBill._id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reverse', paymentId, reason }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to reverse payment');
      setMessage('Bill payment reversed.');
      await loadAll();
      await openBillDetail(detailBill);
    } catch (err: any) {
      setError(err?.message || 'Failed to reverse payment');
    }
  };

  const handleCreateLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/accounts/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lenderName: loanForm.lenderName,
          loanType: loanForm.loanType,
          principalPaisa: takaToPaisa(Number(loanForm.principalTaka || 0)),
          receivedDate: loanForm.receivedDate,
          depositMethod: loanForm.depositMethod,
          interestNote: loanForm.interestNote,
          attachmentUrl: loanForm.attachmentUrl || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to record loan');
      setShowAddLoan(false);
      setLoanForm({
        lenderName: '',
        loanType: 'Bank',
        principalTaka: '',
        receivedDate: new Date().toISOString().slice(0, 10),
        depositMethod: 'Bank',
        interestNote: '',
        attachmentUrl: '',
      });
      setMessage('Loan recorded and receipt voucher posted.');
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to record loan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportBills = async () => {
    await downloadExcel({
      filename: 'vendor-bills-payables',
      sheetName: 'Vendor Bills',
      headers: [
        'Bill No',
        'Vendor',
        'Kind',
        'Bill Date',
        'Due Date',
        'Total (BDT)',
        'Paid (BDT)',
        'Due (BDT)',
        'Status',
      ],
      rows: filteredBills.map((b) => [
        b.billNo,
        b.vendorName,
        b.kind,
        formatDateDMY(b.billDate),
        formatDateDMY(b.dueDate),
        paisaToTaka(b.totalPaisa),
        paisaToTaka(b.paidPaisa),
        paisaToTaka(b.duePaisa),
        b.status,
      ]),
    });
  };

  const handlePrintBills = () => {
    printTableReport({
      title: 'Vendor Bills & Payables',
      subtitle: 'CodeZenX ERP — Accounts Module',
      headers: ['Bill No', 'Vendor', 'Bill Date', 'Due Date', 'Total', 'Paid', 'Due', 'Status'],
      rows: filteredBills.map((b) => [
        b.billNo,
        b.vendorName,
        formatDateDMY(b.billDate),
        formatDateDMY(b.dueDate),
        formatPaisaBDT(b.totalPaisa),
        formatPaisaBDT(b.paidPaisa),
        formatPaisaBDT(b.duePaisa),
        b.status,
      ]),
      rightAlignCols: [4, 5, 6],
      landscape: true,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            Liabilities, Vendor Bills & Loans
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Track unpaid vendor bills (2130), settle payments, monitor payables aging, and record loans (2310/2320).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {canWrite && tab === 'loans' && (
            <button
              onClick={() => setShowAddLoan(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Plus className="w-3.5 h-3.5" /> Record Loan
            </button>
          )}
          {canWrite && tab !== 'loans' && (
            <button
              onClick={() => setShowAddBill(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Plus className="w-3.5 h-3.5" /> New Vendor Bill
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        {[
          { key: 'bills', label: `Vendor Bills (${bills.length})` },
          { key: 'aging', label: 'Payables Aging' },
          { key: 'loans', label: `Loans & Borrowings (${loans.length})` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as 'bills' | 'aging' | 'loans')}
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

      {tab === 'bills' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <TableToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search bill no, vendor, description..."
            totalCount={bills.length}
            filteredCount={filteredBills.length}
            sortKey={sortKey}
            sortDir={sortDir}
            sortOptions={[
              { value: 'billDate', label: 'Bill Date' },
              { value: 'dueDate', label: 'Due Date' },
              { value: 'duePaisa', label: 'Due Amount' },
              { value: 'billNo', label: 'Bill No' },
            ]}
            onSortChange={(k, d) => {
              setSortKey(k);
              setSortDir(d);
            }}
            hasActiveFilters={statusFilter !== 'All' || Boolean(search)}
            onReset={() => {
              setSearch('');
              setStatusFilter('All');
            }}
            onExportExcel={handleExportBills}
            onPrint={handlePrintBills}
            filters={
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
              >
                <option value="All">All Status</option>
                <option value="Open">Open</option>
                <option value="PartiallyPaid">PartiallyPaid</option>
                <option value="Paid">Paid</option>
                <option value="Reversed">Reversed</option>
              </select>
            }
          />

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                  <th className="py-2.5 px-2">Bill No</th>
                  <th className="py-2.5 px-2">Vendor & Description</th>
                  <th className="py-2.5 px-2">Bill Date</th>
                  <th className="py-2.5 px-2">Due Date</th>
                  <th className="py-2.5 px-2 text-right">Total</th>
                  <th className="py-2.5 px-2 text-right">Paid</th>
                  <th className="py-2.5 px-2 text-right">Due</th>
                  <th className="py-2.5 px-2">Status</th>
                  <th className="py-2.5 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      Loading vendor bills...
                    </td>
                  </tr>
                ) : filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      No vendor bills found.
                    </td>
                  </tr>
                ) : (
                  filteredBills.map((b) => (
                    <tr key={b._id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-2 font-mono font-semibold text-slate-800">
                        {b.billNo}
                        <div className="text-[10px] font-normal text-slate-400">{b.kind}</div>
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="font-medium text-slate-900">{b.vendorName}</div>
                        <div className="text-[11px] text-slate-500">
                          {b.description}
                          {b.attachmentUrl && (
                            <>
                              {' · '}
                              <a
                                href={b.attachmentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:underline font-medium"
                              >
                                Doc ↗
                              </a>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-slate-600">{formatDateDMY(b.billDate)}</td>
                      <td className="py-2.5 px-2 text-slate-600">{formatDateDMY(b.dueDate)}</td>
                      <td className="py-2.5 px-2 text-right font-medium">
                        {formatPaisaBDT(b.totalPaisa)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-emerald-700">
                        {formatPaisaBDT(b.paidPaisa)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold text-rose-700">
                        {formatPaisaBDT(b.duePaisa)}
                      </td>
                      <td className="py-2.5 px-2">
                        <Badge
                          variant={
                            b.status === 'Paid'
                              ? 'success'
                              : b.status === 'PartiallyPaid'
                              ? 'info'
                              : b.status === 'Open'
                              ? 'warning'
                              : 'danger'
                          }
                        >
                          {b.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-2 text-right space-x-1">
                        <button
                          onClick={() => openBillDetail(b)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="w-3 h-3" /> History
                        </button>
                        {canWrite && b.duePaisa > 0 && b.status !== 'Reversed' && (
                          <button
                            onClick={() => {
                              setPayTarget(b);
                              setPayForm({
                                paymentDate: new Date().toISOString().slice(0, 10),
                                amountTaka: String(paisaToTaka(b.duePaisa)),
                                method: 'Bank',
                                reference: '',
                                attachmentUrl: '',
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            <DollarSign className="w-3 h-3" /> Pay
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'aging' && aging && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            {[
              { label: 'Current', val: aging.buckets.currentPaisa },
              { label: '1–30 Days', val: aging.buckets.days0to30Paisa },
              { label: '31–60 Days', val: aging.buckets.days31to60Paisa },
              { label: '61–90 Days', val: aging.buckets.days61to90Paisa },
              { label: '90+ Days', val: aging.buckets.days90PlusPaisa },
              { label: 'GL 2130 Balance', val: aging.glPayableBalancePaisa },
            ].map((b) => (
              <div key={b.label} className="bg-white border border-slate-200 rounded-xl p-3">
                <div className="text-[11px] text-slate-500 font-medium">{b.label}</div>
                <div className="text-sm font-bold text-slate-900 mt-1">{formatPaisaBDT(b.val)}</div>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                  <th className="py-2 px-2">Bill No</th>
                  <th className="py-2 px-2">Vendor</th>
                  <th className="py-2 px-2">Due Date</th>
                  <th className="py-2 px-2">Overdue</th>
                  <th className="py-2 px-2">Bucket</th>
                  <th className="py-2 px-2 text-right">Due Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {aging.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      No open payables.
                    </td>
                  </tr>
                ) : (
                  aging.rows.map((r) => (
                    <tr key={r._id}>
                      <td className="py-2 px-2 font-mono font-semibold">{r.billNo}</td>
                      <td className="py-2 px-2">{r.vendorName}</td>
                      <td className="py-2 px-2">{formatDateDMY(r.dueDate)}</td>
                      <td className="py-2 px-2">{r.overdueDays} days</td>
                      <td className="py-2 px-2">
                        <Badge variant={r.overdueDays > 30 ? 'danger' : 'warning'}>{r.bucket}</Badge>
                      </td>
                      <td className="py-2 px-2 text-right font-semibold">
                        {formatPaisaBDT(r.duePaisa)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'loans' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                <th className="py-2.5 px-2">Loan No</th>
                <th className="py-2.5 px-2">Lender</th>
                <th className="py-2.5 px-2">Type</th>
                <th className="py-2.5 px-2">Received Date</th>
                <th className="py-2.5 px-2">Deposit Method</th>
                <th className="py-2.5 px-2 text-right">Principal</th>
                <th className="py-2.5 px-2 text-right">Outstanding</th>
                <th className="py-2.5 px-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loans.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No loans recorded.
                  </td>
                </tr>
              ) : (
                loans.map((l) => (
                  <tr key={l._id}>
                    <td className="py-2.5 px-2 font-mono font-semibold">{l.loanNo}</td>
                    <td className="py-2.5 px-2">
                      <div className="font-medium text-slate-900">{l.lenderName}</div>
                      {(l.interestNote || l.attachmentUrl) && (
                        <div className="text-[11px] text-slate-500">
                          {l.interestNote}
                          {l.attachmentUrl && (
                            <>
                              {l.interestNote ? ' · ' : ''}
                              <a
                                href={l.attachmentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:underline font-medium"
                              >
                                Doc ↗
                              </a>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2">{l.loanType}</td>
                    <td className="py-2.5 px-2">{formatDateDMY(l.receivedDate)}</td>
                    <td className="py-2.5 px-2">{l.depositMethod}</td>
                    <td className="py-2.5 px-2 text-right font-medium">
                      {formatPaisaBDT(l.principalPaisa)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-semibold text-amber-700">
                      {formatPaisaBDT(l.outstandingPaisa)}
                    </td>
                    <td className="py-2.5 px-2">
                      <Badge variant="info">{l.status}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* New Vendor Bill Modal */}
      <Modal
        isOpen={showAddBill}
        onClose={() => setShowAddBill(false)}
        title="New Vendor Bill (Accrual)"
      >
        <form onSubmit={handleCreateBill} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Vendor Name *</label>
            <input
              required
              value={billForm.vendorName}
              onChange={(e) => setBillForm({ ...billForm, vendorName: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Bill Date *</label>
              <input
                type="date"
                required
                value={billForm.billDate}
                onChange={(e) => setBillForm({ ...billForm, billDate: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Due Date *</label>
              <input
                type="date"
                required
                value={billForm.dueDate}
                onChange={(e) => setBillForm({ ...billForm, dueDate: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Expense Account Code</label>
            <select
              value={billForm.expenseAccountCode}
              onChange={(e) => setBillForm({ ...billForm, expenseAccountCode: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
            >
              <option value="5250">5250 · Electricity</option>
              <option value="5255">5255 · Gas</option>
              <option value="5260">5260 · Office/House Rent</option>
              <option value="5265">5265 · Transport & Conveyance</option>
              <option value="5270">5270 · Internet & Phone</option>
              <option value="5275">5275 · Repairs & Maintenance</option>
              <option value="5280">5280 · Stationery & Office Supplies</option>
              <option value="5299">5299 · Miscellaneous Expense</option>
            </select>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Description *</label>
            <input
              required
              value={billForm.description}
              onChange={(e) => setBillForm({ ...billForm, description: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Amount (BDT) *</label>
            <input
              type="number"
              step="0.01"
              min="1"
              required
              value={billForm.totalTaka}
              onChange={(e) => setBillForm({ ...billForm, totalTaka: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
            />
          </div>
          <DocumentUploadField
            label="Bill / Invoice Document (Optional)"
            value={billForm.attachmentUrl}
            onChange={(url) => setBillForm({ ...billForm, attachmentUrl: url })}
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAddBill(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-medium disabled:opacity-50"
            >
              {submitting ? 'Posting...' : 'Create Bill'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Pay Bill Modal */}
      <Modal
        isOpen={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        title={`Pay Bill ${payTarget?.billNo || ''}`}
      >
        <form onSubmit={handlePayBill} className="space-y-3 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="font-semibold text-slate-900">{payTarget?.vendorName}</div>
            <div className="text-slate-500 mt-0.5">
              Remaining Due: <strong>{formatPaisaBDT(payTarget?.duePaisa || 0)}</strong>
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Payment Date *</label>
            <input
              type="date"
              required
              value={payForm.paymentDate}
              onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Amount (BDT) *</label>
            <input
              type="number"
              step="0.01"
              min="1"
              required
              value={payForm.amountTaka}
              onChange={(e) => setPayForm({ ...payForm, amountTaka: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Method *</label>
            <select
              value={payForm.method}
              onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
            >
              <option value="Bank">Bank</option>
              <option value="Cash">Cash</option>
              <option value="Cheque">Cheque</option>
              <option value="bKash">bKash</option>
              <option value="Nagad">Nagad</option>
            </select>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Reference</label>
            <input
              value={payForm.reference}
              onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
            />
          </div>
          <DocumentUploadField
            label="Payment Proof / Receipt (Optional)"
            value={payForm.attachmentUrl}
            onChange={(url) => setPayForm({ ...payForm, attachmentUrl: url })}
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setPayTarget(null)}
              className="px-3 py-1.5 rounded-lg border border-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-medium disabled:opacity-50"
            >
              {submitting ? 'Posting...' : 'Post Payment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Bill Payment History Modal */}
      <Modal
        isOpen={Boolean(detailBill)}
        onClose={() => setDetailBill(null)}
        title={`Payment History — ${detailBill?.billNo || ''}`}
      >
        <div className="space-y-3 text-xs">
          {detailPayments.length === 0 ? (
            <div className="py-6 text-center text-slate-400">No payments recorded yet.</div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2">Payment No</th>
                  <th className="py-2">Date</th>
                  <th className="py-2">Method</th>
                  <th className="py-2 text-right">Amount</th>
                  <th className="py-2">Status</th>
                  {isAdmin && <th className="py-2 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detailPayments.map((p) => (
                  <tr key={p._id}>
                    <td className="py-2 font-mono">
                      {p.paymentNo}
                      {p.attachmentUrl && (
                        <a
                          href={p.attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1.5 text-[11px] font-sans text-indigo-600 hover:underline font-medium"
                        >
                          Doc ↗
                        </a>
                      )}
                    </td>
                    <td className="py-2">{formatDateDMY(p.paymentDate)}</td>
                    <td className="py-2">{p.method}</td>
                    <td className="py-2 text-right font-semibold">{formatPaisaBDT(p.amountPaisa)}</td>
                    <td className="py-2">
                      <Badge variant={p.status === 'Posted' ? 'success' : 'warning'}>
                        {p.status}
                      </Badge>
                    </td>
                    {isAdmin && (
                      <td className="py-2 text-right">
                        {p.status === 'Posted' && (
                          <button
                            onClick={() => handleReversePayment(p._id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
                          >
                            <RotateCcw className="w-3 h-3" /> Reverse
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>

      {/* Record Loan Modal */}
      <Modal
        isOpen={showAddLoan}
        onClose={() => setShowAddLoan(false)}
        title="Record Loan / Borrowing"
      >
        <form onSubmit={handleCreateLoan} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Lender Name *</label>
            <input
              required
              value={loanForm.lenderName}
              onChange={(e) => setLoanForm({ ...loanForm, lenderName: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Loan Account</label>
              <select
                value={loanForm.loanType}
                onChange={(e) =>
                  setLoanForm({ ...loanForm, loanType: e.target.value as 'Bank' | 'Other' })
                }
                className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
              >
                <option value="Bank">2310 · Bank Loan</option>
                <option value="Other">2320 · Other Loans</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Deposit To</label>
              <select
                value={loanForm.depositMethod}
                onChange={(e) => setLoanForm({ ...loanForm, depositMethod: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
              >
                <option value="Bank">Bank</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Received Date *</label>
              <input
                type="date"
                required
                value={loanForm.receivedDate}
                onChange={(e) => setLoanForm({ ...loanForm, receivedDate: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Principal (BDT) *</label>
              <input
                type="number"
                step="0.01"
                min="1"
                required
                value={loanForm.principalTaka}
                onChange={(e) => setLoanForm({ ...loanForm, principalTaka: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Interest / Terms Note</label>
            <input
              value={loanForm.interestNote}
              onChange={(e) => setLoanForm({ ...loanForm, interestNote: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
            />
          </div>
          <DocumentUploadField
            label="Loan Agreement / Document (Optional)"
            value={loanForm.attachmentUrl}
            onChange={(url) => setLoanForm({ ...loanForm, attachmentUrl: url })}
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAddLoan(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-medium disabled:opacity-50"
            >
              {submitting ? 'Posting...' : 'Record Loan'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

