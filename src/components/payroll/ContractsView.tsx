'use client';

import React, { useEffect, useState } from 'react';
import {
  FileSignature,
  Plus,
  Edit3,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { formatBDT, formatDate } from '@/lib/formatters';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

export function ContractsView() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<any | null>(null);
  const [form, setForm] = useState({
    employee_id: '',
    structure_id: '',
    basic_salary: '20000',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    status: 'Active',
    bank_name: '',
    bank_account_no: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [cRes, eRes, sRes] = await Promise.all([
        fetch('/api/payroll/contracts'),
        fetch('/api/hrm/employees'),
        fetch('/api/payroll/structures'),
      ]);
      const [cJson, eJson, sJson] = await Promise.all([cRes.json(), eRes.json(), sRes.json()]);
      if (cJson.success) setContracts(cJson.data || []);
      if (eJson.success) setEmployees(eJson.data || []);
      if (sJson.success) setStructures(sJson.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingContract(null);
    const firstEmp = employees[0];
    setForm({
      employee_id: firstEmp?._id || '',
      structure_id: structures[0]?._id || '',
      basic_salary: String(firstEmp?.basic_salary || 20000),
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      status: 'Active',
      bank_name: '',
      bank_account_no: '',
      notes: '',
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const openEditModal = (c: any) => {
    setEditingContract(c);
    setForm({
      employee_id: c.employee_id?._id || '',
      structure_id: c.structure_id?._id || '',
      basic_salary: String(c.basic_salary || 0),
      start_date: c.start_date ? c.start_date.split('T')[0] : '',
      end_date: c.end_date ? c.end_date.split('T')[0] : '',
      status: c.status,
      bank_name: c.bank_name || '',
      bank_account_no: c.bank_account_no || '',
      notes: c.notes || '',
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError('');
    try {
      const url = editingContract
        ? `/api/payroll/contracts/${editingContract._id}`
        : '/api/payroll/contracts';
      const method = editingContract ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          basic_salary: Math.round(Number(form.basic_salary) || 0),
          end_date: form.end_date || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to save contract');
      setIsModalOpen(false);
      setBanner({ type: 'ok', msg: json.message });
      loadData();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Employee Contracts &amp; Salary Assignments
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Link each employee to a Salary Structure, contracted basic salary, and bank payout details.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Assign Contract</span>
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
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{banner.msg}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-7 h-7 animate-spin text-emerald-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500">Loading employee contracts...</p>
          </div>
        ) : contracts.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <FileSignature className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">No contracts assigned yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Employees require an Active contract before payslips can be generated.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Salary Structure</th>
                <th className="px-4 py-3 text-right">Basic Salary</th>
                <th className="px-4 py-3">Contract Term</th>
                <th className="px-4 py-3">Bank Account</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contracts.map((c) => (
                <tr key={c._id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="font-semibold text-slate-900">
                      {c.employee_id?.firstName} {c.employee_id?.lastName}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500">
                      {c.employee_id?.employee_id} • {c.employee_id?.department}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                    <div className="font-semibold text-slate-800">{c.structure_id?.name}</div>
                    <span className="font-mono text-[11px] text-slate-400">
                      {c.structure_id?.code}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-bold text-slate-900">
                    {formatBDT(c.basic_salary)}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600">
                    {formatDate(c.start_date)} → {c.end_date ? formatDate(c.end_date) : 'Open-ended'}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600">
                    {c.bank_name ? (
                      <>
                        <div className="font-medium text-slate-800">{c.bank_name}</div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {c.bank_account_no}
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-400">Not set</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-center whitespace-nowrap">
                    <Badge
                      variant={
                        c.status === 'Active'
                          ? 'success'
                          : c.status === 'Expired'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEditModal(c)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 rounded"
                      title="Edit Contract"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Assign / Edit Contract Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingContract ? 'Update Employee Contract' : 'Assign Salary Contract'}
        maxWidth="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {modalError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Employee *</label>
              <select
                required
                disabled={!!editingContract}
                value={form.employee_id}
                onChange={(e) => {
                  const emp = employees.find((x) => x._id === e.target.value);
                  setForm({
                    ...form,
                    employee_id: e.target.value,
                    basic_salary: emp ? String(emp.basic_salary || 20000) : form.basic_salary,
                  });
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
              >
                <option value="">Select Employee...</option>
                {employees.map((e) => (
                  <option key={e._id} value={e._id}>
                    {e.firstName} {e.lastName} ({e.employee_id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Salary Structure *
              </label>
              <select
                required
                value={form.structure_id}
                onChange={(e) => setForm({ ...form, structure_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {structures.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contract Basic Salary (BDT) *
              </label>
              <input
                type="number"
                required
                min="0"
                value={form.basic_salary}
                onChange={(e) => setForm({ ...form, basic_salary: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status *</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="Active">Active</option>
                <option value="Expired">Expired</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date *</label>
              <input
                type="date"
                required
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                End Date (Optional)
              </label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bank Name (For Transfer Sheet)
              </label>
              <input
                type="text"
                value={form.bank_name}
                onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                placeholder="e.g. Dutch-Bangla Bank"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bank Account Number
              </label>
              <input
                type="text"
                value={form.bank_account_no}
                onChange={(e) => setForm({ ...form, bank_account_no: e.target.value })}
                placeholder="e.g. 101.105.0029182"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Contract'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

