'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Printer, ArrowLeft, Download, Loader2, Award, FileText } from 'lucide-react';
import { StudentResultDocument } from '@/components/students/StudentResultDocument';

function StudentResultPrintContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const studentId = params?.id as string;
  const docTypeParam = searchParams?.get('type');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!studentId) return;
    fetch(`/api/students/${studentId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.message || 'Candidate not found');
        setData(d);
      })
      .catch((err) => setError(err.message || 'Failed to load document'))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 text-slate-600 gap-2">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
        <span className="text-sm font-medium">Loading official document...</span>
      </div>
    );
  }

  if (error || !data?.student) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 max-w-md w-full text-center space-y-3">
          <p className="text-rose-600 font-semibold text-sm">{error || 'Record not found'}</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const { student, assessment, batch } = data;
  const docType: 'certificate' | 'marksheet' =
    docTypeParam === 'marksheet'
      ? 'marksheet'
      : docTypeParam === 'certificate'
      ? 'certificate'
      : student.status === 'Failed' || assessment?.result_status === 'Failed'
      ? 'marksheet'
      : 'certificate';

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:p-0">
      {/* Control Toolbar (hidden when printing) */}
      <div className="max-w-4xl mx-auto mb-6 flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href="/students"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Directory</span>
          </Link>
          <div className="text-xs">
            <p className="font-bold text-slate-900">
              {docType === 'certificate' ? 'Official Certificate' : 'Official Exam Marksheet'}
            </p>
            <p className="text-slate-500 font-mono">
              {student.student_no} — {student.name}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Switch between Certificate / Marksheet */}
          <Link
            href={`/students/${studentId}/result?type=${docType === 'certificate' ? 'marksheet' : 'certificate'}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            {docType === 'certificate' ? (
              <>
                <FileText className="w-3.5 h-3.5" />
                <span>View Marksheet</span>
              </>
            ) : (
              <>
                <Award className="w-3.5 h-3.5" />
                <span>View Certificate</span>
              </>
            )}
          </Link>

          {docType === 'certificate' && assessment?.certificate_url && (
            <a
              href={assessment.certificate_url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Uploaded File</span>
            </a>
          )}

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save as PDF</span>
          </button>
        </div>
      </div>

      {/* Document Container */}
      <div className="max-w-4xl mx-auto">
        <StudentResultDocument
          student={student}
          assessment={assessment}
          batch={batch}
          docType={docType}
        />
      </div>
    </div>
  );
}

export default function StudentResultPrintPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-500 text-sm">
          Loading document...
        </div>
      }
    >
      <StudentResultPrintContent />
    </Suspense>
  );
}
