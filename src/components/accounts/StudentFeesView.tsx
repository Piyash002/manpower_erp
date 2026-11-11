'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users2,
  RefreshCw,
  Search,
  Plus,
  FileText,
  Percent,
  CheckCircle2,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/components/layout/DashboardLayout';
import { formatPaisaBDT, paisaToTaka, takaToPaisa } from '@/lib/accounts-money';
import { formatDateDMY } from '@/lib/formatters';

export function StudentFeesView() {
  const { user } = useAuth();
  const role = user?.role || 'Viewer';
  const canAccess = ['Admin', 'Accountant', 'Viewer'].includes(role);
  const canWrite = ['Admin', 'Accountant'].includes(role);
  const isAdmin = role === 'Admin';

  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Assign Plan modal state
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [assignableStudents, setAssignableStudents] = useState<any[]>([]);
  const [feeTemplates, setFeeTemplates] = useState<any[]>([]);
  const [assignForm, setAssignForm] = useState({ studentId: '', templateId: '' });
  const [savingAssign, setSavingAssign] = useState(false);
  const [assignErr, setAssignErr] = useState('');

  // Discount Request modal state
  const [discountPlan, setDiscountPlan] = useState<any | null>(null);
  const [discountForm, setDiscountForm] = useState({ amountTaka: '', reason: '' });
  const [savingDiscount, setSavingDiscount] = useState(false);
  const [discountErr, setDiscountErr] = useState('');

  // Statement modal state
  const [statementData, setStatementData] = useState<any | null>(null);
  const [loadingStatement, setLoadingStatement] = useState(false);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      const res = await fetch(`/api/accounts/student-fees?${qs.toString()}`);
      const json = await res.json();
      if (json.success) setPlans(json.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, statusFilter]);

  const openAssignModal = async () => {
    setAssignErr('');
    setIsAssignOpen(true);
    const [stRes, tplRes] = await Promise.all([
      fetch('/api/students?limit=200'),
      fetch('/api/accounts/fee-templates?activeOnly=1'),
    ]);
    const [stJson, tplJson] = await Promise.all([stRes.json(), tplRes.json()]);
    const existingStudentIds = new Set(
      plans.map((p) => String(p.studentId?._id || p.studentId))
    );
    const studentsList = (stJson.students || []).filter(
      (s: any) => !existingStudentIds.has(String(s._id))
    );
    const tpls = tplJson.data || [];
    setAssignableStudents(studentsList);
    setFeeTemplates(tpls);
    setAssignForm({
      studentId: studentsList[0]?._id || '',
      templateId: tpls[0]?._id || '',
    });
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAssign(true);
    setAssignErr('');
    setBanner(null);
    try {
      const res = await fetch('/api/accounts/student-fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignForm),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Assignment failed');
      setIsAssignOpen(false);
      setBanner({ type: 'ok', msg: json.message });
      loadPlans();
    } catch (err: any) {
      setAssignErr(err.message);
    } finally {
      setSavingAssign(false);
    }
  };

  const handleRequestDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discountPlan) return;
    setSavingDiscount(true);
    setDiscountErr('');
    setBanner(null);
    try {
      const res = await fetch(`/api/accounts/student-fees/${discountPlan._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_discount',
          discountPaisa: takaToPaisa(discountForm.amountTaka),
          reason: discountForm.reason,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Discount request failed');
      setDiscountPlan(null);
      setBanner({ type: 'ok', msg: json.message });
      loadPlans();
    } catch (err: any) {
      setDiscountErr(err.message);
    } finally {
      setSavingDiscount(false);
    }
  };

  const handleDiscountDecision = async (planId: string, action: 'approve_discount' | 'reject_discount') => {
    setBanner(null);
    const res = await fetch(`/api/accounts/student-fees/${planId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setBanner({ type: 'ok', msg: json.message });
      loadPlans();
    } else {
      setBanner({ type: 'err', msg: json.message || 'Action failed' });
    }
  };

  const openStatement = async (planId: string) => {
    setLoadingStatement(true);
    setStatementData({ loading: true });
    try {
      const res = await fetch(`/api/accounts/student-fees/${planId}`);
      const json = await res.json();
      if (json.success) setStatementData(json.data);
      else setStatementData(null);
    } finally {
      setLoadingStatement(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-600">
        Your role ({role}) does not have access to Accounts.
      </div>
    );
  }

  const totalNet = plans.reduce((s, p) => s + (p.netPayablePaisa || 0), 0);
  const totalPaid = plans.reduce((s, p) => s + (p.totalPaidPaisa || 0), 0);
  const totalDue = plans.reduce((s, p) => s + (p.totalDuePaisa || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users2 className="w-6 h-6 text-emerald-700" />
            <span>Student Fees &amp; Plans</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Accounts-owned student fee plans, invoice vouchers, stage schedules, and live receivable balances.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {canWrite && (
            <button
              type="button"
              onClick={openAssignModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
            >
              <Plus className="w-4 h-4" /> Assign Fee Plan
            </button>
          )}
          <button
            type="button"
            onClick={loadPlans}
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Billed</span>
          <p className="text-xl font-bold text-slate-900 font-mono mt-1">{formatPaisaBDT(totalNet)}</p>
        </div>
        <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-800 uppercase">Total Collected</span>
          <p className="text-xl font-bold text-emerald-800 font-mono mt-1">{formatPaisaBDT(totalPaid)}</p>
        </div>
        <div className="bg-rose-50/40 p-4 rounded-xl border border-rose-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-rose-700 uppercase">Receivable Due</span>
          <p className="text-xl font-bold text-rose-700 font-mono mt-1">{formatPaisaBDT(totalDue)}</p>
        </div>
      </div>

      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search student ID, name, plan no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadPlans()}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
        >
          <option value="all">All Statuses</option>
          <option value="Active">Active (Due)</option>
          <option value="Paid">Paid</option>
        </select>
        <button
          type="button"
          onClick={loadPlans}
          className="px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg"
        >
          Search
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Plan &amp; Invoice JV</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Stages Summary</th>
                <th className="px-4 py-3 text-right">Net Payable</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Due</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Loading Student Fee Plans...
                  </td>
                </tr>
              ) : plans.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No Student Fee Plans found.
                  </td>
                </tr>
              ) : (
                plans.map((p) => (
                  <tr key={p._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono font-bold text-slate-900 block">{p.planNo}</span>
                      <span className="text-[11px] font-mono text-blue-700">
                        {p.invoiceJournalEntryId?.voucherNo || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-900 block">
                        {p.studentId?.name || 'Student'}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {p.studentNo} · {p.tradeName} · {p.destinationCountry}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(p.stages || []).map((st: any) => (
                          <span
                            key={st.stageNo}
                            className={`text-[10px] px-1.5 py-0.5 rounded border ${
                              st.status === 'Paid'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : st.status === 'Partial'
                                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                                  : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                          >
                            #{st.stageNo} {formatDateDMY(st.dueDate)}:{' '}
                            {formatPaisaBDT(st.amountPaisa, { showDecimals: false })}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{formatPaisaBDT(p.netPayablePaisa)}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-700 font-semibold">
                      {formatPaisaBDT(p.totalPaidPaisa)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-rose-700 font-bold">
                      {formatPaisaBDT(p.totalDuePaisa)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={p.totalDuePaisa <= 0 ? 'success' : 'warning'}>
                        {p.totalDuePaisa <= 0 ? 'Paid' : p.status}
                      </Badge>
                      {p.discountStatus === 'Pending' && p.pendingDiscountPaisa > 0 && (
                        <div className="mt-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800">
                          Disc Req: {formatPaisaBDT(p.pendingDiscountPaisa, { showDecimals: false })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openStatement(p._id)}
                          title="View Student Fee Statement"
                          className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        {canWrite && p.totalDuePaisa > 0 && p.discountStatus !== 'Pending' && (
                          <button
                            type="button"
                            onClick={() => {
                              setDiscountErr('');
                              setDiscountForm({ amountTaka: '', reason: '' });
                              setDiscountPlan(p);
                            }}
                            title="Request Discount"
                            className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded"
                          >
                            <Percent className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isAdmin && p.discountStatus === 'Pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDiscountDecision(p._id, 'approve_discount')}
                              title="Approve Discount"
                              className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDiscountDecision(p._id, 'reject_discount')}
                              title="Reject Discount"
                              className="p-1.5 text-rose-700 hover:bg-rose-50 rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {p.totalDuePaisa > 0 && (
                          <Link
                            href={`/accounts/receipts?studentId=${p.studentId?._id || p.studentId}`}
                            className="px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-600 rounded hover:bg-emerald-700"
                          >
                            Collect
                          </Link>
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

      {/* Assign Fee Plan Modal */}
      <Modal
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
        title="Assign Student Fee Plan"
        maxWidth="md"
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4 text-xs">
          {assignErr && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
              {assignErr}
            </div>
          )}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Student (Without Fee Plan) *</label>
            <select
              required
              value={assignForm.studentId}
              onChange={(e) => setAssignForm({ ...assignForm, studentId: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            >
              {assignableStudents.length === 0 ? (
                <option value="">All active students already have Fee Plans</option>
              ) : (
                assignableStudents.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.student_no} — {s.name} ({s.trade_name})
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Fee Template *</label>
            <select
              required
              value={assignForm.templateId}
              onChange={(e) => setAssignForm({ ...assignForm, templateId: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            >
              {feeTemplates.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.code} — {t.name} ({formatPaisaBDT(t.totalAmountPaisa)})
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsAssignOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingAssign || assignableStudents.length === 0}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {savingAssign ? 'Posting...' : 'Assign & Post JV'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Request Discount Modal */}
      <Modal
        isOpen={Boolean(discountPlan)}
        onClose={() => setDiscountPlan(null)}
        title={`Request Discount (${discountPlan?.planNo || ''})`}
        maxWidth="md"
      >
        <form onSubmit={handleRequestDiscount} className="space-y-4 text-xs">
          {discountErr && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
              {discountErr}
            </div>
          )}
          <p className="text-slate-600">
            Current Due: <strong className="font-mono">{formatPaisaBDT(discountPlan?.totalDuePaisa || 0)}</strong>. Approval posts 4110 Fee Income Dr / 1210 Receivable Cr.
          </p>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Discount Amount (BDT) *</label>
            <input
              type="number"
              min={1}
              max={paisaToTaka(discountPlan?.totalDuePaisa || 0)}
              required
              value={discountForm.amountTaka}
              onChange={(e) => setDiscountForm({ ...discountForm, amountTaka: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Reason *</label>
            <input
              type="text"
              required
              minLength={3}
              value={discountForm.reason}
              onChange={(e) => setDiscountForm({ ...discountForm, reason: e.target.value })}
              placeholder="e.g. Merit scholarship / sibling waiver"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setDiscountPlan(null)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingDiscount}
              className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg"
            >
              {savingDiscount ? 'Submitting...' : 'Submit for Admin Approval'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Student Statement Modal */}
      <Modal
        isOpen={Boolean(statementData)}
        onClose={() => setStatementData(null)}
        title={`Student Fee Statement — ${statementData?.student?.name || ''}`}
        description={statementData?.student?.student_no || ''}
        maxWidth="4xl"
      >
        {loadingStatement ? (
          <div className="py-8 text-center text-xs text-slate-400">Loading statement...</div>
        ) : statementData?.rows ? (
          <div className="space-y-4 text-xs">
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-100 text-slate-600 font-semibold uppercase">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Ref / Voucher</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Debit (+)</th>
                    <th className="px-3 py-2 text-right">Credit (-)</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {statementData.rows.map((r: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-3 py-2 whitespace-nowrap">{formatDateDMY(r.date)}</td>
                      <td className="px-3 py-2 font-mono">
                        <span className="font-bold text-slate-800">{r.refNo}</span>
                        <span className="block text-[10px] text-blue-700">{r.voucherNo}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{r.description}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800">
                        {r.debitPaisa > 0 ? formatPaisaBDT(r.debitPaisa) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-700">
                        {r.creditPaisa > 0 ? formatPaisaBDT(r.creditPaisa) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                        {formatPaisaBDT(r.runningBalancePaisa)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

