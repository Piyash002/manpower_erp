'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  Eye,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

const SAMPLE_EMPLOYEES_CSV = `first_name,last_name,phone,email,department,designation,employee_type,basic_salary,joining_date,biometric_id,nid_number,shift,payment_method,bank_name,bank_account_no
Rahim,Uddin,01711000101,rahim.demo@dreams.com,Counseling,Student Counselor,Permanent,22000,2026-01-15,BIO-201,1995123456789,Regular,Bank,Dutch-Bangla Bank,101105001122
Karim,Ahmed,01711000102,karim.demo@dreams.com,Visa,Visa Executive,Permanent,26000,2026-02-01,BIO-202,1993987654321,Regular,bKash,bKash,01711000102`;

export function EmployeeImportView() {
  const [csvText, setCsvText] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result || ''));
      setPreviewData(null);
      setResultMsg(null);
      setErrorMsg(null);
    };
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const blob = new Blob([SAMPLE_EMPLOYEES_CSV], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employees_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    setResultMsg(null);
    setPreviewData(null);
    try {
      const res = await fetch('/api/hrm/employees/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', csvText }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Validation failed');
      setPreviewData(json.data);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/hrm/employees/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', csvText }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Import failed');
      setResultMsg(json.message);
      setPreviewData(null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/hrm/employees"
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Bulk Employee Import (Excel CSV)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Download template, preview rows, review row-wise uniqueness/field errors, and confirm import.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          <Download className="w-4 h-4" /> Download Template CSV
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {resultMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs flex items-center justify-between gap-2">
          <span className="font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {resultMsg}
          </span>
          <Link href="/hrm/employees" className="font-bold underline">
            View Directory →
          </Link>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
        <form onSubmit={handlePreview} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFile}
              className="text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
            />
            <button
              type="button"
              onClick={() => {
                setCsvText(SAMPLE_EMPLOYEES_CSV);
                setPreviewData(null);
              }}
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              Load Sample Rows
            </button>
          </div>

          <textarea
            rows={8}
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setPreviewData(null);
            }}
            placeholder={SAMPLE_EMPLOYEES_CSV}
            className="w-full p-3 text-xs font-mono border border-slate-300 rounded-lg bg-slate-50"
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy || !csvText.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50"
            >
              <Eye className="w-4 h-4" />
              {busy ? 'Validating...' : 'Step 1: Preview & Validate'}
            </button>
            {previewData && previewData.validCount > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirm}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                Step 2: Confirm &amp; Import ({previewData.validCount} Valid Rows)
              </button>
            )}
          </div>
        </form>
      </div>

      {previewData && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Rows</span>
              <p className="text-xl font-bold text-slate-900 mt-0.5">{previewData.totalRows}</p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-emerald-200">
              <span className="text-[11px] font-semibold text-emerald-700 uppercase">Valid Rows</span>
              <p className="text-xl font-bold text-emerald-700 mt-0.5">{previewData.validCount}</p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-rose-200">
              <span className="text-[11px] font-semibold text-rose-700 uppercase">Errors</span>
              <p className="text-xl font-bold text-rose-700 mt-0.5">{previewData.errorCount}</p>
            </div>
          </div>

          {previewData.errors?.length > 0 && (
            <div className="bg-white rounded-xl border border-rose-200 p-4 space-y-2">
              <h3 className="text-xs font-bold text-rose-800 uppercase">
                Row-wise Validation Errors ({previewData.errors.length})
              </h3>
              <div className="max-h-48 overflow-y-auto divide-y divide-rose-100 text-xs">
                {previewData.errors.map((err: { row: number; message: string; raw: string }, i: number) => (
                  <div key={i} className="py-1.5 flex items-start justify-between gap-4">
                    <span className="font-semibold text-rose-700 shrink-0">Row {err.row}</span>
                    <span className="text-slate-700 flex-1">{err.message}</span>
                    <span className="font-mono text-[11px] text-slate-400 truncate max-w-xs">
                      {err.raw}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {previewData.previewRows?.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Row</th>
                    <th className="px-4 py-2.5">Full Name</th>
                    <th className="px-4 py-2.5">Phone / Email</th>
                    <th className="px-4 py-2.5">Dept / Designation</th>
                    <th className="px-4 py-2.5">Type / Salary</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.previewRows.map((r: any) => (
                    <tr key={r.row}>
                      <td className="px-4 py-2 font-mono text-slate-500">#{r.row}</td>
                      <td className="px-4 py-2 font-semibold text-slate-900">
                        {r.firstName} {r.lastName}
                      </td>
                      <td className="px-4 py-2">
                        <div>{r.phone}</div>
                        <div className="text-[11px] text-slate-400">{r.email || '—'}</div>
                      </td>
                      <td className="px-4 py-2">
                        <div>{r.department}</div>
                        <div className="text-[11px] text-slate-400">{r.designation}</div>
                      </td>
                      <td className="px-4 py-2 font-mono">
                        {r.employee_type} • ৳{r.basic_salary}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="success">Ready</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

