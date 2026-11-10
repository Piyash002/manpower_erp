'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FolderKanban,
  Sparkles,
  CheckCircle2,
  Banknote,
  XCircle,
  RefreshCw,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { formatBDT } from '@/lib/formatters';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DEPARTMENTS = [
  'all',
  'Visa',
  'Training',
  'Accounts',
  'Agent',
  'Counseling',
  'Administration',
  'Other',
];

export function PayslipBatchesView() {
  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [department, setDepartment] = useState<string>('all');
  const [batchName, setBatchName] = useState<string>('');

  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busyBatchId, setBusyBatchId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Batch detail modal
  const [activeBatchData, setActiveBatchData] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const loadBatches = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/payroll/batches');
      const json = await res.json();
      if (json.success) setBatches(json.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  const handleGenerateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setBanner(null);
    try {
      const res = await fetch('/api/payroll/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year, department, name: batchName }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Batch generation failed');
      setBatchName('');
      setBanner({ type: 'ok', msg: json.message });
      loadBatches();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleBatchAction = async (batchId: string, action: 'confirm' | 'pay' | 'cancel') => {
    setBusyBatchId(batchId);
    setBanner(null);
    try {
      const res = await fetch(`/api/payroll/batches/${batchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Action failed');
      setBanner({ type: 'ok', msg: json.message });
      loadBatches();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setBusyBatchId(null);
    }
  };

  const openBatchDetails = async (batchId: string) => {
    const res = await fetch(`/api/payroll/batches/${batchId}`);
    const json = await res.json();
    if (json.success) {
      setActiveBatchData(json.data);
      setIsDetailOpen(true);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Paid':
        return <Badge variant="success">Paid</Badge>;
      case 'Confirmed':
        return <Badge variant="info">Confirmed</Badge>;
      case 'Cancelled':
        return <Badge variant="danger">Cancelled</Badge>;
      default:
        return <Badge variant="warning">Draft</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-3 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Payslip Batches (Bulk Payroll Run)
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Generate payslips for all contracted employees in one click, then Bulk Confirm and Mark Paid.
        </p>
      </div>

      {/* Generate Batch Card */}
      <form
        onSubmit={handleGenerateBatch}
        className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Month *</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg"
            >
              {MONTHS.map((m, idx) => (
                <option key={m} value={idx + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Year *</label>
            <input
              type="number"
              min="2020"
              max="2100"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Department Filter
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d === 'all' ? 'All Departments' : d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Batch Title (Optional)
            </label>
            <input
              type="text"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="Auto-named if blank"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            />
          </div>

          <button
            type="submit"
            disabled={generating}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs disabled:opacity-50"
          >
            {generating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Run Payroll Batch</span>
              </>
            )}
          </button>
        </div>
      </form>

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

      {/* Batches Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-7 h-7 animate-spin text-emerald-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500">Loading payslip batches...</p>
          </div>
        ) : batches.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <FolderKanban className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">No payslip batches generated yet</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Batch Code &amp; Name</th>
                <th className="px-4 py-3">Period &amp; Dept</th>
                <th className="px-4 py-3 text-center">Payslips</th>
                <th className="px-4 py-3 text-right">Gross Total</th>
                <th className="px-4 py-3 text-right">Net Payable</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Bulk Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((b) => (
                <tr key={b._id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="font-semibold text-slate-900">{b.name}</div>
                    <span className="font-mono text-[11px] text-slate-500">{b.batch_code}</span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                    <div className="font-semibold text-slate-800">
                      {MONTHS[(b.month || 1) - 1]} {b.year}
                    </div>
                    <span className="text-slate-500">
                      {b.department === 'all' ? 'All Departments' : b.department}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center font-mono font-bold text-slate-800">
                    {b.payslip_count}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-700">
                    {formatBDT(b.total_gross_pay)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-extrabold text-emerald-700">
                    {formatBDT(b.total_net_pay)}
                  </td>
                  <td className="px-4 py-3.5 text-center">{getStatusBadge(b.status)}</td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openBatchDetails(b._id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </button>

                      {b.status === 'Draft' && (
                        <button
                          type="button"
                          disabled={busyBatchId === b._id}
                          onClick={() => handleBatchAction(b._id, 'confirm')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Bulk Confirm
                        </button>
                      )}

                      {b.status === 'Confirmed' && (
                        <button
                          type="button"
                          disabled={busyBatchId === b._id}
                          onClick={() => handleBatchAction(b._id, 'pay')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md"
                        >
                          <Banknote className="w-3 h-3" /> Bulk Pay
                        </button>
                      )}

                      {(b.status === 'Draft' || b.status === 'Confirmed') && (
                        <button
                          type="button"
                          disabled={busyBatchId === b._id}
                          onClick={() => handleBatchAction(b._id, 'cancel')}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md"
                          title="Cancel Batch"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Batch Payslips Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={activeBatchData?.batch?.name || 'Batch Payslips'}
        description={activeBatchData?.batch?.batch_code}
        maxWidth="2xl"
      >
        {activeBatchData && (
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Payslip #</th>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">Deductions</th>
                  <th className="px-3 py-2 text-right">Net Pay</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(activeBatchData.payslips || []).map((p: any) => (
                  <tr key={p._id}>
                    <td className="px-3 py-2 font-mono font-bold">{p.payslip_no}</td>
                    <td className="px-3 py-2">
                      {p.employee_id?.firstName} {p.employee_id?.lastName}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{formatBDT(p.gross_pay)}</td>
                    <td className="px-3 py-2 text-right font-mono text-rose-700">
                      {formatBDT(p.total_deductions)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">
                      {formatBDT(p.net_pay)}
                    </td>
                    <td className="px-3 py-2 text-center">{getStatusBadge(p.status)}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/payroll/payslips/${p._id}`}
                        className="text-blue-600 font-semibold hover:underline"
                      >
                        Print/View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}

