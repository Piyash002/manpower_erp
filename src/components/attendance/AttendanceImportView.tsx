'use client';

import React, { useState } from 'react';
import { UploadCloud, Download, CheckCircle2, AlertTriangle, Cpu } from 'lucide-react';

export function AttendanceImportView() {
  const [csvText, setCsvText] = useState(
    'employee_id,date,check_in,check_out\nEMP-0001,2026-11-10,09:05,18:15'
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ type: 'ok' | 'err'; msg: string; errors?: string[] } | null>(
    null
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
  };

  const handleDownloadSample = () => {
    const sample =
      'employee_id,date,check_in,check_out\nEMP-0001,2026-11-10,09:05,18:15\nEMP-0001,2026-11-11,09:20,19:00\n';
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'biometric_attendance_sample.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/attendance/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Import failed');
      }
      setResult({
        type: 'ok',
        msg: json.message,
        errors: json.data?.errors || [],
      });
    } catch (err: any) {
      setResult({ type: 'err', msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Bulk Biometric / CSV Attendance Import
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Import biometric device CSV exports or configure live ZKTeco device push integration.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadSample}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg self-start sm:self-auto"
        >
          <Download className="w-4 h-4 text-emerald-600" /> Download Sample CSV
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CSV Import Panel */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm">Upload or Paste Biometric CSV</h2>
            <label className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer">
              Choose CSV File
              <input type="file" accept=".csv,.txt" onChange={handleFileChange} className="hidden" />
            </label>
          </div>

          <p className="text-xs text-slate-500">
            Supports <code>employee_id,date,check_in,check_out</code> (e.g.{' '}
            <code>EMP-0001,2026-11-10,09:05,18:15</code>) or raw{' '}
            <code>employee_id,timestamp,punch_type</code> (<code>IN</code> / <code>OUT</code>).
          </p>

          <textarea
            rows={8}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
          />

          {result && (
            <div
              className={`p-3 rounded-xl text-xs border space-y-1 ${
                result.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {result.type === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{result.msg}</span>
              </div>
              {result.errors && result.errors.length > 0 && (
                <ul className="list-disc pl-5 text-[11px] text-amber-800">
                  {result.errors.slice(0, 10).map((er, i) => (
                    <li key={i}>{er}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={handleImport}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              <UploadCloud className="w-4 h-4" />
              <span>{busy ? 'Importing...' : 'Import Logs & Compute Daily Summary'}</span>
            </button>
          </div>
        </div>

        {/* ZKTeco Webhook Info */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold text-slate-900 text-sm">ZKTeco / Biometric Device API</h2>
          </div>
          <p className="text-xs text-slate-600">
            Configure your biometric middleware or ZKTeco push script to send attendance logs directly to:
          </p>
          <div className="p-3 bg-slate-900 text-slate-100 rounded-lg font-mono text-[11px] space-y-1.5 overflow-x-auto">
            <div>POST /api/attendance/biometric</div>
            <div className="text-emerald-400">Header: x-biometric-secret</div>
            <pre className="text-slate-300 mt-1">{`{
  "device_id": "ZK-DHAKA-01",
  "logs": [
    {
      "employee_id": "EMP-0001",
      "timestamp": "2026-11-11T09:04:00+06:00",
      "punch_type": "IN"
    }
  ]
}`}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

