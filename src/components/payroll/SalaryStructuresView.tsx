'use client';

import React, { useEffect, useState } from 'react';
import {
  Layers,
  Plus,
  Edit3,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { formatBDT } from '@/lib/formatters';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { TableToolbar } from '@/components/ui/TableToolbar';
import {
  downloadExcel,
  matchesSearch,
  printTableReport,
  sortTableItems,
  type SortDir,
} from '@/lib/client-export';

export function SalaryStructuresView() {
  const [structures, setStructures] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [ruleSearch, setRuleSearch] = useState('');
  const [ruleCategoryFilter, setRuleCategoryFilter] = useState('all');
  const [ruleSortKey, setRuleSortKey] = useState('sequence');
  const [ruleSortDir, setRuleSortDir] = useState<SortDir>('asc');

  // Structure Modal
  const [isStructModalOpen, setIsStructModalOpen] = useState(false);
  const [editingStruct, setEditingStruct] = useState<any | null>(null);
  const [structForm, setStructForm] = useState({
    name: '',
    code: '',
    description: '',
    active: true,
    seedDefaultRules: true,
  });

  // Rule Modal
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [ruleForm, setRuleForm] = useState({
    name: '',
    code: '',
    category: 'ALLOWANCE',
    type: 'percentage_of_basic',
    amount_or_percentage: '0',
    formula: '',
    sequence: '50',
    active: true,
  });

  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const loadStructures = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/payroll/structures');
      const json = await res.json();
      if (json.success) {
        const list = json.data || [];
        setStructures(list);
        if (!selectedId && list.length > 0) {
          setSelectedId(list[0]._id);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStructures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedStruct = structures.find((s) => s._id === selectedId) || structures[0] || null;

  const openCreateStruct = () => {
    setEditingStruct(null);
    setStructForm({
      name: '',
      code: '',
      description: '',
      active: true,
      seedDefaultRules: true,
    });
    setModalError('');
    setIsStructModalOpen(true);
  };

  const openEditStruct = (s: any) => {
    setEditingStruct(s);
    setStructForm({
      name: s.name,
      code: s.code,
      description: s.description || '',
      active: s.active,
      seedDefaultRules: false,
    });
    setModalError('');
    setIsStructModalOpen(true);
  };

  const handleStructSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError('');
    try {
      const url = editingStruct
        ? `/api/payroll/structures/${editingStruct._id}`
        : '/api/payroll/structures';
      const method = editingStruct ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(structForm),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to save structure');
      setIsStructModalOpen(false);
      setBanner({ type: 'ok', msg: json.message });
      if (!editingStruct && json.data?._id) setSelectedId(json.data._id);
      loadStructures();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openCreateRule = () => {
    setEditingRule(null);
    setRuleForm({
      name: '',
      code: '',
      category: 'ALLOWANCE',
      type: 'fixed',
      amount_or_percentage: '0',
      formula: '',
      sequence: '55',
      active: true,
    });
    setModalError('');
    setIsRuleModalOpen(true);
  };

  const openEditRule = (r: any) => {
    setEditingRule(r);
    setRuleForm({
      name: r.name,
      code: r.code,
      category: r.category,
      type: r.type,
      amount_or_percentage: String(r.amount_or_percentage ?? 0),
      formula: r.formula || '',
      sequence: String(r.sequence ?? 10),
      active: r.active,
    });
    setModalError('');
    setIsRuleModalOpen(true);
  };

  const handleRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStruct) return;
    setSubmitting(true);
    setModalError('');
    try {
      const url = editingRule ? `/api/payroll/rules/${editingRule._id}` : '/api/payroll/rules';
      const method = editingRule ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...ruleForm,
          structure_id: selectedStruct._id,
          amount_or_percentage: Number(ruleForm.amount_or_percentage) || 0,
          sequence: Number(ruleForm.sequence) || 10,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to save rule');
      setIsRuleModalOpen(false);
      setBanner({ type: 'ok', msg: json.message });
      loadStructures();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRule = async (ruleId: string, name: string) => {
    if (!confirm(`Delete salary rule "${name}"?`)) return;
    const res = await fetch(`/api/payroll/rules/${ruleId}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setBanner({ type: 'err', msg: json.message || 'Delete failed' });
      return;
    }
    loadStructures();
  };

  const getCategoryVariant = (cat: string) => {
    switch (cat) {
      case 'BASIC':
        return 'info';
      case 'ALLOWANCE':
        return 'success';
      case 'GROSS':
        return 'purple';
      case 'DEDUCTION':
        return 'danger';
      case 'NET':
        return 'default';
      default:
        return 'gray';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Salary Structures &amp; Rules
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure Odoo-style ordered salary rules (Fixed, % of Basic, or Formula-driven).
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateStruct}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Salary Structure</span>
        </button>
      </div>

      {banner && (
        <div
          className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 border ${
            banner.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {banner.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{banner.msg}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
          <RefreshCw className="w-7 h-7 animate-spin text-emerald-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500">Loading salary structures...</p>
        </div>
      ) : structures.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center space-y-2.5">
          <Layers className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="font-semibold text-slate-700">No salary structures configured yet</p>
          <p className="text-xs text-slate-400">
            Create a salary structure first, then assign contracts to active employees.
          </p>
          <button
            type="button"
            onClick={openCreateStruct}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" /> Create Salary Structure
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Structures List */}
          <div className="lg:col-span-4 space-y-2.5">
            {structures.map((s) => {
              const active = selectedStruct?._id === s._id;
              return (
                <div
                  key={s._id}
                  onClick={() => setSelectedId(s._id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    active
                      ? 'bg-emerald-50/50 border-emerald-500 ring-1 ring-emerald-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <Layers className="w-4 h-4 text-emerald-600" />
                        <span>{s.name}</span>
                      </h3>
                      <span className="text-[11px] font-mono text-slate-500">{s.code}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={s.active ? 'success' : 'gray'}>
                        {s.active ? 'Active' : 'Inactive'}
                      </Badge>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditStruct(s);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {s.description && (
                    <p className="text-xs text-slate-500 mt-2 line-clamp-2">{s.description}</p>
                  )}
                  <p className="text-[11px] font-semibold text-slate-600 mt-2">
                    {(s.rules || []).length} Salary Rules
                  </p>
                </div>
              );
            })}
          </div>

          {/* Rules Table */}
          <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {selectedStruct && (() => {
              const allRules: any[] = selectedStruct.rules || [];
              const filteredRules = allRules.filter((r) => {
                if (ruleCategoryFilter !== 'all' && r.category !== ruleCategoryFilter) return false;
                return matchesSearch(ruleSearch, [r.name, r.code, r.category, r.type, r.formula]);
              });
              const sortedRules = sortTableItems(filteredRules, ruleSortKey, ruleSortDir, {
                sequence: (r) => Number(r.sequence || 0),
                name: (r) => r.name || '',
                code: (r) => r.code || '',
                category: (r) => r.category || '',
              });
              const headers = ['Seq', 'Rule Name', 'Code', 'Category', 'Type', 'Value / Formula', 'Active'];
              const rows = sortedRules.map((r) => [
                r.sequence,
                r.name,
                r.code,
                r.category,
                r.type,
                r.type === 'formula' ? r.formula : r.amount_or_percentage,
                r.active ? 'Yes' : 'Off',
              ]);

              return (
              <>
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
                  <div>
                    <h2 className="font-bold text-slate-900 text-base">
                      {selectedStruct.name} — Salary Rules
                    </h2>
                    <p className="text-xs text-slate-500">
                      Evaluated sequentially in ascending Sequence order.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openCreateRule}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Rule</span>
                  </button>
                </div>

                <div className="p-3 border-b border-slate-200 bg-slate-50/30">
                  <TableToolbar
                    search={ruleSearch}
                    onSearchChange={setRuleSearch}
                    searchPlaceholder="Search rule name, code, formula..."
                    filters={
                      <select
                        value={ruleCategoryFilter}
                        onChange={(e) => setRuleCategoryFilter(e.target.value)}
                        className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
                      >
                        <option value="all">All Categories</option>
                        <option value="BASIC">BASIC</option>
                        <option value="ALLOWANCE">ALLOWANCE</option>
                        <option value="GROSS">GROSS</option>
                        <option value="DEDUCTION">DEDUCTION</option>
                        <option value="NET">NET</option>
                      </select>
                    }
                    sortKey={ruleSortKey}
                    sortDir={ruleSortDir}
                    sortOptions={[
                      { value: 'sequence', label: 'Sequence' },
                      { value: 'name', label: 'Rule Name' },
                      { value: 'code', label: 'Code' },
                      { value: 'category', label: 'Category' },
                    ]}
                    onSortChange={(k, d) => {
                      setRuleSortKey(k);
                      setRuleSortDir(d);
                    }}
                    totalCount={allRules.length}
                    filteredCount={sortedRules.length}
                    hasActiveFilters={ruleCategoryFilter !== 'all'}
                    onReset={() => {
                      setRuleSearch('');
                      setRuleCategoryFilter('all');
                    }}
                    onExportExcel={() =>
                      downloadExcel({
                        filename: `salary-rules-${selectedStruct.code}`,
                        sheetName: selectedStruct.code,
                        headers,
                        rows,
                      })
                    }
                    onPrint={() =>
                      printTableReport({
                        title: `${selectedStruct.name} — Salary Rules`,
                        subtitle: `Structure Code: ${selectedStruct.code}`,
                        headers,
                        rows,
                      })
                    }
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-2.5">Seq</th>
                        <th className="px-4 py-2.5">Rule &amp; Code</th>
                        <th className="px-4 py-2.5">Category</th>
                        <th className="px-4 py-2.5">Computation</th>
                        <th className="px-4 py-2.5 text-center">Active</th>
                        <th className="px-4 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedRules.map((rule: any) => (
                        <tr key={rule._id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">
                            {rule.sequence}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-semibold text-slate-900 text-xs">{rule.name}</div>
                            <span className="font-mono text-[11px] text-slate-500">
                              {rule.code}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Badge variant={getCategoryVariant(rule.category) as any}>
                              {rule.category}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-slate-700">
                            {rule.type === 'fixed' && (
                              <span>Fixed: {formatBDT(rule.amount_or_percentage)}</span>
                            )}
                            {rule.type === 'percentage_of_basic' && (
                              <span>{rule.amount_or_percentage}% of BASIC</span>
                            )}
                            {rule.type === 'formula' && (
                              <span className="text-[11px] text-purple-700 break-all">
                                {rule.formula}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant={rule.active ? 'success' : 'gray'}>
                              {rule.active ? 'Yes' : 'Off'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditRule(rule)}
                                className="p-1.5 text-slate-500 hover:text-blue-600 rounded"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRule(rule._id, rule.name)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Structure Modal */}
      <Modal
        isOpen={isStructModalOpen}
        onClose={() => setIsStructModalOpen(false)}
        title={editingStruct ? 'Edit Salary Structure' : 'Create Salary Structure'}
        maxWidth="md"
      >
        <form onSubmit={handleStructSubmit} className="space-y-4">
          {modalError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
              {modalError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Name *</label>
              <input
                type="text"
                required
                value={structForm.name}
                onChange={(e) => setStructForm({ ...structForm, name: e.target.value })}
                placeholder="e.g. Executive Staff"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Code *</label>
              <input
                type="text"
                required
                value={structForm.code}
                onChange={(e) =>
                  setStructForm({ ...structForm, code: e.target.value.toUpperCase() })
                }
                placeholder="e.g. EXEC-STF"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono uppercase"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={structForm.description}
              onChange={(e) => setStructForm({ ...structForm, description: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          {!editingStruct && (
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={structForm.seedDefaultRules}
                onChange={(e) =>
                  setStructForm({ ...structForm, seedDefaultRules: e.target.checked })
                }
              />
              <span>Initialize with 13 standard salary rules (Basic, HRA, Medical, TDS, etc.)</span>
            </label>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsStructModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Structure'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Rule Modal */}
      <Modal
        isOpen={isRuleModalOpen}
        onClose={() => setIsRuleModalOpen(false)}
        title={editingRule ? `Edit Rule: ${editingRule.code}` : 'Add Salary Rule'}
        maxWidth="lg"
      >
        <form onSubmit={handleRuleSubmit} className="space-y-4">
          {modalError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
              {modalError}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Rule Name *</label>
              <input
                type="text"
                required
                value={ruleForm.name}
                onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Code *</label>
              <input
                type="text"
                required
                value={ruleForm.code}
                onChange={(e) => setRuleForm({ ...ruleForm, code: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category *</label>
              <select
                value={ruleForm.category}
                onChange={(e) => setRuleForm({ ...ruleForm, category: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="BASIC">BASIC</option>
                <option value="ALLOWANCE">ALLOWANCE</option>
                <option value="GROSS">GROSS</option>
                <option value="DEDUCTION">DEDUCTION</option>
                <option value="NET">NET</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Type *</label>
              <select
                value={ruleForm.type}
                onChange={(e) => setRuleForm({ ...ruleForm, type: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="fixed">Fixed Amount</option>
                <option value="percentage_of_basic">% of Basic</option>
                <option value="formula">Formula Expression</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Sequence *</label>
              <input
                type="number"
                required
                value={ruleForm.sequence}
                onChange={(e) => setRuleForm({ ...ruleForm, sequence: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          {ruleForm.type !== 'formula' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {ruleForm.type === 'fixed' ? 'Fixed Amount (BDT)' : 'Percentage of Basic (%)'}
              </label>
              <input
                type="number"
                step="0.01"
                value={ruleForm.amount_or_percentage}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, amount_or_percentage: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono font-bold"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Formula *</label>
              <input
                type="text"
                required
                value={ruleForm.formula}
                onChange={(e) => setRuleForm({ ...ruleForm, formula: e.target.value })}
                placeholder="e.g. GROSS > 50000 ? (GROSS - 50000) * 0.05 : 0"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Variables: BASIC, ALLOWANCES, GROSS, DEDUCTIONS, PRESENT_DAYS, ABSENT_DAYS,
                HALF_DAYS, UNPAID_LEAVE_DAYS, BONUS, OVERTIME_HOURS, OVERTIME_RATE,
                LOAN_INSTALLMENT, MANUAL_DEDUCTION
              </p>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={ruleForm.active}
              onChange={(e) => setRuleForm({ ...ruleForm, active: e.target.checked })}
            />
            <span>Rule is Active</span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsRuleModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Rule'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

