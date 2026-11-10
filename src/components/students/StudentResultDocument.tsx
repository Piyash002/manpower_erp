'use client';

import React from 'react';
import { Award, FileText, CheckCircle2, XCircle, Printer, Download } from 'lucide-react';
import { formatDate } from '@/lib/formatters';

interface StudentResultDocumentProps {
  student: any;
  assessment: any;
  batch?: any;
  docType: 'certificate' | 'marksheet';
  onPrint?: () => void;
}

export function StudentResultDocument({
  student,
  assessment,
  batch,
  docType,
}: StudentResultDocumentProps) {
  const theory = assessment?.theory_score ?? null;
  const practical = assessment?.practical_score ?? null;
  const total = assessment?.total_score ?? null;
  const resultStatus =
    assessment?.result_status ||
    (student.status === 'Passed' ? 'Passed' : student.status === 'Failed' ? 'Failed' : 'Pending');

  const issueDate = assessment?.certificate_issue_date
    ? formatDate(assessment.certificate_issue_date)
    : assessment?.exam_date
    ? formatDate(assessment.exam_date)
    : formatDate(new Date());

  const examDate = assessment?.exam_date
    ? formatDate(assessment.exam_date)
    : batch?.exam_date
    ? formatDate(batch.exam_date)
    : 'N/A';

  const certNo =
    assessment?.certificate_no ||
    `CERT-${new Date().getFullYear()}-${student.student_no?.replace(/[^0-9]/g, '')?.slice(-4) || '0001'}`;

  if (docType === 'certificate') {
    return (
      <div className="bg-white border-8 border-double border-emerald-800/80 rounded-xl p-8 sm:p-12 shadow-sm text-slate-900 relative overflow-hidden">
        {/* Subtle Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] select-none">
          <Award className="w-96 h-96 text-emerald-900" />
        </div>

        {/* Certificate Header */}
        <div className="text-center border-b-2 border-emerald-700/30 pb-6 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-[11px] font-bold uppercase tracking-widest text-emerald-800 mb-3">
            <Award className="w-3.5 h-3.5" />
            <span>Govt. Approved Technical Training &amp; Recruitment Center • RL-1845</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 uppercase">
            Bangladesh Manpower Training &amp; Recruitment Agency
          </h1>
          <p className="text-xs sm:text-sm font-semibold text-emerald-800 tracking-widest uppercase mt-2">
            Certificate of Skill Competency &amp; Trade Completion
          </p>
        </div>

        {/* Meta Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs font-mono text-slate-600 border-b border-slate-200 relative z-10">
          <span>
            Certificate No: <strong className="text-slate-900">{certNo}</strong>
          </span>
          <span>
            Student ID: <strong className="text-slate-900">{student.student_no}</strong>
          </span>
          <span>
            Issue Date: <strong className="text-slate-900">{issueDate}</strong>
          </span>
        </div>

        {/* Body Proclamation */}
        <div className="py-8 text-center space-y-5 relative z-10">
          <p className="text-sm text-slate-600 italic">This is to proudly certify that</p>

          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-wide underline decoration-emerald-600/50 underline-offset-8">
              {student.name}
            </h2>
            <p className="text-xs text-slate-600 pt-2">
              Son / Daughter of <strong className="text-slate-800">{student.father_name}</strong> &amp;{' '}
              <strong className="text-slate-800">{student.mother_name}</strong>
            </p>
            <p className="text-xs font-mono text-slate-500">
              Passport No: <strong className="text-slate-800">{student.passport_no}</strong> • Destination:{' '}
              <strong className="text-slate-800">{student.destination_country}</strong>
            </p>
          </div>

          <p className="text-sm text-slate-700 max-w-2xl mx-auto leading-relaxed">
            has successfully completed the practical and theoretical technical training in{' '}
            <strong className="text-emerald-800 font-bold">{student.trade_name}</strong> under Batch{' '}
            <strong className="font-mono text-slate-900">{student.batch || 'N/A'}</strong> and passed the
            final trade competency examination held on <strong>{examDate}</strong>.
          </p>

          {/* Scores Summary Strip */}
          {(theory !== null || practical !== null || total !== null) && (
            <div className="inline-grid grid-cols-4 gap-4 px-6 py-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-center text-xs mt-2">
              <div>
                <p className="text-slate-500 uppercase text-[10px] font-bold">Theory</p>
                <p className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                  {theory !== null ? `${theory}/100` : '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-500 uppercase text-[10px] font-bold">Practical</p>
                <p className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                  {practical !== null ? `${practical}/100` : '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-500 uppercase text-[10px] font-bold">Total Score</p>
                <p className="font-mono font-black text-emerald-700 text-sm mt-0.5">
                  {total !== null ? `${total}/100` : '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-500 uppercase text-[10px] font-bold">Result</p>
                <p className="font-bold text-emerald-700 text-sm mt-0.5 uppercase">{resultStatus}</p>
              </div>
            </div>
          )}
        </div>

        {/* Official Signatures */}
        <div className="pt-14 pb-2 grid grid-cols-3 gap-8 text-center text-xs text-slate-600 relative z-10">
          <div>
            <div className="border-t border-slate-400 pt-1.5 font-semibold">Trade Instructor</div>
            <p className="text-[10px] text-slate-400 mt-0.5">{assessment?.evaluated_by || 'Technical Wing'}</p>
          </div>
          <div>
            <div className="w-16 h-16 mx-auto -mt-10 mb-2 rounded-full border-2 border-dashed border-emerald-700/40 flex items-center justify-center text-[9px] font-bold text-emerald-800/60 uppercase rotate-12">
              Official Seal
            </div>
            <div className="border-t border-slate-400 pt-1.5 font-semibold">Controller of Exams</div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-800">Principal / Director</div>
            <p className="text-[10px] text-slate-400 mt-0.5">Authorized Signatory</p>
          </div>
        </div>
      </div>
    );
  }

  // MARKSHEET VIEW (Ideal for Failed & Detailed Transcript)
  return (
    <div className="bg-white border-2 border-slate-800 rounded-xl p-6 sm:p-10 shadow-sm text-slate-900">
      {/* Header */}
      <div className="text-center pb-5 border-b-2 border-slate-800">
        <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono mb-2">
          <span>TRANSCRIPT / MARKSHEET</span>
          <span>RL-1845 • GOVT APPROVED</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-900">
          Bangladesh Manpower Training &amp; Recruitment Agency
        </h1>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-600 mt-1">
          Official Trade Examination Marksheet &amp; Assessment Report
        </p>
      </div>

      {/* Student Particulars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-5 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs">
        <div className="space-y-1.5">
          <p>
            <span className="text-slate-500 font-medium">Student Roll / ID: </span>
            <strong className="font-mono text-slate-900">{student.student_no}</strong>
          </p>
          <p>
            <span className="text-slate-500 font-medium">Candidate Name: </span>
            <strong className="uppercase text-slate-900">{student.name}</strong>
          </p>
          <p>
            <span className="text-slate-500 font-medium">Father&apos;s Name: </span>
            <span className="text-slate-800">{student.father_name}</span>
          </p>
          <p>
            <span className="text-slate-500 font-medium">Mobile: </span>
            <span className="font-mono text-slate-800">{student.mobile}</span>
          </p>
        </div>
        <div className="space-y-1.5 sm:text-right">
          <p>
            <span className="text-slate-500 font-medium">Passport No: </span>
            <strong className="font-mono text-slate-900 uppercase">{student.passport_no}</strong>
          </p>
          <p>
            <span className="text-slate-500 font-medium">Trade / Skill: </span>
            <strong className="text-slate-900">{student.trade_name}</strong>
          </p>
          <p>
            <span className="text-slate-500 font-medium">Training Batch: </span>
            <strong className="font-mono text-slate-900">{student.batch || 'N/A'}</strong>
          </p>
          <p>
            <span className="text-slate-500 font-medium">Exam Date: </span>
            <strong className="text-slate-900">{examDate}</strong>
          </p>
        </div>
      </div>

      {/* Marks Table */}
      <div className="border border-slate-300 rounded-lg overflow-hidden my-5">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold">
            <tr>
              <th className="px-4 py-2.5 text-left">Assessment Component</th>
              <th className="px-4 py-2.5 text-center">Full Marks</th>
              <th className="px-4 py-2.5 text-center">Pass Marks</th>
              <th className="px-4 py-2.5 text-right">Obtained Marks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            <tr>
              <td className="px-4 py-3 font-medium text-slate-800">
                Theory Examination (Written &amp; Oral Safety)
              </td>
              <td className="px-4 py-3 text-center font-mono text-slate-600">100</td>
              <td className="px-4 py-3 text-center font-mono text-slate-600">40</td>
              <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                {theory !== null ? theory : 'N/A'}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-medium text-slate-800">
                Practical Trade Assessment (Hands-on Competency)
              </td>
              <td className="px-4 py-3 text-center font-mono text-slate-600">100</td>
              <td className="px-4 py-3 text-center font-mono text-slate-600">50</td>
              <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                {practical !== null ? practical : 'N/A'}
              </td>
            </tr>
          </tbody>
          <tfoot className="bg-slate-50 border-t-2 border-slate-300">
            <tr>
              <td colSpan={3} className="px-4 py-3 font-bold text-slate-900 uppercase">
                Overall Weighted Score &amp; Final Result
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-3">
                  <span className="font-mono font-black text-base text-slate-900">
                    {total !== null ? `${total} / 100` : '—'}
                  </span>
                  {resultStatus === 'Passed' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs uppercase">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Passed
                    </span>
                  ) : resultStatus === 'Failed' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 font-bold text-xs uppercase">
                      <XCircle className="w-3.5 h-3.5" /> Failed
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold text-xs uppercase">
                      Pending
                    </span>
                  )}
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Remarks */}
      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
        <p className="font-bold text-slate-600 uppercase">Evaluator Remarks / Retake Note:</p>
        <p className="text-slate-800">
          {assessment?.remarks ||
            (resultStatus === 'Failed'
              ? 'Candidate did not meet the minimum practical/theory competency score and is advised to appear for re-assessment.'
              : 'Assessed as per agency trade qualification standards.')}
        </p>
        {assessment?.evaluated_by && (
          <p className="text-[11px] text-slate-500 pt-1">
            Evaluated By: <strong>{assessment.evaluated_by}</strong>
          </p>
        )}
      </div>

      {/* Signatures */}
      <div className="pt-14 pb-2 grid grid-cols-3 gap-8 text-center text-xs text-slate-600">
        <div>
          <div className="border-t border-slate-400 pt-1.5 font-medium">Candidate Signature</div>
        </div>
        <div>
          <div className="border-t border-slate-400 pt-1.5 font-medium">Examiner / Instructor</div>
        </div>
        <div>
          <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-800">
            Controller of Examinations
          </div>
        </div>
      </div>
    </div>
  );
}
