'use client';

import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Globe2,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  AlertTriangle,
  Layers,
  ShieldAlert,
} from 'lucide-react';
import { formatBDT } from '@/lib/formatters';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

export function TradeCountryManager() {
  const [activeTab, setActiveTab] = useState<'trades' | 'countries'>('trades');
  const [trades, setTrades] = useState<any[]>([]);
  const [countryCosts, setCountryCosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Trade Modal State
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<any | null>(null);
  const [tradeForm, setTradeForm] = useState({
    name: '',
    course_days: 30,
    admission_fee: 5000,
    course_fee: 20000,
    active: true,
  });

  // Country Cost Modal State
  const [isCountryModalOpen, setIsCountryModalOpen] = useState(false);
  const [editingCountryCost, setEditingCountryCost] = useState<any | null>(null);
  const [countryForm, setCountryForm] = useState({
    country: '',
    trade_id: '',
    visa_days: 30,
    visa_cost: 130000,
    govt_fee: 15000,
    contract_years: 2,
  });

  const fetchData = async () => {
    try {
      const [tRes, cRes] = await Promise.all([
        fetch('/api/trades'),
        fetch('/api/country-costs'),
      ]);
      const tData = await tRes.json();
      const cData = await cRes.json();

      if (tData.success) setTrades(tData.trades || []);
      if (cData.success) setCountryCosts(cData.countryCosts || []);
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

  // Open Trade Modal
  const openTradeModal = (trade?: any) => {
    setErrorMsg('');
    if (trade) {
      setEditingTrade(trade);
      setTradeForm({
        name: trade.name,
        course_days: trade.course_days,
        admission_fee: trade.admission_fee,
        course_fee: trade.course_fee,
        active: trade.active,
      });
    } else {
      setEditingTrade(null);
      setTradeForm({
        name: '',
        course_days: 30,
        admission_fee: 5000,
        course_fee: 20000,
        active: true,
      });
    }
    setIsTradeModalOpen(true);
  };

  // Submit Trade Form
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
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Trade operation failed');
      }

      setIsTradeModalOpen(false);
      showSuccess(editingTrade ? 'Trade updated successfully' : 'New trade added');
      fetchData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Delete Trade (PRD: Cannot delete if assigned to any student)
  const handleDeleteTrade = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the trade "${name}"?`)) return;

    setErrorMsg('');
    try {
      const res = await fetch(`/api/trades/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to delete trade');
      }
      showSuccess(data.message);
      fetchData();
    } catch (err: any) {
      setErrorMsg(err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Open Country Cost Modal
  const openCountryModal = (cost?: any) => {
    setErrorMsg('');
    if (cost) {
      setEditingCountryCost(cost);
      setCountryForm({
        country: cost.country,
        trade_id: typeof cost.trade_id === 'object' ? cost.trade_id._id : cost.trade_id,
        visa_days: cost.visa_days,
        visa_cost: cost.visa_cost,
        govt_fee: cost.govt_fee,
        contract_years: cost.contract_years,
      });
    } else {
      setEditingCountryCost(null);
      setCountryForm({
        country: '',
        trade_id: trades.length > 0 ? trades[0]._id : '',
        visa_days: 30,
        visa_cost: 130000,
        govt_fee: 15000,
        contract_years: 2,
      });
    }
    setIsCountryModalOpen(true);
  };

  // Submit Country Cost Form
  const handleCountrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    try {
      const url = editingCountryCost
        ? `/api/country-costs/${editingCountryCost._id}`
        : '/api/country-costs';
      const method = editingCountryCost ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(countryForm),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Operation failed');
      }

      setIsCountryModalOpen(false);
      showSuccess(
        editingCountryCost
          ? 'Country cost updated successfully'
          : 'New country cost added'
      );
      fetchData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Delete Country Cost
  const handleDeleteCountryCost = async (id: string, countryName: string) => {
    if (!confirm(`Are you sure you want to delete the cost configuration for "${countryName}"?`))
      return;

    setErrorMsg('');
    try {
      const res = await fetch(`/api/country-costs/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to delete');
      }
      showSuccess('Country cost removed');
      fetchData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading price lists...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Trades & Countries Setup
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Centralized master price lists for training courses and overseas destination visa costs (Admin Only).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'trades' ? (
            <button
              onClick={() => openTradeModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Trade</span>
            </button>
          ) : (
            <button
              onClick={() => openCountryModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Country Cost</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-800">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-rose-900">Operation Denied</h4>
            <p className="text-sm mt-0.5">{errorMsg}</p>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-sm">
          <Check className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
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
          <span>Country & Visa Costs ({countryCosts.length})</span>
        </button>
      </div>

      {/* TAB 1: TRADES LIST */}
      {activeTab === 'trades' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                <tr>
                  <th className="px-5 py-3">Trade Name</th>
                  <th className="px-5 py-3 text-center">Course Duration</th>
                  <th className="px-5 py-3 text-right">Admission Fee</th>
                  <th className="px-5 py-3 text-right">Course Fee</th>
                  <th className="px-5 py-3 text-right">Base Total</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trades.map((trade) => (
                  <tr key={trade._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-slate-900">{trade.name}</td>
                    <td className="px-5 py-3.5 text-center text-slate-600 font-mono">
                      {trade.course_days} Days
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-medium text-slate-700">
                      {formatBDT(trade.admission_fee)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-medium text-slate-700">
                      {formatBDT(trade.course_fee)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900">
                      {formatBDT(trade.admission_fee + trade.course_fee)}
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
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit Trade"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTrade(trade._id, trade.name)}
                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete Trade"
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
      )}

      {/* TAB 2: COUNTRY & VISA COSTS */}
      {activeTab === 'countries' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                <tr>
                  <th className="px-5 py-3">Destination Country</th>
                  <th className="px-5 py-3">Applicable Trade</th>
                  <th className="px-5 py-3 text-center">Visa Days</th>
                  <th className="px-5 py-3 text-right">Visa Cost</th>
                  <th className="px-5 py-3 text-right">Govt Fee</th>
                  <th className="px-5 py-3 text-center">Contract</th>
                  <th className="px-5 py-3 text-right">Total (Visa + Govt)</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {countryCosts.map((cost) => (
                  <tr key={cost._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-slate-900">{cost.country}</td>
                    <td className="px-5 py-3.5 text-slate-700">
                      {typeof cost.trade_id === 'object' ? cost.trade_id?.name : 'Trade'}
                    </td>
                    <td className="px-5 py-3.5 text-center text-slate-600 font-mono">
                      {cost.visa_days} Days
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-700">
                      {formatBDT(cost.visa_cost)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-700">
                      {formatBDT(cost.govt_fee)}
                    </td>
                    <td className="px-5 py-3.5 text-center font-mono text-slate-600">
                      {cost.contract_years} Yrs
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900">
                      {formatBDT(cost.total)}
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-2">
                      <button
                        onClick={() => openCountryModal(cost)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit Cost"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCountryCost(cost._id, cost.country)}
                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete Cost"
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
      )}

      {/* TRADE MODAL */}
      <Modal
        isOpen={isTradeModalOpen}
        onClose={() => setIsTradeModalOpen(false)}
        title={editingTrade ? 'Edit Trade Configuration' : 'Add New Trade'}
        description="Course duration and fees for candidates admitted to this trade."
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Course Days *
              </label>
              <input
                type="number"
                required
                min={1}
                value={tradeForm.course_days}
                onChange={(e) =>
                  setTradeForm({ ...tradeForm, course_days: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Admission Fee (BDT) *
              </label>
              <input
                type="number"
                required
                min={0}
                value={tradeForm.admission_fee}
                onChange={(e) =>
                  setTradeForm({ ...tradeForm, admission_fee: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Course Fee (BDT) *
            </label>
            <input
              type="number"
              required
              min={0}
              value={tradeForm.course_fee}
              onChange={(e) => setTradeForm({ ...tradeForm, course_fee: Number(e.target.value) })}
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
              Active Trade (Available in New Admission dropdown)
            </label>
          </div>

          <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsTradeModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm"
            >
              Save Trade
            </button>
          </div>
        </form>
      </Modal>

      {/* COUNTRY COST MODAL */}
      <Modal
        isOpen={isCountryModalOpen}
        onClose={() => setIsCountryModalOpen(false)}
        title={editingCountryCost ? 'Edit Country & Visa Cost' : 'Add Country Cost'}
        description="Visa processing costs, embassy fees, and contract terms."
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
                Visa Days (Est.) *
              </label>
              <input
                type="number"
                required
                min={1}
                value={countryForm.visa_days}
                onChange={(e) =>
                  setCountryForm({ ...countryForm, visa_days: Number(e.target.value) })
                }
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Visa Cost (BDT) *
              </label>
              <input
                type="number"
                required
                min={0}
                value={countryForm.visa_cost}
                onChange={(e) =>
                  setCountryForm({ ...countryForm, visa_cost: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Govt Fee (BDT)
              </label>
              <input
                type="number"
                min={0}
                value={countryForm.govt_fee}
                onChange={(e) =>
                  setCountryForm({ ...countryForm, govt_fee: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-mono"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-600">Total Computed Package:</span>
            <span className="text-base font-bold font-mono text-slate-900">
              {formatBDT(Number(countryForm.visa_cost || 0) + Number(countryForm.govt_fee || 0))}
            </span>
          </div>

          <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsCountryModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm"
            >
              Save Country Cost
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

