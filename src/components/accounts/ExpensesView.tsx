'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ReceiptText,
  Plus,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { TableToolbar } from '@/components/ui/TableToolbar';
import { DocumentUploadField } from '@/components/accounts/DocumentUploadField';
import { useAuth } from '@/components/layout/DashboardLayout';
import { EMPLOYEE_DEPARTMENTS, formatDateDMY } from '@/lib/formatters';
import { formatPaisaBDT, paisaToTaka, takaToPaisa } from '@/lib/accounts-money';
import {
  downloadExcel,
  matchesSearch,
  printTableReport,
  sortTableItems,
  type SortDir,
} from '@/lib/client-export';

interface ExpenseCategory {
  _id: string;
  name: string;
  accountCode: string;
  active: boolean;
}

interface ExpenseRow {
  _id: string;
  expenseNo: string;
  date: string;
  categoryId: string;
  categoryName: string;
  accountCode: string;
  amountPaisa: number;
  payeeName: string;
  description: string;
  paymentStatus: 'Paid' | 'Unpaid' | 'Prepaid';
  paymentMethod: string;
  reference: string;
  attachmentUrl: string;
  branch: string;
  department: string;
  status: 'Posted' | 'Reversed';
}

export function ExpensesView() {
  const { user } = useAuth();
  const role = user?.role || 'Viewer';
  const canWrite = role === 'Admin' || role === 'Accountant';
  const isAdmin = role === 'Admin';

  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [payStatusFilter, setPayStatusFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    categoryId: '',
    amountTaka: '',
    payeeName: '',
    description: '',
    paymentStatus: 'Paid' as 'Paid' | 'Unpaid' | 'Prepaid',
    paymentMethod: 'Cash',
    reference: '',
    attachmentUrl: '',
    branch: 'Main',
    department: 'General',
  });

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [eRes, cRes] = await Promise.all([
        fetch('/api/accounts/expenses'),
        fetch('/api/accounts/expense-categories?activeOnly=true'),
      ]);
      const [eJson, cJson] = await Promise.all([eRes.json(), cRes.json()]);
      if (!eJson.success) throw new Error(eJson.message || 'Failed to load expenses');
      setExpenses(eJson.data || []);
      if (cJson.success) {
        const cats: ExpenseCategory[] = cJson.data || [];
        setCategories(cats);
        if (cats.length > 0 && !form.categoryId) {
          setForm((prev) => ({ ...prev, categoryId: cats[0]._id }));
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Error loading expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const filtered = useMemo(() => {
    const list = expenses.filter((e) => {
      if (categoryFilter !== 'All' && e.categoryId !== categoryFilter) return false;
      if (payStatusFilter !== 'All' && e.paymentStatus !== payStatusFilter) return false;
      if (statusFilter !== 'All' && e.status !== statusFilter) return false;
      return matchesSearch(
        search,
        [e.expenseNo, e.categoryName, e.payeeName, e.description, e.reference]
      );
    });
    return sortTableItems(list, sortKey, sortDir, {
      date: (e) => e.date,
      expenseNo: (e) => e.expenseNo,
      amountPaisa: (e) => e.amountPaisa,
    });
  }, [expenses, search, categoryFilter, payStatusFilter, statusFilter, sortKey, sortDir]);

  const totals = useMemo(() => {
    let postedTotal = 0;
    let paidTotal = 0;
    let unpaidTotal = 0;
    for (const e of filtered) {
      if (e.status !== 'Posted') continue;
      postedTotal += e.amountPaisa;
      if (e.paymentStatus === 'Paid' || e.paymentStatus === 'Prepaid') paidTotal += e.amountPaisa;
      if (e.paymentStatus === 'Unpaid') unpaidTotal += e.amountPaisa;
    }
    return { postedTotal, paidTotal, unpaidTotal };
  }, [filtered]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/accounts/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date,
          categoryId: form.categoryId,
          amountPaisa: takaToPaisa(Number(form.amountTaka || 0)),
          payeeName: form.payeeName,
          description: form.description,
          paymentStatus: form.paymentStatus,
          paymentMethod: form.paymentStatus === 'Unpaid' ? 'None' : form.paymentMethod,
          reference: form.reference,
          attachmentUrl: form.attachmentUrl,
          branch: form.branch,
          department: form.department,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to record expense');
      setShowAdd(false);
      setForm((prev) => ({
        ...prev,
        amountTaka: '',
        payeeName: '',
        description: '',
        reference: '',
        attachmentUrl: '',
      }));
      setMessage('Expense recorded and posted to General Ledger.');
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to record expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReverse = async (id: string) => {
    const reason = window.prompt('Enter reason for reversing this expense (min 3 chars):');
    if (!reason || reason.trim().length < 3) return;
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/accounts/expenses/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reverse', reason }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to reverse expense');
      setMessage('Expense reversed in General Ledger.');
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to reverse expense');
    }
  };

  const handleExportExcel = async () => {
    await downloadExcel({
      filename: 'operating-expenses',
      sheetName: 'Expenses',
      headers: [
        'Expense No',
        'Date',
        'Category',
        'Account',
        'Payee',
        'Description',
        'Mode',
        'Method',
        'Amount (BDT)',
        'Status',
      ],
      rows: filtered.map((e) => [
        e.expenseNo,
        formatDateDMY(e.date),
        e.categoryName,
        e.accountCode,
        e.payeeName || '-',
        e.description,
        e.paymentStatus,
        e.paymentMethod,
        paisaToTaka(e.amountPaisa),
        e.status,
      ]),
    });
  };

  const handlePrint = () => {
    printTableReport({
      title: 'Operating Expenses Register',
      subtitle: 'CodeZenX ERP — Accounts Module',
      headers: ['Expense No', 'Date', 'Category', 'Payee', 'Description', 'Mode', 'Amount (BDT)', 'Status'],
      rows: filtered.map((e) => [
        e.expenseNo,
        formatDateDMY(e.date),
        e.categoryName,
        e.payeeName || '-',
        e.description,
        `${e.paymentStatus} (${e.paymentMethod})`,
        formatPaisaBDT(e.amountPaisa),
        e.status,
      ]),
      rightAlignCols: [6],
      landscape: true,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ReceiptText className="w-5 h-5 text-emerald-600" />
            Operating Expenses
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Record Paid, Unpaid (creates Vendor Bill), and Prepaid operating expenses with instant GL posting.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {canWrite && (
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Plus className="w-3.5 h-3.5" /> Record Expense
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-[11px] uppercase font-semibold text-slate-500">Total Posted Expenses</div>
          <div className="text-lg font-bold text-slate-900 mt-1">{formatPaisaBDT(totals.postedTotal)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-[11px] uppercase font-semibold text-slate-500">Paid / Prepaid</div>
          <div className="text-lg font-bold text-emerald-700 mt-1">{formatPaisaBDT(totals.paidTotal)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-[11px] uppercase font-semibold text-slate-500">Unpaid (Billed)</div>
          <div className="text-lg font-bold text-amber-700 mt-1">{formatPaisaBDT(totals.unpaidTotal)}</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search expense no, payee, category, description..."
          totalCount={expenses.length}
          filteredCount={filtered.length}
          sortKey={sortKey}
          sortDir={sortDir}
          sortOptions={[
            { value: 'date', label: 'Date' },
            { value: 'expenseNo', label: 'Expense No' },
            { value: 'amountPaisa', label: 'Amount' },
          ]}
          onSortChange={(k, d) => {
            setSortKey(k);
            setSortDir(d);
          }}
          hasActiveFilters={
            categoryFilter !== 'All' ||
            payStatusFilter !== 'All' ||
            statusFilter !== 'All' ||
            Boolean(search)
          }
          onReset={() => {
            setSearch('');
            setCategoryFilter('All');
            setPayStatusFilter('All');
            setStatusFilter('All');
          }}
          onExportExcel={handleExportExcel}
          onPrint={handlePrint}
          filters={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
              >
                <option value="All">All Categories</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.accountCode} · {c.name}
                  </option>
                ))}
              </select>
              <select
                value={payStatusFilter}
                onChange={(e) => setPayStatusFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
              >
                <option value="All">All Payment Modes</option>
                <option value="Paid">Paid</option>
                <option value="Unpaid">Unpaid</option>
                <option value="Prepaid">Prepaid</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
              >
                <option value="All">All Status</option>
                <option value="Posted">Posted</option>
                <option value="Reversed">Reversed</option>
              </select>
            </div>
          }
        />

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                <th className="py-2.5 px-2">Expense No</th>
                <th className="py-2.5 px-2">Date</th>
                <th className="py-2.5 px-2">Category</th>
                <th className="py-2.5 px-2">Payee & Description</th>
                <th className="py-2.5 px-2">Payment Mode</th>
                <th className="py-2.5 px-2 text-right">Amount</th>
                <th className="py-2.5 px-2">Status</th>
                {isAdmin && <th className="py-2.5 px-2 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Loading expenses...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No expenses found.
                  </td>
                </tr>
              ) : (
                filtered.map((e) => (
                  <tr key={e._id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-2 font-mono font-semibold text-slate-800">
                      {e.expenseNo}
                    </td>
                    <td className="py-2.5 px-2 text-slate-600">{formatDateDMY(e.date)}</td>
                    <td className="py-2.5 px-2">
                      <span className="font-medium text-slate-800">{e.categoryName}</span>
                      <div className="text-[10px] text-slate-400">COA {e.accountCode}</div>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="font-medium text-slate-900">{e.description}</div>
                      <div className="text-[11px] text-slate-500">
                        {e.payeeName || 'No payee'} {e.reference ? `· Ref: ${e.reference}` : ''}
                        {e.attachmentUrl && (
                          <>
                            {' · '}
                            <a
                              href={e.attachmentUrl}
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
                    <td className="py-2.5 px-2">
                      <Badge
                        variant={
                          e.paymentStatus === 'Paid'
                            ? 'success'
                            : e.paymentStatus === 'Unpaid'
                            ? 'warning'
                            : 'info'
                        }
                      >
                        {e.paymentStatus}
                      </Badge>
                      <span className="ml-1.5 text-[11px] text-slate-500">{e.paymentMethod}</span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-semibold text-slate-900">
                      {formatPaisaBDT(e.amountPaisa)}
                    </td>
                    <td className="py-2.5 px-2">
                      <Badge variant={e.status === 'Posted' ? 'success' : 'warning'}>
                        {e.status}
                      </Badge>
                    </td>
                    {isAdmin && (
                      <td className="py-2.5 px-2 text-right">
                        {e.status === 'Posted' && (
                          <button
                            onClick={() => handleReverse(e._id)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
                          >
                            <RotateCcw className="w-3 h-3" /> Reverse
                          </button>
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

      {/* Add Expense Modal */}
      <Modal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        title="Record Operating Expense"
        maxWidth="lg"
      >
        <form onSubmit={handleCreate} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Date *</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Category *</label>
              <select
                required
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
              >
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.accountCode} · {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Amount (BDT) *</label>
              <input
                type="number"
                step="0.01"
                min="1"
                required
                value={form.amountTaka}
                onChange={(e) => setForm({ ...form, amountTaka: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Payee / Vendor Name</label>
              <input
                value={form.payeeName}
                onChange={(e) => setForm({ ...form, payeeName: e.target.value })}
                placeholder="e.g., DESCO, Titas Gas, Landlord"
                className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Description *</label>
              <input
                required
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g., October electricity bill for training lab"
                className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Payment Status *</label>
              <select
                value={form.paymentStatus}
                onChange={(e) =>
                  setForm({
                    ...form,
                    paymentStatus: e.target.value as 'Paid' | 'Unpaid' | 'Prepaid',
                  })
                }
                className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
              >
                <option value="Paid">Paid Now (Dr Expense / Cr Cash/Bank)</option>
                <option value="Unpaid">Unpaid / On Credit (Creates Vendor Bill)</option>
                <option value="Prepaid">Prepaid / Advance (Dr 1230 Prepayments)</option>
              </select>
            </div>
            {form.paymentStatus !== 'Unpaid' && (
              <div>
                <label className="block font-medium text-slate-700 mb-1">Payment Method</label>
                <select
                  value={form.paymentMethod}
                  onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank">Bank</option>
                  <option value="Cheque">Cheque</option>
                  <option value="bKash">bKash</option>
                  <option value="Nagad">Nagad</option>
                </select>
              </div>
            )}
            <div>
              <label className="block font-medium text-slate-700 mb-1">Reference / Invoice No</label>
              <input
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-2"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Department</label>
              <select
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
              >
                <option value="General">General</option>
                {EMPLOYEE_DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <DocumentUploadField
                label="Supporting Document (Optional)"
                value={form.attachmentUrl}
                onChange={(url) => setForm({ ...form, attachmentUrl: url })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-medium disabled:opacity-50"
            >
              {submitting ? 'Posting...' : 'Post Expense'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

