'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Globe2,
  Plus,
  Trash2,
  Edit2,
  Check,
  ShieldAlert,
  Info,
  ArrowUpRight,
} from 'lucide-react';
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

/**
 * Purely descriptive Trade & Destination Country catalog owned by Admission.
 * All monetary fee amounts (admission, course, visa, govt) are owned in Accounts -> Fee Templates.
 */
export function TradeCountryManager() {
  const [activeTab, setActiveTab] = useState<'trades' | 'countries'>('trades');
  const [trades, setTrades] = useState<any[]>([]);
  const [countryPackages, setCountryPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Trade & Country Search/Filter/Sort
  const [tradeSearch, setTradeSearch] = useState('');
  const [tradeStatusFilter, setTradeStatusFilter] = useState<'all' | 'active' | 'hidden'>('all');
  const [tradeSortKey, setTradeSortKey] = useState('name');
  const [tradeSortDir, setTradeSortDir] = useState<SortDir>('asc');

  const [countrySearch, setCountrySearch] = useState('');
  const [countryTradeFilter, setCountryTradeFilter] = useState('all');
  const [countrySortKey, setCountrySortKey] = useState('country');
  const [countrySortDir, setCountrySortDir] = useState<SortDir>('asc');

  // Trade Modal State (descriptive only)
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<any | null>(null);
  const [tradeForm, setTradeForm] = useState({
    name: '',
    course_days: 30,
    active: true,
  });

  // Country Package Modal State (descriptive only)
  const [isCountryModalOpen, setIsCountryModalOpen] = useState(false);
  const [editingCountryPkg, setEditingCountryPkg] = useState<any | null>(null);
  const [countryForm, setCountryForm] = useState({
    country: '',
    trade_id: '',
    visa_days: 30,
    contract_years: 2,
  });

  const fetchData = async () => {
    try {
      const [tRes, cRes] = await Promise.all([fetch('/api/trades'), fetch('/api/country-costs')]);
      const [tData, cData] = await Promise.all([tRes.json(), cRes.json()]);
      if (tData.success) setTrades(tData.trades || []);
      if (cData.success) setCountryPackages(cData.countryCosts || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const openTradeModal = (trade?: any) => {
    setErrorMsg('');
    if (trade) {
      setEditingTrade(trade);
      setTradeForm({
        name: trade.name,
        course_days: trade.course_days,
        active: trade.active,
      });
    } else {
      setEditingTrade(null);
      setTradeForm({ name: '', course_days: 30, active: true });
    }
    setIsTradeModalOpen(true);
  };

  const handleTradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const url = editingTrade ? `/api/trades/${editingTrade._id}` : '/api/trades';
      const method = editingTrade ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tradeForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Trade operation failed');
      setIsTradeModalOpen(false);
      showSuccess(editingTrade ? 'Trade updated successfully' : 'New trade added');
      fetchData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleDeleteTrade = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the trade "${name}"?`)) return;
    setErrorMsg('');
    try {
      const res = await fetch(`/api/trades/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delete trade');
      showSuccess(data.message);
      fetchData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const openCountryModal = (pkg?: any) => {
    setErrorMsg('');
    if (pkg) {
      setEditingCountryPkg(pkg);
      setCountryForm({
        country: pkg.country,
        trade_id: typeof pkg.trade_id === 'object' ? pkg.trade_id._id : pkg.trade_id,
        visa_days: pkg.visa_days,
        contract_years: pkg.contract_years,
      });
    } else {
      setEditingCountryPkg(null);
      setCountryForm({
        country: '',
        trade_id: trades[0]?._id || '',
        visa_days: 30,
        contract_years: 2,
      });
    }
    setIsCountryModalOpen(true);
  };

  const handleCountrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const url = editingCountryPkg
        ? `/api/country-costs/${editingCountryPkg._id}`
        : '/api/country-costs';
      const method = editingCountryPkg ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(countryForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Operation failed');
      setIsCountryModalOpen(false);
      showSuccess(editingCountryPkg ? 'Destination package updated' : 'Destination package added');
      fetchData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleDeleteCountry = async (id: string, countryName: string) => {
    if (!confirm(`Remove destination configuration for "${countryName}"?`)) return;
    setErrorMsg('');
    try {
      const res = await fetch(`/api/country-costs/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delete');
      showSuccess('Destination package removed');
      fetchData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading descriptive setup...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Trades &amp; Countries Catalog
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Descriptive training trades, durations, destination countries, and contract terms (no money data).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'trades' ? (
            <button
              onClick={() => openTradeModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Trade</span>
            </button>
          ) : (
            <button
              onClick={() => openCountryModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Destination</span>
            </button>
          )}
        </div>
      </div>

      {/* Ownership Boundary Strip */}
      <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            Course fees, visa processing charges, and stage installment pricing are owned exclusively by{' '}
            <strong>Accounts → Fee Templates</strong>.
          </span>
        </span>
        <Link
          href="/accounts/fee-templates"
          className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
        >
          Manage Fee Templates <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-800">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <p className="text-sm">{errorMsg}</p>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-sm">
          <Check className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('trades')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'trades'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>Training Trades ({trades.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('countries')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'countries'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Globe2 className="w-4 h-4" />
          <span>Destination Countries ({countryPackages.length})</span>
        </button>
      </div>

      {activeTab === 'trades' && (() => {
        const filteredTrades = trades.filter((t) => {
          if (tradeStatusFilter === 'active' && !t.active) return false;
          if (tradeStatusFilter === 'hidden' && t.active) return false;
          return matchesSearch(tradeSearch, [t.name, t.course_days]);
        });
        const sortedTrades = sortTableItems(filteredTrades, tradeSortKey, tradeSortDir, {
          name: (t) => t.name || '',
          days: (t) => Number(t.course_days || 0),
          status: (t) => (t.active ? 'Active' : 'Hidden'),
        });
        const headers = ['Trade Name', 'Course Duration (Days)', 'Status'];
        const rows = sortedTrades.map((t) => [t.name, Number(t.course_days || 0), t.active ? 'Active' : 'Hidden']);
        return (
          <div className="space-y-3">
            <TableToolbar
              search={tradeSearch}
              onSearchChange={setTradeSearch}
              searchPlaceholder="Search trade name..."
              filters={
                <select
                  value={tradeStatusFilter}
                  onChange={(e) => setTradeStatusFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="hidden">Hidden</option>
                </select>
              }
              sortKey={tradeSortKey}
              sortDir={tradeSortDir}
              sortOptions={[
                { value: 'name', label: 'Trade Name' },
                { value: 'days', label: 'Course Days' },
                { value: 'status', label: 'Status' },
              ]}
              onSortChange={(k, d) => {
                setTradeSortKey(k);
                setTradeSortDir(d);
              }}
              totalCount={trades.length}
              filteredCount={sortedTrades.length}
              hasActiveFilters={tradeStatusFilter !== 'all'}
              onReset={() => {
                setTradeSearch('');
                setTradeStatusFilter('all');
              }}
              onExportExcel={() =>
                downloadExcel({ filename: 'training-trades', sheetName: 'Trades', headers, rows })
              }
              onPrint={() =>
                printTableReport({ title: 'Training Trades Catalog', headers, rows, rightAlignCols: [1] })
              }
            />
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                <tr>
                  <th className="px-5 py-3">Trade Name</th>
                  <th className="px-5 py-3 text-center">Course Duration</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedTrades.map((trade) => (
                  <tr key={trade._id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3.5 font-semibold text-slate-900">{trade.name}</td>
                    <td className="px-5 py-3.5 text-center text-slate-600 font-mono">
                      {trade.course_days} Days
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {trade.active ? (
                        <Badge variant="success" size="sm">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="gray" size="sm">
                          Hidden
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-2">
                      <button
                        onClick={() => openTradeModal(trade)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTrade(trade._id, trade.name)}
                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
          </div>
        );
      })()}

      {activeTab === 'countries' && (() => {
        const filteredCountries = countryPackages.filter((pkg) => {
          const tid = typeof pkg.trade_id === 'object' ? pkg.trade_id?._id : pkg.trade_id;
          if (countryTradeFilter !== 'all' && String(tid) !== countryTradeFilter) return false;
          const tradeName = typeof pkg.trade_id === 'object' ? pkg.trade_id?.name : '';
          return matchesSearch(countrySearch, [pkg.country, tradeName, pkg.visa_days, pkg.contract_years]);
        });
        const sortedCountries = sortTableItems(filteredCountries, countrySortKey, countrySortDir, {
          country: (pkg) => pkg.country || '',
          trade: (pkg) => (typeof pkg.trade_id === 'object' ? pkg.trade_id?.name || '' : ''),
          visaDays: (pkg) => Number(pkg.visa_days || 0),
          contract: (pkg) => Number(pkg.contract_years || 0),
        });
        const headers = ['Destination Country', 'Applicable Trade', 'Est. Visa Days', 'Contract Years'];
        const rows = sortedCountries.map((pkg) => [
          pkg.country,
          typeof pkg.trade_id === 'object' ? pkg.trade_id?.name || '' : 'Trade',
          Number(pkg.visa_days || 0),
          Number(pkg.contract_years || 0),
        ]);
        return (
          <div className="space-y-3">
            <TableToolbar
              search={countrySearch}
              onSearchChange={setCountrySearch}
              searchPlaceholder="Search destination country or trade..."
              filters={
                <select
                  value={countryTradeFilter}
                  onChange={(e) => setCountryTradeFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
                >
                  <option value="all">All Trades</option>
                  {trades.map((tr) => (
                    <option key={tr._id} value={tr._id}>
                      {tr.name}
                    </option>
                  ))}
                </select>
              }
              sortKey={countrySortKey}
              sortDir={countrySortDir}
              sortOptions={[
                { value: 'country', label: 'Country' },
                { value: 'trade', label: 'Trade' },
                { value: 'visaDays', label: 'Visa Days' },
                { value: 'contract', label: 'Contract Years' },
              ]}
              onSortChange={(k, d) => {
                setCountrySortKey(k);
                setCountrySortDir(d);
              }}
              totalCount={countryPackages.length}
              filteredCount={sortedCountries.length}
              hasActiveFilters={countryTradeFilter !== 'all'}
              onReset={() => {
                setCountrySearch('');
                setCountryTradeFilter('all');
              }}
              onExportExcel={() =>
                downloadExcel({
                  filename: 'destination-countries',
                  sheetName: 'Countries',
                  headers,
                  rows,
                })
              }
              onPrint={() =>
                printTableReport({
                  title: 'Destination Countries & Visa Packages',
                  headers,
                  rows,
                  rightAlignCols: [2, 3],
                })
              }
            />
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                <tr>
                  <th className="px-5 py-3">Destination Country</th>
                  <th className="px-5 py-3">Applicable Trade</th>
                  <th className="px-5 py-3 text-center">Est. Visa Days</th>
                  <th className="px-5 py-3 text-center">Contract Years</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedCountries.map((pkg) => (
                  <tr key={pkg._id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3.5 font-semibold text-slate-900">{pkg.country}</td>
                    <td className="px-5 py-3.5 text-slate-700">
                      {typeof pkg.trade_id === 'object' ? pkg.trade_id?.name : 'Trade'}
                    </td>
                    <td className="px-5 py-3.5 text-center text-slate-600 font-mono">
                      {pkg.visa_days} Days
                    </td>
                    <td className="px-5 py-3.5 text-center font-mono text-slate-600">
                      {pkg.contract_years} Yrs
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-2">
                      <button
                        onClick={() => openCountryModal(pkg)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCountry(pkg._id, pkg.country)}
                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
          </div>
        );
      })()}

      {/* TRADE MODAL */}
      <Modal
        isOpen={isTradeModalOpen}
        onClose={() => setIsTradeModalOpen(false)}
        title={editingTrade ? 'Edit Trade' : 'Add New Trade'}
        description="Descriptive course configuration (pricing lives in Accounts Fee Templates)."
        maxWidth="md"
      >
        <form onSubmit={handleTradeSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Trade Name *
            </label>
            <input
              type="text"
              required
              value={tradeForm.name}
              onChange={(e) => setTradeForm({ ...tradeForm, name: e.target.value })}
              placeholder="e.g. Pipe Welder (6G SMAW)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Course Duration (Days) *
            </label>
            <input
              type="number"
              required
              min={1}
              value={tradeForm.course_days}
              onChange={(e) => setTradeForm({ ...tradeForm, course_days: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-mono"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="trade_active"
              checked={tradeForm.active}
              onChange={(e) => setTradeForm({ ...tradeForm, active: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded border-slate-300"
            />
            <label htmlFor="trade_active" className="text-xs font-semibold text-slate-700">
              Active Trade (Available in New Admission)
            </label>
          </div>

          <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsTradeModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
            >
              Save Trade
            </button>
          </div>
        </form>
      </Modal>

      {/* COUNTRY PACKAGE MODAL */}
      <Modal
        isOpen={isCountryModalOpen}
        onClose={() => setIsCountryModalOpen(false)}
        title={editingCountryPkg ? 'Edit Destination Package' : 'Add Destination Country'}
        description="Operational duration & contract term per country and trade."
        maxWidth="md"
      >
        <form onSubmit={handleCountrySubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Destination Country *
            </label>
            <input
              type="text"
              required
              value={countryForm.country}
              onChange={(e) => setCountryForm({ ...countryForm, country: e.target.value })}
              placeholder="e.g. Saudi Arabia, Singapore"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Applicable Trade *
            </label>
            <select
              required
              value={countryForm.trade_id}
              onChange={(e) => setCountryForm({ ...countryForm, trade_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
            >
              {trades.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Est. Visa Days *
              </label>
              <input
                type="number"
                required
                min={1}
                value={countryForm.visa_days}
                onChange={(e) => setCountryForm({ ...countryForm, visa_days: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Contract (Years) *
              </label>
              <input
                type="number"
                step="0.5"
                required
                min={0.5}
                value={countryForm.contract_years}
                onChange={(e) =>
                  setCountryForm({ ...countryForm, contract_years: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-mono"
              />
            </div>
          </div>

          <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsCountryModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
            >
              Save Destination
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
