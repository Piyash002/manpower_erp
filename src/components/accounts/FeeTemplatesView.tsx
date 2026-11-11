'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Layers, Plus, RefreshCw, CheckCircle2, AlertCircle, X, Pencil, Trash2, Power } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/components/layout/DashboardLayout';
import { formatPaisaBDT, paisaToTaka, takaToPaisa } from '@/lib/accounts-money';

const COMMON_COUNTRIES = [
  'All',
  'Saudi Arabia',
  'Singapore',
  'UAE - Dubai',
  'Qatar',
  'Malaysia',
  'Kuwait',
  'Oman',
  'Bahrain',
  'South Korea',
  'Japan',
  'Romania',
  'Italy',
  'Jordan',
];

const STAGE_CODES = [
  { code: 'BOOKING', label: 'Booking / Admission' },
  { code: 'MEDICAL_TRAINING', label: 'Medical / Training' },
  { code: 'VISA_PROCESSING', label: 'Visa Processing' },
  { code: 'TICKET', label: 'Air Ticket' },
  { code: 'SERVICE_CHARGE', label: 'Service / Govt Fee' },
  { code: 'FINAL', label: 'Final Payment' },
  { code: 'OTHER', label: 'Other Stage' },
] as const;

export function FeeTemplatesView() {
  const { user } = useAuth();
  const role = user?.role || 'Viewer';
  const canAccess = ['Admin', 'Accountant', 'Viewer'].includes(role);
  const canWrite = ['Admin', 'Accountant'].includes(role);

  const [templates, setTemplates] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [countryCosts, setCountryCosts] = useState<any[]>([]);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [countryFilter, setCountryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [touchedCode, setTouchedCode] = useState(false);
  const [touchedName, setTouchedName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState('');
  const [form, setForm] = useState({
    code: '',
    name: '',
    tradeId: '',
    country: 'All',
    stages: [
      { stageCode: 'BOOKING', label: 'Admission & Booking Fee', amountTaka: '5000', dueOffsetDays: '0' },
      { stageCode: 'MEDICAL_TRAINING', label: 'Training & Course Fee', amountTaka: '20000', dueOffsetDays: '15' },
      { stageCode: 'VISA_PROCESSING', label: 'Visa Processing Charge', amountTaka: '130000', dueOffsetDays: '30' },
    ],
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [tRes, trRes, ccRes] = await Promise.all([
        fetch('/api/accounts/fee-templates'),
        fetch('/api/trades'),
        fetch('/api/country-costs'),
      ]);
      const [tJson, trJson, ccJson] = await Promise.all([
        tRes.json(),
        trRes.json(),
        ccRes.json(),
      ]);
      if (tJson.success) setTemplates(tJson.data || []);
      if (trJson.success) setTrades(trJson.trades || []);
      if (ccJson.success) setCountryCosts(ccJson.countryCosts || []);
    } finally {
      setLoading(false);
    }
  };

  const countryOptions = useMemo(() => {
    const tradeLinked = new Set<string>();
    const dbOther = new Set<string>();
    for (const c of countryCosts) {
      const name = String(c.country || '').trim();
      if (!name) continue;
      const cTradeId = typeof c.trade_id === 'object' && c.trade_id ? c.trade_id._id : c.trade_id;
      if (form.tradeId && String(cTradeId) === String(form.tradeId)) {
        tradeLinked.add(name);
      } else {
        dbOther.add(name);
      }
    }
    for (const t of templates) {
      const name = String(t.country || '').trim();
      if (name && !tradeLinked.has(name)) dbOther.add(name);
    }

    const ordered: Array<{ name: string; tag?: string }> = [{ name: 'All', tag: 'Any Country' }];
    const seen = new Set<string>(['All']);

    for (const name of Array.from(tradeLinked).sort()) {
      if (!seen.has(name)) {
        seen.add(name);
        ordered.push({ name, tag: 'Trade Configured' });
      }
    }
    for (const name of Array.from(dbOther).sort()) {
      if (!seen.has(name)) {
        seen.add(name);
        ordered.push({ name, tag: 'Configured' });
      }
    }
    for (const name of COMMON_COUNTRIES) {
      if (!seen.has(name)) {
        seen.add(name);
        ordered.push({ name });
      }
    }
    return ordered;
  }, [countryCosts, templates, form.tradeId]);

  const filteredCountries = useMemo(() => {
    const q = countryFilter.trim().toLowerCase();
    if (!q) return countryOptions;
    return countryOptions.filter((c) => c.name.toLowerCase().includes(q));
  }, [countryOptions, countryFilter]);

  useEffect(() => {
    if (canAccess) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess]);

  if (!canAccess) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-600">
        Your role ({role}) does not have access to Accounts.
      </div>
    );
  }

  const applyAutoSuggestion = (
    nextTradeId: string,
    nextCountry: string,
    prev: typeof form
  ) => {
    if (editingId) return { ...prev, tradeId: nextTradeId, country: nextCountry };
    const tr = trades.find((t) => t._id === nextTradeId);
    const tradeLabel = tr?.name || 'General';
    const countryLabel = nextCountry?.trim() || 'All';
    const slug = (s: string) =>
      s
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 18);
    const autoCode = `TPL-${slug(tradeLabel)}-${slug(countryLabel)}`;
    const autoName = `${tradeLabel} — ${countryLabel === 'All' ? 'All Countries' : countryLabel} Package`;
    return {
      ...prev,
      tradeId: nextTradeId,
      country: nextCountry,
      code: touchedCode ? prev.code : autoCode,
      name: touchedName ? prev.name : autoName,
    };
  };

  const openNewModal = () => {
    setEditingId(null);
    setTouchedCode(false);
    setTouchedName(false);
    setModalErr('');
    const initialForm = {
      code: '',
      name: '',
      tradeId: '',
      country: 'All',
      stages: [
        { stageCode: 'BOOKING', label: 'Admission & Booking Fee', amountTaka: '5000', dueOffsetDays: '0' },
        { stageCode: 'MEDICAL_TRAINING', label: 'Training & Course Fee', amountTaka: '20000', dueOffsetDays: '15' },
        { stageCode: 'VISA_PROCESSING', label: 'Visa Processing Charge', amountTaka: '130000', dueOffsetDays: '30' },
      ],
    };
    setForm(applyAutoSuggestion('', 'All', initialForm));
    setIsModalOpen(true);
  };

  const openEditModal = (tpl: any) => {
    setEditingId(tpl._id);
    setTouchedCode(true);
    setTouchedName(true);
    setModalErr('');
    setForm({
      code: tpl.code || '',
      name: tpl.name || '',
      tradeId: (typeof tpl.tradeId === 'object' && tpl.tradeId ? tpl.tradeId._id : tpl.tradeId) || '',
      country: tpl.country || 'All',
      stages: (tpl.stages || []).map((s: any) => ({
        stageCode: s.stageCode || 'OTHER',
        label: s.label || '',
        amountTaka: String(paisaToTaka(s.amountPaisa || 0)),
        dueOffsetDays: String(s.dueOffsetDays || 0),
      })),
    });
    setIsModalOpen(true);
  };

  const handleToggleActive = async (tpl: any) => {
    setBanner(null);
    const res = await fetch(`/api/accounts/fee-templates/${tpl._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !tpl.active }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setBanner({ type: 'ok', msg: `${tpl.code} ${!tpl.active ? 'activated' : 'deactivated'}.` });
      loadData();
    } else {
      setBanner({ type: 'err', msg: json.message || 'Status update failed' });
    }
  };

  const handleArchive = async (tpl: any) => {
    if (!confirm(`Archive fee template ${tpl.code}? Existing student fee plans keep their snapshot.`)) return;
    setBanner(null);
    const res = await fetch(`/api/accounts/fee-templates/${tpl._id}`, { method: 'DELETE' });
    const json = await res.json();
    if (res.ok && json.success) {
      setBanner({ type: 'ok', msg: json.message });
      loadData();
    } else {
      setBanner({ type: 'err', msg: json.message || 'Archive failed' });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setModalErr('');
    setBanner(null);
    try {
      const selectedTrade = trades.find((t) => t._id === form.tradeId);
      const url = editingId
        ? `/api/accounts/fee-templates/${editingId}`
        : '/api/accounts/fee-templates';
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingId ? {} : { code: form.code }),
          name: form.name,
          tradeId: form.tradeId || null,
          tradeName: selectedTrade?.name || 'General',
          country: form.country || 'All',
          stages: form.stages.map((s) => ({
            stageCode: s.stageCode,
            label: s.label,
            amountPaisa: takaToPaisa(s.amountTaka),
            dueOffsetDays: Number(s.dueOffsetDays) || 0,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Save failed');
      setIsModalOpen(false);
      setBanner({ type: 'ok', msg: json.message });
      loadData();
    } catch (err: any) {
      setModalErr(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-emerald-700" />
            <span>Fee Templates</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Stage-wise fee &amp; visa pricing packages owned by Accounts (Booking, Training, Visa, Ticket, Service Charge).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canWrite && (
            <button
              type="button"
              onClick={openNewModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
            >
              <Plus className="w-4 h-4" /> New Fee Template
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

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Code &amp; Package Name</th>
                <th className="px-4 py-3">Trade</th>
                <th className="px-4 py-3">Country</th>
                <th className="px-4 py-3">Stages Breakdown</th>
                <th className="px-4 py-3 text-right">Total Package</th>
                <th className="px-4 py-3 text-center">Status</th>
                {canWrite && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={canWrite ? 7 : 6} className="px-4 py-8 text-center text-slate-400">
                    Loading Fee Templates...
                  </td>
                </tr>
              ) : templates.length === 0 ? (
                <tr>
                  <td colSpan={canWrite ? 7 : 6} className="px-4 py-8 text-center text-slate-400">
                    No Fee Templates created yet. Run the fee migration or create a new template.
                  </td>
                </tr>
              ) : (
                templates.map((tpl) => (
                  <tr key={tpl._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <span className="font-mono text-[11px] font-bold text-slate-500">{tpl.code}</span>
                      <p className="font-semibold text-slate-900">{tpl.name}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{tpl.tradeId?.name || tpl.tradeName}</td>
                    <td className="px-4 py-3 text-slate-700">{tpl.country}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(tpl.stages || []).map((st: any, i: number) => (
                          <span
                            key={i}
                            className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700"
                          >
                            {st.label}: <strong>{formatPaisaBDT(st.amountPaisa, { showDecimals: false })}</strong>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                      {formatPaisaBDT(tpl.totalAmountPaisa)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {tpl.active ? <Badge variant="success">Active</Badge> : <Badge variant="gray">Inactive</Badge>}
                    </td>
                    {canWrite && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(tpl)}
                            title="Edit Template"
                            className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(tpl)}
                            title={tpl.active ? 'Deactivate' : 'Activate'}
                            className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded"
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleArchive(tpl)}
                            title="Archive (Soft-delete)"
                            className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? `Edit Fee Template (${form.code})` : 'New Stage-Wise Fee Template'}
        maxWidth="2xl"
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {modalErr && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium">
              {modalErr}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Template Code *</label>
              <input
                type="text"
                required
                disabled={Boolean(editingId)}
                placeholder="e.g. TPL-WELDER-KSA"
                value={form.code}
                onChange={(e) => {
                  setTouchedCode(true);
                  setForm({ ...form, code: e.target.value });
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Template Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Pipe Welder — Saudi Arabia Package"
                value={form.name}
                onChange={(e) => {
                  setTouchedName(true);
                  setForm({ ...form, name: e.target.value });
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Linked Trade</label>
              <select
                value={form.tradeId}
                onChange={(e) => setForm((prev) => applyAutoSuggestion(e.target.value, prev.country, prev))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">All / General</option>
                {trades.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative">
              <label className="block font-semibold text-slate-700 mb-1">Destination Country</label>
              <input
                type="text"
                value={form.country}
                onFocus={() => {
                  setCountryFilter('');
                  setCountryDropdownOpen(true);
                }}
                onBlur={() => {
                  setTimeout(() => setCountryDropdownOpen(false), 150);
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((prev) => applyAutoSuggestion(prev.tradeId, val, prev));
                  setCountryFilter(val);
                  setCountryDropdownOpen(true);
                }}
                placeholder="Click to pick or type country (e.g. Saudi Arabia)"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                autoComplete="off"
              />
              {countryDropdownOpen && (
                <div className="absolute z-30 left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1">
                  {filteredCountries.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-slate-500">
                      Press Enter or continue saving to use custom country &quot;{form.country}&quot;
                    </div>
                  ) : (
                    filteredCountries.map((opt) => (
                      <button
                        key={opt.name}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setForm((prev) => applyAutoSuggestion(prev.tradeId, opt.name, prev));
                          setCountryFilter('');
                          setCountryDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between hover:bg-emerald-50 ${
                          form.country === opt.name
                            ? 'bg-emerald-50 font-semibold text-emerald-800'
                            : 'text-slate-700'
                        }`}
                      >
                        <span>{opt.name}</span>
                        {opt.tag && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                            {opt.tag}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 uppercase">Fee Stages</span>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    stages: [
                      ...form.stages,
                      { stageCode: 'OTHER', label: 'Additional Stage', amountTaka: '0', dueOffsetDays: '30' },
                    ],
                  })
                }
                className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 rounded hover:bg-slate-200"
              >
                + Add Stage
              </button>
            </div>
            {form.stages.map((st, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select
                  value={st.stageCode}
                  onChange={(e) => {
                    const next = [...form.stages];
                    next[idx].stageCode = e.target.value;
                    setForm({ ...form, stages: next });
                  }}
                  className="col-span-3 px-2 py-1.5 border border-slate-300 rounded"
                >
                  {STAGE_CODES.map((sc) => (
                    <option key={sc.code} value={sc.code}>
                      {sc.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  value={st.label}
                  onChange={(e) => {
                    const next = [...form.stages];
                    next[idx].label = e.target.value;
                    setForm({ ...form, stages: next });
                  }}
                  placeholder="Stage Label"
                  className="col-span-4 px-2 py-1.5 border border-slate-300 rounded"
                />
                <input
                  type="number"
                  required
                  min={0}
                  value={st.amountTaka}
                  onChange={(e) => {
                    const next = [...form.stages];
                    next[idx].amountTaka = e.target.value;
                    setForm({ ...form, stages: next });
                  }}
                  placeholder="BDT"
                  className="col-span-3 px-2 py-1.5 border border-slate-300 rounded text-right font-mono"
                />
                <input
                  type="number"
                  min={0}
                  value={st.dueOffsetDays}
                  onChange={(e) => {
                    const next = [...form.stages];
                    next[idx].dueOffsetDays = e.target.value;
                    setForm({ ...form, stages: next });
                  }}
                  title="Due offset days"
                  className="col-span-1 px-1.5 py-1.5 border border-slate-300 rounded text-center font-mono"
                />
                {form.stages.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setForm({ ...form, stages: form.stages.filter((_, i) => i !== idx) })
                    }
                    className="col-span-1 text-slate-400 hover:text-rose-600 flex justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
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
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

