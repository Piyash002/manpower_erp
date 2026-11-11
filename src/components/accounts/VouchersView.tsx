'use client';

import React, { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Trash2,
  Send,
  Eye,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/components/layout/DashboardLayout';
import { EMPLOYEE_DEPARTMENTS, formatDateDMY } from '@/lib/formatters';
import { formatPaisaBDT, paisaToTaka, takaToPaisa } from '@/lib/accounts-money';

const JOURNAL_TYPES = [
  { code: 'JV', label: 'JV — Journal Voucher' },
  { code: 'RV', label: 'RV — Receipt Voucher' },
  { code: 'PV', label: 'PV — Payment Voucher' },
  { code: 'CV', label: 'CV — Contra Voucher' },
] as const;

interface DraftLineRow {
  accountId: string;
  description: string;
  debitTaka: string;
  creditTaka: string;
  branch: string;
  department: string;
}

export function VouchersView() {
  const { user } = useAuth();
  const role = user?.role || 'Viewer';
  const canAccess = ['Admin', 'Accountant', 'Viewer'].includes(role);
  const canWrite = ['Admin', 'Accountant'].includes(role);
  const isAdmin = role === 'Admin';

  const [entries, setEntries] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Create / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formHeader, setFormHeader] = useState({
    journalType: 'JV' as 'JV' | 'RV' | 'PV' | 'CV',
    entryDate: new Date().toISOString().split('T')[0],
    description: '',
    reference: '',
  });
  const [formLines, setFormLines] = useState<DraftLineRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState('');

  // Drawer & Reverse Modal
  const [drawerEntry, setDrawerEntry] = useState<any | null>(null);
  const [reverseTarget, setReverseTarget] = useState<any | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (typeFilter !== 'all') qs.set('journalType', typeFilter);
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (search.trim()) qs.set('search', search.trim());

      const [eRes, cRes] = await Promise.all([
        fetch(`/api/accounts/entries?${qs.toString()}`),
        fetch('/api/accounts/coa?leafOnly=true'),
      ]);
      const [eJson, cJson] = await Promise.all([eRes.json(), cRes.json()]);
      if (eJson.success) setEntries(eJson.data?.entries || []);
      if (cJson.success) setAccounts(cJson.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, typeFilter, statusFilter]);

  if (!canAccess) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-600">
        Your role ({role}) does not have access to Accounts.
      </div>
    );
  }

  const makeBlankLines = (): DraftLineRow[] => [
    {
      accountId: accounts[0]?._id || '',
      description: '',
      debitTaka: '',
      creditTaka: '',
      branch: 'Main',
      department: 'General',
    },
    {
      accountId: accounts[1]?._id || accounts[0]?._id || '',
      description: '',
      debitTaka: '',
      creditTaka: '',
      branch: 'Main',
      department: 'General',
    },
  ];

  const openNewModal = () => {
    setEditingId(null);
    setModalErr('');
    setFormHeader({
      journalType: 'JV',
      entryDate: new Date().toISOString().split('T')[0],
      description: '',
      reference: '',
    });
    setFormLines(makeBlankLines());
    setIsModalOpen(true);
  };

  const openEditDraftModal = (entry: any) => {
    setEditingId(entry._id);
    setModalErr('');
    setFormHeader({
      journalType: entry.journalType,
      entryDate: entry.entryDate ? String(entry.entryDate).split('T')[0] : new Date().toISOString().split('T')[0],
      description: entry.description || '',
      reference: entry.reference || '',
    });
    setFormLines(
      (entry.lines || []).map((l: any) => ({
        accountId: l.accountId?._id || l.accountId,
        description: l.description || '',
        debitTaka: l.debitPaisa > 0 ? String(paisaToTaka(l.debitPaisa)) : '',
        creditTaka: l.creditPaisa > 0 ? String(paisaToTaka(l.creditPaisa)) : '',
        branch: l.branch || 'Main',
        department: l.department || 'General',
      }))
    );
    setIsModalOpen(true);
  };

  const totalDrPaisa = formLines.reduce((s, l) => s + takaToPaisa(l.debitTaka), 0);
  const totalCrPaisa = formLines.reduce((s, l) => s + takaToPaisa(l.creditTaka), 0);
  const diffPaisa = totalDrPaisa - totalCrPaisa;

  const submitVoucher = async (postImmediately: boolean) => {
    setSaving(true);
    setModalErr('');
    setBanner(null);
    try {
      const lines = formLines.map((l) => ({
        accountId: l.accountId,
        description: l.description,
        debitPaisa: takaToPaisa(l.debitTaka),
        creditPaisa: takaToPaisa(l.creditTaka),
        branch: l.branch || 'Main',
        department: l.department || 'General',
      }));

      let res: Response;
      if (editingId) {
        res = await fetch(`/api/accounts/entries/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_draft',
            entryDate: formHeader.entryDate,
            description: formHeader.description,
            reference: formHeader.reference,
            lines,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || 'Update failed');

        if (postImmediately) {
          const postRes = await fetch(`/api/accounts/entries/${editingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'post' }),
          });
          const postJson = await postRes.json();
          if (!postRes.ok || !postJson.success) throw new Error(postJson.message || 'Post failed');
        }
      } else {
        res = await fetch('/api/accounts/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            journalType: formHeader.journalType,
            entryDate: formHeader.entryDate,
            description: formHeader.description,
            reference: formHeader.reference,
            postImmediately,
            lines,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || 'Failed to save voucher');
      }

      setIsModalOpen(false);
      setBanner({
        type: 'ok',
        msg: postImmediately ? 'Voucher posted cleanly.' : 'Draft voucher saved.',
      });
      loadData();
    } catch (err: any) {
      setModalErr(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePostDraft = async (entry: any) => {
    setBanner(null);
    try {
      const res = await fetch(`/api/accounts/entries/${entry._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'post' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Post failed');
      setBanner({ type: 'ok', msg: json.message });
      if (drawerEntry?._id === entry._id) setDrawerEntry(null);
      loadData();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    }
  };

  const handleDeleteDraft = async (entry: any) => {
    if (!confirm(`Archive Draft voucher ${entry.voucherNo}?`)) return;
    setBanner(null);
    try {
      const res = await fetch(`/api/accounts/entries/${entry._id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Archive failed');
      setBanner({ type: 'ok', msg: json.message });
      if (drawerEntry?._id === entry._id) setDrawerEntry(null);
      loadData();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    }
  };

  const handleConfirmReverse = async () => {
    if (!reverseTarget) return;
    setSaving(true);
    setModalErr('');
    try {
      const res = await fetch(`/api/accounts/entries/${reverseTarget._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reverse', reason: reverseReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Reversal failed');
      setReverseTarget(null);
      setReverseReason('');
      setDrawerEntry(null);
      setBanner({ type: 'ok', msg: json.message });
      loadData();
    } catch (err: any) {
      setModalErr(err.message);
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (s: string) => {
    if (s === 'Posted') return <Badge variant="success">Posted</Badge>;
    if (s === 'Reversed') return <Badge variant="danger">Reversed</Badge>;
    return <Badge variant="warning">Draft</Badge>;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-emerald-700" />
            <span>Journal Vouchers</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Double-entry vouchers (JV, RV, PV, CV). Posted entries are immutable and corrected only via reversal.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canWrite && (
            <button
              type="button"
              onClick={openNewModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>New Voucher</span>
            </button>
          )}
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
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

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center gap-2.5">
        <input
          type="text"
          placeholder="Search voucher no, description, reference..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadData()}
          className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg min-w-[220px] flex-1 max-w-xs"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
        >
          <option value="all">All Types</option>
          {JOURNAL_TYPES.map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
        >
          <option value="all">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Posted">Posted</option>
          <option value="Reversed">Reversed</option>
        </select>
        <button
          type="button"
          onClick={loadData}
          className="px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg"
        >
          Apply
        </button>
      </div>

      {/* Vouchers Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Voucher No</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Description &amp; Reference</th>
                <th className="px-4 py-3 text-right">Amount (BDT)</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Loading vouchers...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No vouchers found. Click &quot;New Voucher&quot; to create one.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {entry.voucherNo}
                      {entry.isReversal && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                          REV
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">
                      {formatDateDMY(entry.entryDate)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="gray">{entry.journalType}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-800">{entry.description}</p>
                      {entry.reference && (
                        <p className="text-[11px] text-slate-400">Ref: {entry.reference}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900">
                      {formatPaisaBDT(entry.totalDebitPaisa)}
                    </td>
                    <td className="px-4 py-2.5 text-center">{statusBadge(entry.status)}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setDrawerEntry(entry)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-white border border-slate-300 rounded hover:bg-slate-50"
                        >
                          <Eye className="w-3 h-3" /> View
                        </button>
                        {canWrite && entry.status === 'Draft' && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditDraftModal(entry)}
                              className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 rounded hover:bg-slate-200"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePostDraft(entry)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-emerald-600 rounded hover:bg-emerald-700"
                            >
                              <Send className="w-3 h-3" /> Post
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDraft(entry)}
                              className="p-1 text-rose-500 hover:text-rose-700"
                              title="Soft Delete Draft"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {isAdmin && entry.status === 'Posted' && !entry.isReversal && (
                          <button
                            type="button"
                            onClick={() => {
                              setModalErr('');
                              setReverseReason('');
                              setReverseTarget(entry);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded hover:bg-rose-100"
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

      {/* Create / Edit Voucher Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Draft Voucher' : 'New Double-Entry Voucher'}
        maxWidth="4xl"
      >
        <div className="space-y-4 text-xs">
          {modalErr && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium">
              {modalErr}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Journal Type *</label>
              <select
                disabled={Boolean(editingId)}
                value={formHeader.journalType}
                onChange={(e) => setFormHeader({ ...formHeader, journalType: e.target.value as any })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
              >
                {JOURNAL_TYPES.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Entry Date *</label>
              <input
                type="date"
                value={formHeader.entryDate}
                onChange={(e) => setFormHeader({ ...formHeader, entryDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Reference</label>
              <input
                type="text"
                placeholder="Cheque / Ref / Invoice"
                value={formHeader.reference}
                onChange={(e) => setFormHeader({ ...formHeader, reference: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Narration / Description *</label>
            <input
              type="text"
              required
              placeholder="Explain the accounting transaction..."
              value={formHeader.description}
              onChange={(e) => setFormHeader({ ...formHeader, description: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          {/* Lines Grid */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase">
                <tr>
                  <th className="px-2.5 py-2">Account *</th>
                  <th className="px-2.5 py-2">Line Note</th>
                  <th className="px-2.5 py-2">Branch / Dept</th>
                  <th className="px-2.5 py-2 text-right">Debit (৳)</th>
                  <th className="px-2.5 py-2 text-right">Credit (৳)</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {formLines.map((row, idx) => (
                  <tr key={idx}>
                    <td className="px-2 py-2 min-w-[200px]">
                      <select
                        value={row.accountId}
                        onChange={(e) => {
                          const next = [...formLines];
                          next[idx].accountId = e.target.value;
                          setFormLines(next);
                        }}
                        className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md"
                      >
                        {accounts.map((a) => (
                          <option key={a._id} value={a._id}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) => {
                          const next = [...formLines];
                          next[idx].description = e.target.value;
                          setFormLines(next);
                        }}
                        placeholder="Optional memo"
                        className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={row.branch}
                          onChange={(e) => {
                            const next = [...formLines];
                            next[idx].branch = e.target.value;
                            setFormLines(next);
                          }}
                          className="w-20 px-2 py-1.5 text-xs border border-slate-300 rounded-md"
                          placeholder="Main"
                        />
                        <select
                          value={row.department}
                          onChange={(e) => {
                            const next = [...formLines];
                            next[idx].department = e.target.value;
                            setFormLines(next);
                          }}
                          className="w-24 px-1.5 py-1.5 text-xs border border-slate-300 rounded-md"
                        >
                          <option value="General">General</option>
                          {EMPLOYEE_DEPARTMENTS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-2 py-2 w-28">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={row.debitTaka}
                        onChange={(e) => {
                          const next = [...formLines];
                          next[idx].debitTaka = e.target.value;
                          if (Number(e.target.value) > 0) next[idx].creditTaka = '';
                          setFormLines(next);
                        }}
                        placeholder="0.00"
                        className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md text-right font-mono"
                      />
                    </td>
                    <td className="px-2 py-2 w-28">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={row.creditTaka}
                        onChange={(e) => {
                          const next = [...formLines];
                          next[idx].creditTaka = e.target.value;
                          if (Number(e.target.value) > 0) next[idx].debitTaka = '';
                          setFormLines(next);
                        }}
                        placeholder="0.00"
                        className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md text-right font-mono"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      {formLines.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setFormLines(formLines.filter((_, i) => i !== idx))}
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

          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() =>
                setFormLines([
                  ...formLines,
                  {
                    accountId: accounts[0]?._id || '',
                    description: '',
                    debitTaka: '',
                    creditTaka: '',
                    branch: 'Main',
                    department: 'General',
                  },
                ])
              }
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
            >
              + Add Line
            </button>

            <div className="flex items-center gap-4 text-xs font-mono">
              <span>
                Dr: <strong className="text-slate-900">{formatPaisaBDT(totalDrPaisa)}</strong>
              </span>
              <span>
                Cr: <strong className="text-slate-900">{formatPaisaBDT(totalCrPaisa)}</strong>
              </span>
              {diffPaisa === 0 && totalDrPaisa > 0 ? (
                <Badge variant="success">Balanced ✓</Badge>
              ) : (
                <Badge variant="danger">Diff: {formatPaisaBDT(diffPaisa)}</Badge>
              )}
            </div>
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
              type="button"
              disabled={saving || diffPaisa !== 0 || totalDrPaisa <= 0}
              onClick={() => submitVoucher(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-200 hover:bg-slate-300 rounded-lg disabled:opacity-50"
            >
              Save as Draft
            </button>
            <button
              type="button"
              disabled={saving || diffPaisa !== 0 || totalDrPaisa <= 0}
              onClick={() => submitVoucher(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {saving ? 'Posting...' : 'Save & Post'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Voucher Detail Modal */}
      <Modal
        isOpen={Boolean(drawerEntry)}
        onClose={() => setDrawerEntry(null)}
        title={drawerEntry ? `Voucher ${drawerEntry.voucherNo}` : 'Voucher'}
        maxWidth="2xl"
      >
        {drawerEntry && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <div className="space-y-0.5">
                <p className="font-bold text-slate-900 text-sm">{drawerEntry.description}</p>
                <p className="text-slate-500">
                  Date: {formatDateDMY(drawerEntry.entryDate)} · Type: {drawerEntry.journalType} · Source: {drawerEntry.sourceModule}
                </p>
              </div>
              {statusBadge(drawerEntry.status)}
            </div>

            <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Dimension</th>
                  <th className="px-3 py-2">Memo</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(drawerEntry.lines || []).map((l: any) => (
                  <tr key={l._id}>
                    <td className="px-3 py-2 font-semibold text-slate-900">
                      {l.accountId?.code} — {l.accountId?.name}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {l.branch} · {l.department}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{l.description || '-'}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {l.debitPaisa > 0 ? formatPaisaBDT(l.debitPaisa) : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {l.creditPaisa > 0 ? formatPaisaBDT(l.creditPaisa) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 font-bold font-mono">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right">{formatPaisaBDT(drawerEntry.totalDebitPaisa)}</td>
                  <td className="px-3 py-2 text-right">{formatPaisaBDT(drawerEntry.totalCreditPaisa)}</td>
                </tr>
              </tfoot>
            </table>

            {drawerEntry.reversalReason && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">
                <strong>Reversal Reason:</strong> {drawerEntry.reversalReason}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Reverse Modal */}
      <Modal
        isOpen={Boolean(reverseTarget)}
        onClose={() => setReverseTarget(null)}
        title={`Reverse Posted Voucher ${reverseTarget?.voucherNo || ''}`}
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          {modalErr && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium">
              {modalErr}
            </div>
          )}
          <p className="text-slate-600">
            Posted vouchers are immutable. Reversing creates an equal and opposite mirror voucher with full audit trail.
          </p>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Mandatory Reversal Reason *</label>
            <textarea
              rows={3}
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="Explain why this voucher is being reversed..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setReverseTarget(null)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || reverseReason.trim().length < 3}
              onClick={handleConfirmReverse}
              className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
            >
              {saving ? 'Reversing...' : 'Confirm Reversal'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
