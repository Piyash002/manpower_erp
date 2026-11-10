'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Receipt,
  Plus,
  RefreshCw,
  Eye,
  CheckCircle2,
  Banknote,
  Trash2,
  XCircle,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { formatBDT } from '@/lib/formatters';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/components/layout/DashboardLayout';

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

export function PayslipsDesk() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const now = new Date();
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1));
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [payslips, setPayslips] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [myEmployee, setMyEmployee] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Single Generate Modal
  const [isGenModalOpen, setIsGenModalOpen] = useState(false);
  const [genForm, setGenForm] = useState({
    employee_id: '',
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
    notes: '',
  });
  const [submittingGen, setSubmittingGen] = useState(false);
  const [genError, setGenError] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (month !== 'all') params.append('month', month);
      if (year !== 'all') params.append('year', year);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const reqs: Promise<Response>[] = [fetch(`/api/payroll/payslips?${params.toString()}`)];
      if (isAdmin) {
        reqs.push(fetch('/api/hrm/employees?status=Active'));
      }

      const [slipRes, empRes] = await Promise.all(reqs);
      const slipJson = await slipRes.json();
      if (slipJson.success && slipJson.data) {
        setPayslips(slipJson.data.payslips || []);
        setMyEmployee(slipJson.data.myEmployee || null);
      }

      if (empRes && empRes.ok) {
        const empJson = await empRes.json();
        if (empJson.success) {
          setEmployees(empJson.data || []);
        }
      }
    } catch (err) {
      console.error('Failed to load payslips:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year, statusFilter, isAdmin]);

  const handleGenerateSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenError('');
    setSubmittingGen(true);
    try {
      const res = await fetch('/api/payroll/payslips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: genForm.employee_id,
          month: Number(genForm.month),
          year: Number(genForm.year),
          notes: genForm.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to generate payslip');
      }
      setIsGenModalOpen(false);
      setBanner({ type: 'ok', msg: json.message });
      loadData();
    } catch (err: any) {
      setGenError(err.message);
    } finally {
      setSubmittingGen(false);
    }
  };

  const handlePayslipUpdate = async (id: string, payload: Record<string, any>) => {
    setBanner(null);
    const res = await fetch(`/api/payroll/payslips/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setBanner({ type: 'err', msg: json.message || 'Update failed' });
      return;
    }
    setBanner({ type: 'ok', msg: json.message });
    loadData();
  };

  const handleDelete = async (id: string, payslipNo: string) => {
    if (!confirm(`Delete payslip ${payslipNo}?`)) return;
    const res = await fetch(`/api/payroll/payslips/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setBanner({ type: 'err', msg: json.message || 'Delete failed' });
      return;
    }
    setBanner({ type: 'ok', msg: json.message });
    loadData();
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

  const nonCancelled = payslips.filter((p) => p.status !== 'Cancelled');
  const totalGross = nonCancelled.reduce((s, p) => s + (p.gross_pay || 0), 0);
  const totalDeductions = nonCancelled.reduce((s, p) => s + (p.total_deductions || 0), 0);
  const totalNet = nonCancelled.reduce((s, p) => s + (p.net_pay || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isAdmin ? 'Payroll & Payslips' : 'My Payslips'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isAdmin
              ? 'Compute, verify, confirm, and disburse employee payslips from contracts, attendance, leaves & inputs.'
              : myEmployee
                ? `Viewing payslips for ${myEmployee.firstName} ${myEmployee.lastName} (${myEmployee.employee_id})`
                : 'View and print your personal monthly payslips.'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setGenError('');
                setGenForm({
                  employee_id: employees[0]?._id || '',
                  month: month === 'all' ? String(now.getMonth() + 1) : month,
                  year: year === 'all' ? String(now.getFullYear()) : year,
                  notes: '',
                });
                setIsGenModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Generate Payslip</span>
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
          {banner.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{banner.msg}</span>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Payslips Count</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">{nonCancelled.length}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Gross Total</span>
          <p className="text-2xl font-bold text-slate-900 font-mono mt-1">{formatBDT(totalGross)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs">
          <span className="text-xs font-semibold text-rose-700 uppercase">Total Deductions</span>
          <p className="text-2xl font-bold text-rose-700 font-mono mt-1">
            {formatBDT(totalDeductions)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
          <span className="text-xs font-semibold text-emerald-800 uppercase">Net Payable</span>
          <p className="text-2xl font-bold text-emerald-800 font-mono mt-1">
            {formatBDT(totalNet)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
        >
          <option value="all">Month: All</option>
          {MONTHS.map((m, idx) => (
            <option key={m} value={String(idx + 1)}>
              {m}
            </option>
          ))}
        </select>

        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-mono"
        >
          <option value="all">Year: All</option>
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
        >
          <option value="all">Status: All</option>
          <option value="Draft">Draft</option>
          <option value="Confirmed">Confirmed</option>
          <option value="Paid">Paid</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      {/* Payslips Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-7 h-7 animate-spin text-emerald-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500">Loading payslips...</p>
          </div>
        ) : payslips.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">No payslips found for this period</p>
            {!isAdmin && !myEmployee && (
              <p className="text-xs text-slate-400 mt-1">
                Your ERP user is not linked to an Employee profile yet.
              </p>
            )}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Payslip #</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Period &amp; Structure</th>
                <th className="px-4 py-3 text-right">Gross Pay</th>
                <th className="px-4 py-3 text-right">Deductions</th>
                <th className="px-4 py-3 text-right">Net Pay</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payslips.map((slip) => (
                <tr key={slip._id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <Link
                      href={`/payroll/payslips/${slip._id}`}
                      className="font-mono font-bold text-xs text-blue-700 hover:underline"
                    >
                      {slip.payslip_no}
                    </Link>
                    {slip.batch_id?.batch_code && (
                      <div className="text-[10px] font-mono text-slate-400">
                        {slip.batch_id.batch_code}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="font-semibold text-slate-900">
                      {slip.employee_id?.firstName} {slip.employee_id?.lastName}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      <span className="font-mono">{slip.employee_id?.employee_id}</span> •{' '}
                      {slip.employee_id?.department}
                    </div>
                  </td>

                  <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                    <div className="font-semibold text-slate-800">
                      {MONTHS[(slip.month || 1) - 1]} {slip.year}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {slip.structure_id?.name || '—'}
                    </div>
                  </td>

                  <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-semibold text-slate-800">
                    {formatBDT(slip.gross_pay)}
                  </td>

                  <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono text-rose-700">
                    {formatBDT(slip.total_deductions)}
                  </td>

                  <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-extrabold text-emerald-700">
                    {formatBDT(slip.net_pay)}
                  </td>

                  <td className="px-4 py-3.5 text-center whitespace-nowrap">
                    {getStatusBadge(slip.status)}
                  </td>

                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <Link
                        href={`/payroll/payslips/${slip._id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                        title="View / Print Payslip"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </Link>

                      {isAdmin && slip.status === 'Draft' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handlePayslipUpdate(slip._id, { recompute: true })}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md"
                            title="Recompute from latest Attendance/Leaves/Inputs"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePayslipUpdate(slip._id, { status: 'Confirmed' })}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(slip._id, slip.payslip_no)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md"
                            title="Delete Draft"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}

                      {isAdmin && slip.status === 'Confirmed' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handlePayslipUpdate(slip._id, { status: 'Paid' })}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md"
                          >
                            <Banknote className="w-3 h-3" /> Mark Paid
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePayslipUpdate(slip._id, { status: 'Cancelled' })}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md"
                            title="Cancel Payslip"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Single Generate Modal */}
      <Modal
        isOpen={isGenModalOpen}
        onClose={() => setIsGenModalOpen(false)}
        title="Generate Single Employee Payslip"
        description="Computes lines from active Contract, Attendance, Approved Leaves, and Monthly Inputs."
        maxWidth="md"
      >
        <form onSubmit={handleGenerateSingle} className="space-y-4">
          {genError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{genError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Employee *</label>
            <select
              required
              value={genForm.employee_id}
              onChange={(e) => setGenForm({ ...genForm, employee_id: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            >
              <option value="">Select Employee...</option>
              {employees.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.firstName} {e.lastName} ({e.employee_id} • {e.department})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Month *</label>
              <select
                value={genForm.month}
                onChange={(e) => setGenForm({ ...genForm, month: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {MONTHS.map((m, idx) => (
                  <option key={m} value={String(idx + 1)}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Year *</label>
              <input
                type="number"
                required
                min="2020"
                max="2100"
                value={genForm.year}
                onChange={(e) => setGenForm({ ...genForm, year: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
            <input
              type="text"
              value={genForm.notes}
              onChange={(e) => setGenForm({ ...genForm, notes: e.target.value })}
              placeholder="Optional remarks"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsGenModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingGen}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {submittingGen ? 'Computing...' : 'Generate Draft Payslip'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

