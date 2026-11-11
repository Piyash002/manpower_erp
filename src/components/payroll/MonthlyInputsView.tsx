'use client';

import React, { useEffect, useState } from 'react';
import {
  SlidersHorizontal,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Lock,
  Upload,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import { formatBDT } from '@/lib/formatters';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/components/layout/DashboardLayout';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function MonthlyInputsView() {
  const { user } = useAuth();
  const canEdit = user?.role === 'Admin' || user?.role === 'HR';

  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [rows, setRows] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [isLocked, setIsLocked] = useState(false);
  const [lockedRun, setLockedRun] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingEmpId, setSavingEmpId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // CSV/Excel Import Modal
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importPayload, setImportPayload] = useState<{
    fileName: string;
    csvText?: string;
    xlsxBase64?: string;
  } | null>(null);
  const [previewResult, setPreviewResult] = useState<any | null>(null);
  const [importing, setImporting] = useState(false);

  const loadInputs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll/inputs?month=${month}&year=${year}`);
      const json = await res.json();
      if (json.success && json.data) {
        setIsLocked(Boolean(json.data.isLocked));
        setLockedRun(json.data.lockedRun || null);
        const loadedRows = json.data.rows || [];
        setRows(loadedRows);
        const initDrafts: Record<string, any> = {};
        for (const r of loadedRows) {
          const inp = r.input || {};
          const bType = inp.bonus_type || 'festival';
          const bAmount =
            (inp.bonus_festival || 0) + (inp.bonus_performance || 0) + (inp.bonus_other || 0) ||
            inp.bonus ||
            0;
          initDrafts[r.employee._id] = {
            overtime_hours: String(inp.overtime_hours ?? 0),
            overtime_rate: String(inp.overtime_rate ?? 0),
            bonus_type: bType,
            bonus_amount: String(bAmount),
            advance_deduction: String(inp.advance_deduction ?? inp.loan_installment ?? 0),
            fine: String(inp.fine ?? inp.manual_deduction ?? 0),
            other_adjustment: String(inp.other_adjustment ?? 0),
            notes: inp.notes || '',
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
    const bAmt = Math.max(0, Math.round(Number(d.bonus_amount) || 0));
    const bType = d.bonus_type || 'festival';
    try {
      const res = await fetch('/api/payroll/inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_row',
          employee_id: empId,
          month,
          year,
          overtime_hours: Number(d.overtime_hours) || 0,
          overtime_rate: Number(d.overtime_rate) || 0,
          bonus_type: bType,
          bonus_festival: bType === 'festival' ? bAmt : 0,
          bonus_performance: bType === 'performance' ? bAmt : 0,
          bonus_other: bType === 'other' ? bAmt : 0,
          advance_deduction: Number(d.advance_deduction) || 0,
          fine: Number(d.fine) || 0,
          other_adjustment: Number(d.other_adjustment) || 0,
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewResult(null);
    setBanner(null);

    if (file.name.toLowerCase().endsWith('.xlsx')) {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const xlsxBase64 = btoa(bin);
      const payload = { fileName: file.name, xlsxBase64 };
      setImportPayload(payload);
      await runImportPreview(payload);
    } else {
      const csvText = await file.text();
      const payload = { fileName: file.name, csvText };
      setImportPayload(payload);
      await runImportPreview(payload);
    }
  };

  const runImportPreview = async (payload: { csvText?: string; xlsxBase64?: string }) => {
    setImporting(true);
    try {
      const res = await fetch('/api/payroll/inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import_preview',
          month,
          year,
          ...payload,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Preview failed');
      setPreviewResult(json.data);
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPayload) return;
    setImporting(true);
    try {
      const res = await fetch('/api/payroll/inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import_confirm',
          month,
          year,
          ...importPayload,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Import failed');
      setIsImportOpen(false);
      setImportPayload(null);
      setPreviewResult(null);
      setBanner({ type: 'ok', msg: json.message });
      loadInputs();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Monthly Payroll Inputs</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Enter or import overtime hours, bonuses (festival/performance/other), advances, fines &amp; adjustments per month.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
          >
            {[2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <a
            href={`/api/payroll/inputs?month=${month}&year=${year}&template=csv`}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <Download className="w-3.5 h-3.5" /> CSV Template
          </a>

          <a
            href={`/api/payroll/inputs?month=${month}&year=${year}&template=xlsx`}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel Template
          </a>

          {canEdit && !isLocked && (
            <button
              type="button"
              onClick={() => {
                setPreviewResult(null);
                setImportPayload(null);
                setIsImportOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
            >
              <Upload className="w-3.5 h-3.5" /> Import CSV / Excel
            </button>
          )}
        </div>
      </div>

      {isLocked && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Inputs Locked ({MONTHS[month - 1]} {year}):</strong> Payroll Run{' '}
            <span className="font-mono font-bold">{lockedRun?.batch_code}</span> is{' '}
            <strong>{lockedRun?.status}</strong>. Monthly inputs can no longer be edited for this month.
          </span>
        </div>
      )}

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
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-3">Employee</th>
                <th className="px-2 py-3 w-20">OT Hrs</th>
                <th className="px-2 py-3 w-28">Bonus Type</th>
                <th className="px-2 py-3 w-24">Bonus (৳)</th>
                <th className="px-2 py-3 w-24">Advance (৳)</th>
                <th className="px-2 py-3 w-24">Fine (৳)</th>
                <th className="px-2 py-3 w-24">Other Adj (৳)</th>
                <th className="px-2 py-3">Note</th>
                {canEdit && <th className="px-3 py-3 text-right">Save</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const emp = r.employee;
                const d = drafts[emp._id] || {};
                const disabled = !canEdit || isLocked;
                return (
                  <tr key={emp._id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {emp.employee_id} • {emp.department} • Basic {formatBDT(emp.basic_salary)}
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        disabled={disabled}
                        value={d.overtime_hours ?? '0'}
                        onChange={(e) => updateDraft(emp._id, 'overtime_hours', e.target.value)}
                        className="w-18 px-2 py-1.5 border border-slate-300 rounded-md font-mono text-right disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <select
                        disabled={disabled}
                        value={d.bonus_type ?? 'festival'}
                        onChange={(e) => updateDraft(emp._id, 'bonus_type', e.target.value)}
                        className="w-28 px-2 py-1.5 border border-slate-300 rounded-md text-xs disabled:bg-slate-100"
                      >
                        <option value="festival">Festival</option>
                        <option value="performance">Performance</option>
                        <option value="other">Other</option>
                      </select>
                    </td>
                    <td className="px-2 py-2.5">
                      <input
                        type="number"
                        min="0"
                        disabled={disabled}
                        value={d.bonus_amount ?? '0'}
                        onChange={(e) => updateDraft(emp._id, 'bonus_amount', e.target.value)}
                        className="w-24 px-2 py-1.5 border border-slate-300 rounded-md font-mono text-right disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <input
                        type="number"
                        min="0"
                        disabled={disabled}
                        value={d.advance_deduction ?? '0'}
                        onChange={(e) => updateDraft(emp._id, 'advance_deduction', e.target.value)}
                        className="w-24 px-2 py-1.5 border border-slate-300 rounded-md font-mono text-right disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <input
                        type="number"
                        min="0"
                        disabled={disabled}
                        value={d.fine ?? '0'}
                        onChange={(e) => updateDraft(emp._id, 'fine', e.target.value)}
                        className="w-24 px-2 py-1.5 border border-slate-300 rounded-md font-mono text-right disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <input
                        type="number"
                        disabled={disabled}
                        value={d.other_adjustment ?? '0'}
                        onChange={(e) => updateDraft(emp._id, 'other_adjustment', e.target.value)}
                        className="w-24 px-2 py-1.5 border border-slate-300 rounded-md font-mono text-right disabled:bg-slate-100"
                        title="Positive adds to pay, negative deducts"
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <input
                        type="text"
                        disabled={disabled}
                        placeholder="Optional note..."
                        value={d.notes ?? ''}
                        onChange={(e) => updateDraft(emp._id, 'notes', e.target.value)}
                        className="w-36 px-2 py-1.5 border border-slate-300 rounded-md disabled:bg-slate-100"
                      />
                    </td>
                    {canEdit && (
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={disabled || savingEmpId === emp._id}
                          onClick={() => handleSaveRow(emp._id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md disabled:opacity-40"
                        >
                          <Save className="w-3 h-3" />
                          <span>{savingEmpId === emp._id ? '...' : 'Save'}</span>
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* CSV / Excel Import Modal */}
      <Modal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        title={`Import Monthly Inputs (${MONTHS[month - 1]} ${year})`}
        description="Upload CSV or Excel (.xlsx) using our template. All rows are validated before saving."
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 text-center space-y-2">
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={handleFileSelect}
              className="text-xs"
            />
            <p className="text-[11px] text-slate-500">
              Columns supported: employee_id, overtime_hours, overtime_rate, bonus_type (festival/performance/other), bonus_festival, bonus_performance, bonus_other, advance_deduction, fine, other_adjustment, note
            </p>
          </div>

          {importing && (
            <div className="py-4 text-center text-slate-500">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1 text-emerald-600" />
              Validating rows...
            </div>
          )}

          {previewResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-100 font-semibold">
                <span>Parsed {previewResult.totalRows} rows:</span>
                <span>
                  <span className="text-emerald-700">{previewResult.validCount} valid</span>
                  {' · '}
                  <span className="text-rose-700">{previewResult.errorCount} errors</span>
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-500 uppercase">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Employee</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Details / Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(previewResult.previewRows || []).map((pr: any) => (
                      <tr key={pr.rowNumber} className={pr.valid ? '' : 'bg-rose-50/60'}>
                        <td className="px-3 py-2 font-mono">{pr.rowNumber}</td>
                        <td className="px-3 py-2">
                          <span className="font-mono font-bold">{pr.employee_code}</span> ({pr.employee_name})
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={pr.valid ? 'success' : 'danger'}>
                            {pr.valid ? 'Valid' : 'Error'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          {pr.valid ? (
                            <span className="text-slate-600">
                              OT {pr.data.overtime_hours}h · Bonus {formatBDT((pr.data.bonus_festival || 0) + (pr.data.bonus_performance || 0) + (pr.data.bonus_other || 0))} · Adv {formatBDT(pr.data.advance_deduction)} · Fine {formatBDT(pr.data.fine)}
                            </span>
                          ) : (
                            <span className="text-rose-700 font-semibold">{pr.errors.join('; ')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsImportOpen(false)}
              className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={importing || !previewResult || previewResult.validCount === 0}
              onClick={handleConfirmImport}
              className="px-4 py-2 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {importing ? 'Importing...' : `Import ${previewResult?.validCount || 0} Valid Row(s)`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
