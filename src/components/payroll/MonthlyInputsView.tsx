'use client';

import React, { useEffect, useState } from 'react';
import { SlidersHorizontal, Save, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatBDT } from '@/lib/formatters';

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

export function MonthlyInputsView() {
  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [rows, setRows] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [savingEmpId, setSavingEmpId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const loadInputs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll/inputs?month=${month}&year=${year}`);
      const json = await res.json();
      if (json.success && json.data) {
        const loadedRows = json.data.rows || [];
        setRows(loadedRows);
        const initDrafts: Record<string, any> = {};
        for (const r of loadedRows) {
          initDrafts[r.employee._id] = {
            bonus: String(r.input.bonus ?? 0),
            overtime_hours: String(r.input.overtime_hours ?? 0),
            overtime_rate: String(r.input.overtime_rate ?? 0),
            loan_installment: String(r.input.loan_installment ?? 0),
            manual_deduction: String(r.input.manual_deduction ?? 0),
            notes: r.input.notes || '',
          };
        }
        setDrafts(initDrafts);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInputs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  const updateDraft = (empId: string, field: string, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [empId]: {
        ...(prev[empId] || {}),
        [field]: value,
      },
    }));
  };

  const handleSaveRow = async (empId: string) => {
    const d = drafts[empId];
    if (!d) return;
    setSavingEmpId(empId);
    setBanner(null);
    try {
      const res = await fetch('/api/payroll/inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: empId,
          month,
          year,
          bonus: Number(d.bonus) || 0,
          overtime_hours: Number(d.overtime_hours) || 0,
          overtime_rate: Number(d.overtime_rate) || 0,
          loan_installment: Number(d.loan_installment) || 0,
          manual_deduction: Number(d.manual_deduction) || 0,
          notes: d.notes || '',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Save failed');
      }
      setBanner({ type: 'ok', msg: json.message });
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setSavingEmpId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Monthly Variable Payroll Inputs
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Enter monthly Bonus, Overtime hours, Loan installments, and manual deductions per employee.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
          >
            {MONTHS.map((m, idx) => (
              <option key={m} value={idx + 1}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg font-mono"
          >
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
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

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-7 h-7 animate-spin text-emerald-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500">Loading monthly inputs...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <SlidersHorizontal className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">No active employees found</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-3 py-3 text-right">Bonus (BDT)</th>
                <th className="px-3 py-3 text-right">OT Hours</th>
                <th className="px-3 py-3 text-right">OT Rate (0=Auto)</th>
                <th className="px-3 py-3 text-right">Loan Inst. (BDT)</th>
                <th className="px-3 py-3 text-right">Manual Ded. (BDT)</th>
                <th className="px-3 py-3">Note</th>
                <th className="px-4 py-3 text-right">Save</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const emp = r.employee;
                const d = drafts[emp._id] || {};
                return (
                  <tr key={emp._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {emp.employee_id} • Base {formatBDT(emp.basic_salary)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        value={d.bonus ?? '0'}
                        onChange={(e) => updateDraft(emp._id, 'bonus', e.target.value)}
                        className="w-24 px-2 py-1 text-xs border border-slate-300 rounded text-right font-mono"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={d.overtime_hours ?? '0'}
                        onChange={(e) => updateDraft(emp._id, 'overtime_hours', e.target.value)}
                        className="w-20 px-2 py-1 text-xs border border-slate-300 rounded text-right font-mono"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        value={d.overtime_rate ?? '0'}
                        onChange={(e) => updateDraft(emp._id, 'overtime_rate', e.target.value)}
                        className="w-24 px-2 py-1 text-xs border border-slate-300 rounded text-right font-mono"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        value={d.loan_installment ?? '0'}
                        onChange={(e) => updateDraft(emp._id, 'loan_installment', e.target.value)}
                        className="w-24 px-2 py-1 text-xs border border-slate-300 rounded text-right font-mono"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        value={d.manual_deduction ?? '0'}
                        onChange={(e) => updateDraft(emp._id, 'manual_deduction', e.target.value)}
                        className="w-24 px-2 py-1 text-xs border border-slate-300 rounded text-right font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={d.notes ?? ''}
                        onChange={(e) => updateDraft(emp._id, 'notes', e.target.value)}
                        placeholder="Remarks..."
                        className="w-32 px-2 py-1 text-xs border border-slate-300 rounded"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        disabled={savingEmpId === emp._id}
                        onClick={() => handleSaveRow(emp._id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{savingEmpId === emp._id ? '...' : 'Save'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

