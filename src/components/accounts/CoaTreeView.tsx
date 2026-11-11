'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Plus,
  RefreshCw,
  Edit3,
  Archive,
  ChevronRight,
  ChevronDown,
  BookMarked,
  CheckCircle2,
  AlertCircle,
  Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/components/layout/DashboardLayout';
import { formatPaisaBDT } from '@/lib/accounts-money';

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'] as const;

export function CoaTreeView() {
  const { user } = useAuth();
  const role = user?.role || 'Viewer';
  const canAccess = ['Admin', 'Accountant', 'Viewer'].includes(role);
  const canWrite = ['Admin', 'Accountant'].includes(role);
  const isAdmin = role === 'Admin';

  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({
    code: '',
    name: '',
    type: 'Expense' as (typeof ACCOUNT_TYPES)[number],
    parentId: '',
    isGroup: false,
    description: '',
    active: true,
  });
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState('');

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/coa?includeInactive=${showInactive ? 'true' : 'false'}`);
      const json = await res.json();
      if (json.success) setAccounts(json.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, showInactive]);

  const groupAccounts = useMemo(
    () => accounts.filter((a) => a.isGroup && (!form.type || a.type === form.type)),
    [accounts, form.type]
  );

  // Build ordered hierarchical display rows with group rollups
  const treeRows = useMemo(() => {
    const byId = new Map<string, any>();
    const childrenMap = new Map<string, any[]>();
    for (const a of accounts) {
      byId.set(a._id, a);
      const pk = a.parentId || 'ROOT';
      if (!childrenMap.has(pk)) childrenMap.set(pk, []);
      childrenMap.get(pk)!.push(a);
    }

    const computeGroupBalance = (acc: any): number => {
      if (!acc.isGroup) return acc.balancePaisa || 0;
      const kids = childrenMap.get(acc._id) || [];
      return kids.reduce((s, k) => s + computeGroupBalance(k), 0);
    };

    const result: Array<{ acc: any; depth: number; rollupBalancePaisa: number }> = [];
    const walk = (parentId: string, depth: number) => {
      const kids = (childrenMap.get(parentId) || []).sort((a, b) => a.code.localeCompare(b.code));
      for (const k of kids) {
        if (typeFilter !== 'all' && k.type !== typeFilter) continue;
        result.push({ acc: k, depth, rollupBalancePaisa: computeGroupBalance(k) });
        if (k.isGroup && !collapsed[k._id]) {
          walk(k._id, depth + 1);
        }
      }
    };
    walk('ROOT', 0);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return result.filter(
        (r) =>
          r.acc.code.toLowerCase().includes(q) ||
          r.acc.name.toLowerCase().includes(q) ||
          (r.acc.systemTag || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [accounts, collapsed, search, typeFilter]);

  if (!canAccess) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-600">
        Your role ({role}) does not have access to Accounts.
      </div>
    );
  }

  const openCreate = (parent?: any) => {
    setEditing(null);
    setModalErr('');
    setForm({
      code: '',
      name: '',
      type: parent?.type || 'Expense',
      parentId: parent?._id || '',
      isGroup: false,
      description: '',
      active: true,
    });
    setIsModalOpen(true);
  };

  const openEdit = (acc: any) => {
    setEditing(acc);
    setModalErr('');
    setForm({
      code: acc.code,
      name: acc.name,
      type: acc.type,
      parentId: acc.parentId || '',
      isGroup: acc.isGroup,
      description: acc.description || '',
      active: acc.active,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setModalErr('');
    try {
      const url = editing ? `/api/accounts/coa/${editing._id}` : '/api/accounts/coa';
      const method = editing ? 'PATCH' : 'POST';
      const body = editing
        ? {
            name: form.name,
            parentId: form.parentId || null,
            description: form.description,
            active: form.active,
          }
        : {
            code: form.code,
            name: form.name,
            type: form.type,
            parentId: form.parentId || null,
            isGroup: form.isGroup,
            description: form.description,
            active: form.active,
          };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Save failed');

      setIsModalOpen(false);
      setBanner({ type: 'ok', msg: json.message });
      loadAccounts();
    } catch (err: any) {
      setModalErr(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (acc: any) => {
    if (!confirm(`Archive account ${acc.code} - ${acc.name}?`)) return;
    setBanner(null);
    try {
      const res = await fetch(`/api/accounts/coa/${acc._id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Archive failed');
      setBanner({ type: 'ok', msg: json.message });
      loadAccounts();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    }
  };

  const typeBadge = (t: string) => {
    switch (t) {
      case 'Asset':
        return <Badge variant="info">Asset</Badge>;
      case 'Liability':
        return <Badge variant="warning">Liability</Badge>;
      case 'Equity':
        return <Badge variant="purple">Equity</Badge>;
      case 'Income':
        return <Badge variant="success">Income</Badge>;
      default:
        return <Badge variant="danger">Expense</Badge>;
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-emerald-700" />
            <span>Chart of Accounts</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manpower agency account tree with integer-paisa live ledger balances.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canWrite && (
            <button
              type="button"
              onClick={() => openCreate()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>New Account</span>
            </button>
          )}
          <button
            type="button"
            onClick={loadAccounts}
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
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
          >
            <option value="all">All Types</option>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          <span>Show inactive</span>
        </label>
      </div>

      {/* Tree Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Code &amp; Account Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Normal</th>
                <th className="px-4 py-3 text-right">Balance (BDT)</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Loading Chart of Accounts...
                  </td>
                </tr>
              ) : treeRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No matching accounts.
                  </td>
                </tr>
              ) : (
                treeRows.map(({ acc, depth, rollupBalancePaisa }) => (
                  <tr
                    key={acc._id}
                    className={`${acc.isGroup ? 'bg-slate-50/70 font-semibold' : 'hover:bg-slate-50/60'}`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5" style={{ paddingLeft: `${depth * 20}px` }}>
                        {acc.isGroup ? (
                          <button
                            type="button"
                            onClick={() =>
                              setCollapsed((prev) => ({ ...prev, [acc._id]: !prev[acc._id] }))
                            }
                            className="p-0.5 text-slate-500 hover:text-slate-900"
                          >
                            {collapsed[acc._id] ? (
                              <ChevronRight className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        ) : (
                          <span className="w-4 inline-block" />
                        )}
                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                          {acc.code}
                        </span>
                        <span className="text-slate-900">{acc.name}</span>
                        {acc.isGroup && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-600">
                            Group
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">{typeBadge(acc.type)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{acc.normalBalance}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900">
                      {formatPaisaBDT(rollupBalancePaisa)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {acc.active ? <Badge variant="success">Active</Badge> : <Badge variant="gray">Inactive</Badge>}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        {!acc.isGroup && (
                          <Link
                            href={`/accounts/ledger?accountId=${acc._id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
                          >
                            <BookMarked className="w-3 h-3" /> Ledger
                          </Link>
                        )}
                        {canWrite && acc.isGroup && (
                          <button
                            type="button"
                            onClick={() => openCreate(acc)}
                            className="px-2 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100"
                          >
                            + Child
                          </button>
                        )}
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => openEdit(acc)}
                            className="p-1 text-slate-500 hover:text-slate-900"
                            title="Edit Account"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isAdmin && !acc.systemTag && (
                          <button
                            type="button"
                            onClick={() => handleArchive(acc)}
                            className="p-1 text-rose-500 hover:text-rose-700"
                            title="Archive (Soft Delete)"
                          >
                            <Archive className="w-3.5 h-3.5" />
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

      {/* Add / Edit Account Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editing ? `Edit Account ${editing.code}` : 'New Chart of Accounts Entry'}
        maxWidth="md"
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {modalErr && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium">
              {modalErr}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Account Code *</label>
              <input
                type="text"
                required
                disabled={Boolean(editing)}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="e.g. 5250"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Account Type *</label>
              <select
                disabled={Boolean(editing)}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as any, parentId: '' })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Account Name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Dhaka Bank Operating Account"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Parent Group</label>
            <select
              value={form.parentId}
              onChange={(e) => setForm({ ...form, parentId: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            >
              <option value="">None (Top Level)</option>
              {groupAccounts
                .filter((g) => g._id !== editing?._id)
                .map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.code} — {g.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex items-center gap-6">
            {!editing && (
              <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isGroup}
                  onChange={(e) => setForm({ ...form, isGroup: e.target.checked })}
                />
                <span>Group header (non-posting)</span>
              </label>
            )}
            <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              <span>Active</span>
            </label>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
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
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Account'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

