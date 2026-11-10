'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Download,
  Eye,
  FileSpreadsheet,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

const SAMPLE_CSV = `employee_id,date,check_in,check_out
EMP-2026-0001,2026-11-10,09:04,18:05
EMP-2026-0002,2026-11-10,09:22,18:00
BIO-104,2026-11-10,08:58,17:55`;

const SAMPLE_DAT = `101\t2026-11-10 08:59:12\t1\t0
101\t2026-11-10 18:04:40\t1\t1
999\t2026-11-10 09:11:03\t1\t0`;

export function AttendanceImportView() {
  const [fileType, setFileType] = useState<'csv' | 'dat'>('csv');
  const [csvText, setCsvText] = useState('');
  const [busy, setBusy] = useState(false);

  const [previewData, setPreviewData] = useState<any | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.toLowerCase().endsWith('.dat')) {
      setFileType('dat');
    } else {
      setFileType('csv');
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result || ''));
      setPreviewData(null);
      setResult(null);
      setErrorMsg(null);
    };
    reader.readAsText(file);
  };

  const downloadTemplate = (kind: 'csv' | 'dat') => {
    const content = kind === 'csv' ? SAMPLE_CSV : SAMPLE_DAT;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = kind === 'csv' ? 'attendance_template.csv' : 'zkteco_attlog_sample.dat';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    setResult(null);
    setPreviewData(null);
    try {
      const res = await fetch('/api/attendance/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', fileType, csvText }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Preview failed');
      setPreviewData(json.data);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmImport = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/attendance/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', fileType, csvText }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Import failed');
      setResult(json);
      setPreviewData(null);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            CSV &amp; ZKTeco .dat Attendance Import
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Upload bulk CSV sheets or ZKTeco USB <code className="font-mono">.dat</code> punch logs. Validate with row-wise error reporting before confirming.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadTemplate('csv')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <Download className="w-3.5 h-3.5" /> CSV Template
          </button>
          <button
            type="button"
            onClick={() => downloadTemplate('dat')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <Download className="w-3.5 h-3.5" /> .dat Sample
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {result && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs space-y-2">
          <div className="font-bold flex items-center gap-1.5 text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {result.message}
          </div>
          {result.data?.unmatchedLogs > 0 && (
            <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center justify-between gap-2">
              <span>
                {result.data.unmatchedLogs} punch(es) belonged to unknown Employee/Biometric IDs and were saved in the Unmatched queue.
              </span>
              <Link
                href="/attendance/devices"
                className="font-bold underline shrink-0"
              >
                Map Unmatched IDs →
              </Link>
            </div>
          )}
          {result.data?.errors?.length > 0 && (
            <div className="text-rose-700 bg-white p-2 rounded border border-rose-200 max-h-32 overflow-y-auto font-mono text-[11px]">
              {result.data.errors.map((e: string, i: number) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
          <form onSubmit={handlePreview} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Upload File (.csv, .txt, .dat)
                </label>
                <input
                  type="file"
                  accept=".csv,.txt,.dat"
                  onChange={handleFileChange}
                  className="text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  File Format
                </label>
                <select
                  value={fileType}
                  onChange={(e) => setFileType(e.target.value as 'csv' | 'dat')}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="csv">CSV (Bulk or Raw Punches)</option>
                  <option value="dat">ZKTeco .dat (Tab-Delimited)</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  Or Paste Content Directly
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setCsvText(fileType === 'dat' ? SAMPLE_DAT : SAMPLE_CSV);
                    setPreviewData(null);
                  }}
                  className="text-[11px] font-semibold text-emerald-700 hover:underline"
                >
                  Load {fileType.toUpperCase()} Sample
                </button>
              </div>
              <textarea
                rows={9}
                value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value);
                  setPreviewData(null);
                }}
                placeholder={fileType === 'dat' ? SAMPLE_DAT : SAMPLE_CSV}
                className="w-full p-3 text-xs font-mono border border-slate-300 rounded-lg bg-slate-50"
              />
            </div>

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
                  onClick={handleConfirmImport}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  Step 2: Confirm &amp; Import ({previewData.validCount} Valid Rows)
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Supported Formats & Push Info */}
        <div className="lg:col-span-5 bg-slate-900 text-slate-100 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-bold">Supported Formats &amp; Device Push</h2>
          </div>

          <div className="text-xs text-slate-300 space-y-2">
            <p className="font-semibold text-white">1. Bulk CSV Format:</p>
            <pre className="bg-slate-800 p-2.5 rounded-lg text-[11px] font-mono text-emerald-300 overflow-x-auto">
{`employee_id,date,check_in,check_out
EMP-2026-0001,2026-11-10,09:00,18:00`}
            </pre>

            <p className="font-semibold text-white pt-1">2. Raw Punch CSV:</p>
            <pre className="bg-slate-800 p-2.5 rounded-lg text-[11px] font-mono text-emerald-300 overflow-x-auto">
{`employee_id,timestamp,punch_type
BIO-104,2026-11-10 09:02:15,IN`}
            </pre>

            <p className="font-semibold text-white pt-1">3. ZKTeco .dat Export (Tab-separated):</p>
            <pre className="bg-slate-800 p-2.5 rounded-lg text-[11px] font-mono text-emerald-300 overflow-x-auto">
{`101\t2026-11-10 09:02:15\t1\t0`}
            </pre>
          </div>

          <div className="pt-2 border-t border-slate-800 text-xs text-slate-300 flex items-center justify-between">
            <span>Managing ZKTeco / Hikvision hardware?</span>
            <Link
              href="/attendance/devices"
              className="text-emerald-400 font-semibold hover:underline"
            >
              Open Device Console →
            </Link>
          </div>
        </div>
      </div>

      {/* Preview Table & Row-wise Errors */}
      {previewData && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Rows</span>
              <p className="text-xl font-bold text-slate-900 mt-0.5">{previewData.totalRows}</p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-emerald-200">
              <span className="text-[11px] font-semibold text-emerald-700 uppercase">Valid Rows</span>
              <p className="text-xl font-bold text-emerald-700 mt-0.5">{previewData.validCount}</p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-amber-200">
              <span className="text-[11px] font-semibold text-amber-700 uppercase">
                Unmatched IDs
              </span>
              <p className="text-xl font-bold text-amber-700 mt-0.5">
                {previewData.unmatchedCount}
              </p>
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
                {previewData.errors.map((err: any, i: number) => (
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
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
                Preview (First {previewData.previewRows.length} Valid Rows)
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Row</th>
                    <th className="px-4 py-2.5">Code / Biometric ID</th>
                    <th className="px-4 py-2.5">Matched Employee</th>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Punches</th>
                    <th className="px-4 py-2.5 text-center">Match Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.previewRows.map((r: any) => (
                    <tr key={r.row} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2 font-mono text-slate-500">#{r.row}</td>
                      <td className="px-4 py-2 font-mono font-semibold">{r.code}</td>
                      <td className="px-4 py-2 font-semibold text-slate-800">{r.employeeName}</td>
                      <td className="px-4 py-2 font-mono">{r.dateStr}</td>
                      <td className="px-4 py-2 font-mono text-slate-600">
                        {(r.punches || [])
                          .map(
                            (p: any) =>
                              `${p.punchType} @ ${new Date(p.timestamp).toLocaleTimeString('en-GB', {
                                timeZone: 'Asia/Dhaka',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}`
                          )
                          .join(' | ')}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {r.matched ? (
                          <Badge variant="success">Matched</Badge>
                        ) : (
                          <Badge variant="warning">Unmatched Queue</Badge>
                        )}
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
