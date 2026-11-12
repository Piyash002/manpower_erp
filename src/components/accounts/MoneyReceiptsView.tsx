'use client';

import React, { useEffect, useState } from 'react';
import {
  Banknote,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Printer,
  RotateCcw,
  Upload,
  Paperclip,
  X,
  Landmark,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { TableToolbar } from '@/components/ui/TableToolbar';
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

const PAYMENT_METHODS = ['Cash', 'bKash', 'Nagad', 'Rocket', 'Bank transfer', 'Cheque', 'Card'] as const;

export function MoneyReceiptsView() {
  const { user } = useAuth();
  const role = user?.role || 'Viewer';
  const canAccess = ['Admin', 'Accountant', 'Viewer'].includes(role);
  const canWrite = ['Admin', 'Accountant'].includes(role);
  const isAdmin = role === 'Admin';

  const [receipts, setReceipts] = useState<any[]>([]);
  const [duePlans, setDuePlans] = useState<any[]>([]);
  const [depositAccounts, setDepositAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [previewProof, setPreviewProof] = useState<{ url: string; receiptNo: string } | null>(null);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Posted' | 'Reversed'>('all');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [reverseReceipt, setReverseReceipt] = useState<any | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);
  const [reverseErr, setReverseErr] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [modalErr, setModalErr] = useState('');
  const emptyForm = () => ({
    studentId: '',
    amountTaka: '',
    method: 'Cash' as (typeof PAYMENT_METHODS)[number],
    depositAccountId: '',
    bankName: '',
    chequeNo: '',
    chequeDate: '',
    proofUrl: '',
    reference: '',
    receiptDate: new Date().toISOString().split('T')[0],
    note: '',
  });
  const [form, setForm] = useState(emptyForm);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rRes, pRes, coaRes] = await Promise.all([
        fetch('/api/accounts/receipts'),
        fetch('/api/accounts/student-fees?status=Active'),
        fetch('/api/accounts/coa?leafOnly=true'),
      ]);
      const [rJson, pJson, coaJson] = await Promise.all([rRes.json(), pRes.json(), coaRes.json()]);
      if (rJson.success) setReceipts(rJson.data || []);
      if (pJson.success) {
        const list = (pJson.data || []).filter((p: any) => (p.totalDuePaisa || 0) > 0);
        setDuePlans(list);
      }
      if (coaJson.success) {
        const cashBankAccs = (coaJson.data || []).filter(
          (a: any) => a.type === 'Asset' && String(a.code || '').startsWith('11')
        );
        setDepositAccounts(cashBankAccs);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess]);

  // Pre-select student and open collection modal if ?studentId=... is present in URL
  useEffect(() => {
    if (!canWrite || duePlans.length === 0 || typeof window === 'undefined') return;
    const preStudentId = new URLSearchParams(window.location.search).get('studentId');
    if (preStudentId) {
      const matched = duePlans.find((p) => String(p.studentId?._id || p.studentId) === preStudentId);
      if (matched) {
        setModalErr('');
        setForm({
          ...emptyForm(),
          studentId: preStudentId,
          amountTaka: String(paisaToTaka(matched.totalDuePaisa)),
        });
        setIsModalOpen(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duePlans.length, canWrite]);

  if (!canAccess) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-600">
        Your role ({role}) does not have access to Accounts.
      </div>
    );
  }

  const openModal = () => {
    setModalErr('');
    const firstPlan = duePlans[0];
    setForm({
      ...emptyForm(),
      studentId: firstPlan?.studentId?._id || firstPlan?.studentId || '',
      amountTaka: firstPlan ? String(paisaToTaka(firstPlan.totalDuePaisa)) : '',
    });
    setIsModalOpen(true);
  };

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProof(true);
    setModalErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'receipt_proof');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success || !json.url) {
        throw new Error(json.message || 'Proof upload failed');
      }
      setForm((prev) => ({ ...prev, proofUrl: json.url }));
    } catch (err: any) {
      setModalErr(err.message || 'Failed to upload proof image');
    } finally {
      setUploadingProof(false);
      e.target.value = '';
    }
  };

  const handleCollect = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setModalErr('');
    setBanner(null);
    try {
      const res = await fetch('/api/accounts/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: form.studentId,
          amountPaisa: takaToPaisa(form.amountTaka),
          method: form.method,
          depositAccountId: form.depositAccountId || undefined,
          bankName: form.bankName || undefined,
          chequeNo: form.chequeNo || undefined,
          chequeDate: form.chequeDate || undefined,
          proofUrl: form.proofUrl || undefined,
          reference: form.reference,
          receiptDate: form.receiptDate,
          note: form.note,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Collection failed');
      setIsModalOpen(false);
      setBanner({ type: 'ok', msg: json.message });
      loadData();
    } catch (err: any) {
      setModalErr(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReverseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reverseReceipt) return;
    setReversing(true);
    setReverseErr('');
    setBanner(null);
    try {
      const res = await fetch(`/api/accounts/receipts/${reverseReceipt._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reverseReason }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Reversal failed');
      setReverseReceipt(null);
      setReverseReason('');
      setBanner({ type: 'ok', msg: json.message });
      loadData();
    } catch (err: any) {
      setReverseErr(err.message);
    } finally {
      setReversing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Banknote className="w-6 h-6 text-emerald-700" />
            <span>Money Receipts</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Every collection posts Cash/Bank/Wallet Dr and Student Fee Receivable (1210) Cr atomically.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canWrite && (
            <button
              type="button"
              disabled={duePlans.length === 0}
              onClick={openModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Collect Payment
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

      {(() => {
        const filtered = receipts.filter((r) => {
          if (methodFilter !== 'all' && r.method !== methodFilter) return false;
          if (statusFilter !== 'all' && r.status !== statusFilter) return false;
          return matchesSearch(search, [
            r.receiptNo,
            r.journalEntryId?.voucherNo,
            r.studentId?.name,
            r.studentId?.student_no,
            r.method,
            r.bankName,
            r.chequeNo,
            r.reference,
            r.depositAccountId?.name,
          ]);
        });
        const sortedReceipts = sortTableItems(filtered, sortKey, sortDir, {
          date: (r) => new Date(r.receiptDate || 0),
          receiptNo: (r) => r.receiptNo || '',
          student: (r) => r.studentId?.name || '',
          method: (r) => r.method || '',
          amount: (r) => Number(r.amountPaisa || 0),
          status: (r) => r.status || '',
        });
        const headers = [
          'Receipt No',
          'Voucher',
          'Date',
          'Student ID',
          'Student Name',
          'Method',
          'Deposit Account',
          'Bank / Cheque / Ref',
          'Amount (BDT)',
          'Status',
        ];
        const rows = sortedReceipts.map((r) => [
          r.receiptNo,
          r.journalEntryId?.voucherNo || '',
          formatDateDMY(r.receiptDate),
          r.studentId?.student_no || '',
          r.studentId?.name || '',
          r.method,
          `${r.depositAccountId?.code || ''} ${r.depositAccountId?.name || ''}`.trim(),
          [r.bankName, r.chequeNo ? `Cheque: ${r.chequeNo}` : '', r.reference].filter(Boolean).join(' | '),
          paisaToTaka(r.amountPaisa || 0),
          r.status,
        ]);

        return (
          <>
            <TableToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search receipt no, voucher, student, bank, cheque, ref..."
              filters={
                <>
                  <select
                    value={methodFilter}
                    onChange={(e) => setMethodFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
                  >
                    <option value="all">All Methods</option>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
                  >
                    <option value="all">All Status</option>
                    <option value="Posted">Posted</option>
                    <option value="Reversed">Reversed</option>
                  </select>
                </>
              }
              sortKey={sortKey}
              sortDir={sortDir}
              sortOptions={[
                { value: 'date', label: 'Receipt Date' },
                { value: 'receiptNo', label: 'Receipt No' },
                { value: 'amount', label: 'Amount' },
                { value: 'student', label: 'Student' },
                { value: 'method', label: 'Method' },
                { value: 'status', label: 'Status' },
              ]}
              onSortChange={(k, d) => {
                setSortKey(k);
                setSortDir(d);
              }}
              totalCount={receipts.length}
              filteredCount={sortedReceipts.length}
              hasActiveFilters={methodFilter !== 'all' || statusFilter !== 'all'}
              onReset={() => {
                setSearch('');
                setMethodFilter('all');
                setStatusFilter('all');
              }}
              onExportExcel={() =>
                downloadExcel({
                  filename: 'money-receipts-register',
                  sheetName: 'Money Receipts',
                  headers,
                  rows,
                })
              }
              onPrint={() =>
                printTableReport({
                  title: 'Money Receipts Register',
                  meta: `Method: ${methodFilter} | Status: ${statusFilter}`,
                  headers,
                  rows,
                  rightAlignCols: [8],
                  landscape: true,
                })
              }
            />

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Receipt No</th>
                <th className="px-4 py-3">Journal Voucher</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Method &amp; Account</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Loading Money Receipts...
                  </td>
                </tr>
              ) : sortedReceipts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No matching receipts found.
                  </td>
                </tr>
              ) : (
                sortedReceipts.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {r.receiptNo}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-blue-700 whitespace-nowrap">
                      {r.journalEntryId?.voucherNo || '-'}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">
                      {formatDateDMY(r.receiptDate)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-slate-900 block">
                        {r.studentId?.name || 'Student'}
                      </span>
                      <span className="text-[11px] text-slate-400">{r.studentId?.student_no}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-slate-800">{r.method}</span>
                      <span className="block text-[11px] text-slate-400">
                        {r.depositAccountId?.code} — {r.depositAccountId?.name}
                      </span>
                      {(r.bankName || r.chequeNo || r.reference) && (
                        <span className="block text-[11px] text-slate-600 mt-0.5">
                          {[
                            r.bankName,
                            r.chequeNo ? `Cheque: ${r.chequeNo}` : '',
                            !r.chequeNo && r.reference ? `Ref: ${r.reference}` : '',
                            r.chequeDate ? `Dt: ${formatDateDMY(r.chequeDate)}` : '',
                          ]
                            .filter(Boolean)
                            .join(' • ')}
                        </span>
                      )}
                      {r.proofUrl && (
                        <button
                          type="button"
                          onClick={() => setPreviewProof({ url: r.proofUrl, receiptNo: r.receiptNo })}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded"
                        >
                          <Paperclip className="w-3 h-3" /> View Slip / Photo
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700">
                      {formatPaisaBDT(r.amountPaisa)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <Badge variant={r.status === 'Posted' ? 'success' : 'danger'}>{r.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <a
                          href={`/api/accounts/receipts/${r._id}?format=pdf`}
                          target="_blank"
                          rel="noreferrer"
                          title="Print / Download PDF Receipt"
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded"
                        >
                          <Printer className="w-3 h-3" /> PDF
                        </a>
                        {isAdmin && r.status === 'Posted' && (
                          <button
                            type="button"
                            onClick={() => {
                              setReverseErr('');
                              setReverseReason('');
                              setReverseReceipt(r);
                            }}
                            title="Reverse Posted Receipt"
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded"
                          >
                            <RotateCcw className="w-3 h-3" /> Reverse
                          </button>
                        )}
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

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Collect Student Payment"
        maxWidth="md"
      >
        <form onSubmit={handleCollect} className="space-y-4 text-xs">
          {modalErr && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium">
              {modalErr}
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Student (With Due) *</label>
            <select
              required
              value={form.studentId}
              onChange={(e) => {
                const plan = duePlans.find(
                  (p) => (p.studentId?._id || p.studentId) === e.target.value
                );
                setForm({
                  ...form,
                  studentId: e.target.value,
                  amountTaka: plan ? String(paisaToTaka(plan.totalDuePaisa)) : '',
                });
              }}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            >
              {duePlans.map((p) => {
                const sid = p.studentId?._id || p.studentId;
                return (
                  <option key={p._id} value={sid}>
                    {p.studentNo} — {p.studentId?.name} (Due: {formatPaisaBDT(p.totalDuePaisa)})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Amount (BDT) *</label>
              <input
                type="number"
                step="0.01"
                required
                min={1}
                value={form.amountTaka}
                onChange={(e) => setForm({ ...form, amountTaka: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Method *</label>
              <select
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value as any })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Receipt Date *</label>
              <input
                type="date"
                required
                value={form.receiptDate}
                onChange={(e) => setForm({ ...form, receiptDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {form.method === 'Bank transfer' || form.method === 'Cheque'
                  ? 'Advice / TrxID'
                  : 'Ref / TrxID'}
              </label>
              <input
                type="text"
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder={
                  form.method === 'Bank transfer'
                    ? 'e.g. NPSB / BEFTN / Deposit Ref'
                    : form.method === 'Cheque'
                    ? 'e.g. Clearing Ref'
                    : 'Optional TrxID'
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {(form.method === 'Bank transfer' || form.method === 'Cheque') && (
            <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                <Landmark className="w-3.5 h-3.5 text-blue-700" />
                <span>
                  {form.method === 'Cheque'
                    ? 'Cheque & Bank Details'
                    : 'Bank Transfer & Deposit Slip Details'}
                </span>
              </div>

              {depositAccounts.length > 0 && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Deposit Bank / COA Account
                  </label>
                  <select
                    value={form.depositAccountId}
                    onChange={(e) => setForm({ ...form, depositAccountId: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="">Auto-route to Default Bank Account</option>
                    {depositAccounts.map((acc) => (
                      <option key={acc._id} value={acc._id}>
                        {acc.code} — {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Bank Name / Branch
                  </label>
                  <input
                    type="text"
                    value={form.bankName}
                    onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                    placeholder="e.g. Dutch-Bangla Bank, Banani"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {form.method === 'Cheque' ? 'Cheque Number *' : 'Transfer / Slip No.'}
                  </label>
                  <input
                    type="text"
                    required={form.method === 'Cheque'}
                    value={form.chequeNo}
                    onChange={(e) => setForm({ ...form, chequeNo: e.target.value })}
                    placeholder={form.method === 'Cheque' ? 'e.g. CHQ-482910' : 'e.g. SLIP-10293'}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              {form.method === 'Cheque' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cheque Date</label>
                  <input
                    type="date"
                    value={form.chequeDate}
                    onChange={(e) => setForm({ ...form, chequeDate: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              )}
            </div>
          )}

          {form.method !== 'Cash' && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    {form.method === 'Cheque'
                      ? 'Cheque Photo / Scan'
                      : form.method === 'Bank transfer'
                      ? 'Bank Deposit Slip / Screenshot'
                      : 'Payment Screenshot / Slip (Optional)'}
                  </span>
                </label>
                <span className="text-[10px] text-slate-400">JPG, PNG, WebP, PDF (max 5MB)</span>
              </div>

              {form.proofUrl ? (
                <div className="flex items-center justify-between gap-3 p-2 bg-white border border-slate-200 rounded-lg">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {form.proofUrl.toLowerCase().endsWith('.pdf') ? (
                      <div className="w-10 h-10 rounded bg-rose-50 text-rose-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                        PDF
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={form.proofUrl}
                        alt="Uploaded proof"
                        className="w-10 h-10 object-cover rounded border border-slate-200 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-emerald-700">Proof uploaded</p>
                      <a
                        href={form.proofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-blue-600 hover:underline truncate block"
                      >
                        Preview full file
                      </a>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, proofUrl: '' })}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded"
                    title="Remove photo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white border border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/40 rounded-lg cursor-pointer transition-colors">
                  <Upload className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-medium text-slate-700">
                    {uploadingProof
                      ? 'Uploading photo...'
                      : 'Choose Cheque / Deposit Slip Photo'}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                    disabled={uploadingProof}
                    onChange={handleProofUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Note</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploadingProof}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {saving ? 'Posting Receipt...' : 'Post Money Receipt'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Proof Slip / Cheque Photo Lightbox Modal */}
      <Modal
        isOpen={Boolean(previewProof)}
        onClose={() => setPreviewProof(null)}
        title={`Payment Proof (${previewProof?.receiptNo || ''})`}
        maxWidth="lg"
      >
        {previewProof && (
          <div className="space-y-3">
            {previewProof.url.toLowerCase().endsWith('.pdf') ? (
              <iframe
                src={previewProof.url}
                title={`Proof ${previewProof.receiptNo}`}
                className="w-full h-[65vh] rounded-lg border border-slate-200"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewProof.url}
                alt={`Proof ${previewProof.receiptNo}`}
                className="max-h-[70vh] w-auto mx-auto rounded-lg border border-slate-200 object-contain"
              />
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <a
                href={previewProof.url}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"
              >
                Open Original
              </a>
              <button
                type="button"
                onClick={() => setPreviewProof(null)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reverse Receipt Modal (Admin only) */}
      <Modal
        isOpen={Boolean(reverseReceipt)}
        onClose={() => setReverseReceipt(null)}
        title={`Reverse Money Receipt (${reverseReceipt?.receiptNo || ''})`}
        maxWidth="md"
      >
        <form onSubmit={handleReverseSubmit} className="space-y-4 text-xs">
          {reverseErr && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
              {reverseErr}
            </div>
          )}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
            Reversing posts a mirror Journal Entry against{' '}
            <strong className="font-mono">{reverseReceipt?.journalEntryId?.voucherNo}</strong> and restores{' '}
            <strong className="font-mono">{formatPaisaBDT(reverseReceipt?.amountPaisa || 0)}</strong> back to student due.
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Mandatory Reversal Reason *</label>
            <input
              type="text"
              required
              minLength={3}
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="e.g. Cheque dishonored / Wrong amount entered"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setReverseReceipt(null)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={reversing}
              className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
            >
              {reversing ? 'Reversing...' : 'Confirm Reversal'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

