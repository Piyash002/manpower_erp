'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Printer, Download, ArrowLeft, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { formatDate } from '@/lib/formatters';

export default function BatchResultPrintPage() {
  const params = useParams();
  const batchId = params?.id as string;

  const [batch, setBatch] = useState<any>(null);
  const [trainees, setTrainees] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!batchId) return;
    fetch(`/api/batches/${batchId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.message || 'Batch not found');
        setBatch(d.batch);
        setTrainees(d.trainees || []);
        setStats(d.stats || null);
      })
      .catch((err) => setError(err.message || 'Failed to load batch results'))
      .finally(() => setLoading(false));
  }, [batchId]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 text-slate-600 gap-2">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
        <span className="text-sm font-medium">Loading batch result sheet...</span>
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 max-w-md w-full text-center space-y-3">
          <p className="text-rose-600 font-semibold text-sm">{error || 'Batch not found'}</p>
          <Link
            href="/batches"
            className="inline-block px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold"
          >
            Back to Batches
          </Link>
        </div>
      </div>
    );
  }

  const totalEnrolled = stats?.totalEnrolled || trainees.length;
  const passedCount = stats?.passed || 0;
  const failedCount = stats?.failed || 0;
  const pendingCount = stats?.pending || 0;
  const assessedCount = passedCount + failedCount;
  const passRate = assessedCount > 0 ? Math.round((passedCount / assessedCount) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:p-0">
      {/* Control Toolbar (hidden when printing) */}
      <div className="max-w-5xl mx-auto mb-6 flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href={`/batches/${batchId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Batch</span>
          </Link>
          <div className="text-xs">
            <p className="font-bold text-slate-900">Full Batch Result Tabulation Sheet</p>
            <p className="text-slate-500 font-mono">
              {batch.batch_code} — {batch.name}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/reports/exam-results?batch_id=${batchId}&format=csv`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Batch CSV</span>
          </a>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save as PDF</span>
          </button>
        </div>
      </div>

      {/* Printable Tabulation Sheet */}
      <div className="max-w-5xl mx-auto bg-white border border-slate-300 rounded-xl p-4 sm:p-8 shadow-sm print:shadow-none print:border-none print:p-2 text-slate-900">
        {/* Official Header */}
        <div className="text-center pb-4 border-b-2 border-slate-800">
          <div className="inline-flex items-center justify-center gap-3">
            <img
              src="/images/codezenx-logo.jpg"
              alt="CodeZenX ERP"
              className="w-10 h-10 rounded-lg object-cover"
            />
            <h1 className="text-lg sm:text-2xl font-black uppercase tracking-tight text-slate-900">
              CodeZenX ERP — Manpower Training &amp; Recruitment
            </h1>
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-800 mt-1">
            Batch Exam Result Sheet • {batch.batch_code}
          </p>
        </div>

        {/* Batch Metadata (Responsive) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 my-4 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
          <div>
            <span className="text-slate-500 block">Batch</span>
            <strong className="text-slate-900">{batch.name}</strong>
          </div>
          <div>
            <span className="text-slate-500 block">Trade</span>
            <strong className="text-slate-900">{batch.trade_name}</strong>
          </div>
          <div>
            <span className="text-slate-500 block">Exam Date</span>
            <strong className="text-slate-900">
              {batch.exam_date ? formatDate(batch.exam_date) : 'Pending'}
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block">Summary</span>
            <strong className="text-slate-900">
              Total: {totalEnrolled} • Pass: {passedCount} • Fail: {failedCount} • Pending: {pendingCount}
            </strong>
          </div>
        </div>

        {/* Tabulation Table (Responsive Horizontal Scroll on small screens) */}
        <div className="border border-slate-300 rounded-lg overflow-hidden my-5">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase">
                <tr>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap">#</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">Roll</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">Name</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">Passport / Mobile</th>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap">Theory</th>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap">Practical</th>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap">Total</th>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap">Result</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">Cert No</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {trainees.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      No trainees enrolled in this batch yet.
                    </td>
                  </tr>
                ) : (
                  trainees.map((t, idx) => {
                    const s = t.student;
                    return (
                      <tr key={t._id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-center font-mono text-slate-500 whitespace-nowrap">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {s.student_no}
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-900 whitespace-nowrap">
                          {s.name}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                          {s.passport_no} • {s.mobile}
                        </td>
                        <td className="px-3 py-2 text-center font-mono whitespace-nowrap">
                          {t.theory_score !== null && t.theory_score !== undefined
                            ? `${t.theory_score}/100`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-center font-mono whitespace-nowrap">
                          {t.practical_score !== null && t.practical_score !== undefined
                            ? `${t.practical_score}/100`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-center font-mono font-bold text-slate-900 whitespace-nowrap">
                          {t.total_score !== null && t.total_score !== undefined ? `${t.total_score}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          {t.result_status === 'Passed' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                              <CheckCircle2 className="w-3 h-3" /> Passed
                            </span>
                          ) : t.result_status === 'Failed' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[11px]">
                              <XCircle className="w-3 h-3" /> Failed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium text-[11px]">
                              <Clock className="w-3 h-3" /> Pending
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                          {t.certificate_no || '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer & Official Signatures */}
        <div className="pt-10 pb-2 grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 text-center text-xs text-slate-600">
          <div>
            <div className="border-t border-slate-400 pt-1.5 font-medium">
              Trainer ({batch.instructor || 'Technical'})
            </div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-1.5 font-medium">Controller of Exams</div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-800">
              Principal / Director
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

