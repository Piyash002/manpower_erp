'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Printer, ArrowLeft, Loader2, User, CheckCircle2, Clock } from 'lucide-react';
import { formatBDT, formatDate } from '@/lib/formatters';

export default function StudentAdmissionPadPage() {
  const params = useParams();
  const studentId = params?.id as string;

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
      .catch((err) => setError(err.message || 'Failed to load admission form'))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 text-slate-600 gap-2">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
        <span className="text-sm font-medium">Loading candidate admission pad...</span>
      </div>
    );
  }

  if (error || !data?.student) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 max-w-md w-full text-center space-y-3">
          <p className="text-rose-600 font-semibold text-sm">{error || 'Record not found'}</p>
          <Link
            href="/students"
            className="inline-block px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold"
          >
            Back to Directory
          </Link>
        </div>
      </div>
    );
  }

  const { student, documents = [], assessment } = data;
  const fees = student.fee_snapshot || {};

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4 print:bg-white print:p-0">
      {/* Control Toolbar (hidden when printing) */}
      <div className="max-w-4xl mx-auto mb-5 flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href={`/students/${studentId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Profile</span>
          </Link>
          <div className="text-xs">
            <p className="font-bold text-slate-900">Candidate Official Admission Form</p>
            <p className="text-slate-500 font-mono">
              {student.student_no} — {student.name}
            </p>
          </div>
        </div>

        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
        >
          <Printer className="w-4 h-4" />
          <span>Print / Save Form (PDF)</span>
        </button>
      </div>

      {/* Official Agency Pad Form */}
      <div className="max-w-4xl mx-auto bg-white border border-slate-300 rounded-xl p-6 sm:p-10 shadow-sm print:shadow-none print:border-none print:p-2 text-slate-900 text-xs">
        {/* Pad Letterhead */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b-2 border-slate-900">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest rounded">
              Govt. Approved • RL-1845
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight uppercase text-slate-900 pt-1">
              Bangladesh Manpower Training &amp; Recruitment Agency
            </h1>
            <p className="text-[11px] text-slate-600">
              Technical Trade Training Academy &amp; Overseas Employment Bureau • Dhaka Campus, Bangladesh
            </p>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-800 pt-1">
              Official Candidate Admission &amp; Bio-Data Form
            </p>
          </div>

          {/* Photo & Roll Box */}
          <div className="flex items-start gap-3 shrink-0">
            <div className="text-right space-y-1">
              <div className="px-2.5 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-slate-900">
                ID: {student.student_no}
              </div>
              <p className="text-[11px] text-slate-600">
                Admitted: <strong>{formatDate(student.admission_date)}</strong>
              </p>
              <p className="text-[11px] text-slate-600">
                Status: <strong className="uppercase">{student.status}</strong>
              </p>
            </div>

            <div className="w-24 h-28 border-2 border-slate-400 rounded-lg overflow-hidden bg-slate-50 flex items-center justify-center shrink-0">
              {student.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={student.photo_url}
                  alt={student.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center text-slate-400 p-1">
                  <User className="w-7 h-7 mx-auto mb-1 opacity-60" />
                  <span className="text-[9px] uppercase font-semibold block">Photo</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 1: Personal & Identity Details */}
        <div className="mt-5">
          <h2 className="bg-slate-100 border border-slate-300 px-3 py-1.5 font-bold uppercase tracking-wider text-[11px] text-slate-800">
            1. Candidate Personal &amp; Identity Particulars
          </h2>
          <table className="w-full border-collapse border border-slate-300">
            <tbody>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold w-1/4">Full Name</td>
                <td className="border border-slate-300 px-3 py-1.5 font-bold uppercase w-1/4">{student.name}</td>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold w-1/4">NID / Birth Cert No</td>
                <td className="border border-slate-300 px-3 py-1.5 font-mono font-bold w-1/4">{student.nid_or_birth_cert}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold">Father&apos;s Name</td>
                <td className="border border-slate-300 px-3 py-1.5">{student.father_name}</td>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold">Mother&apos;s Name</td>
                <td className="border border-slate-300 px-3 py-1.5">{student.mother_name}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold">Date of Birth</td>
                <td className="border border-slate-300 px-3 py-1.5">{formatDate(student.date_of_birth)}</td>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold">Gender / Blood Group</td>
                <td className="border border-slate-300 px-3 py-1.5">{student.gender} • {student.blood_group || 'N/A'}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold">Religion</td>
                <td className="border border-slate-300 px-3 py-1.5">{student.religion || 'Islam'}</td>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold">Marital Status</td>
                <td className="border border-slate-300 px-3 py-1.5">{student.marital_status || 'Single'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section 2: Contact & Addresses */}
        <div className="mt-4">
          <h2 className="bg-slate-100 border border-slate-300 px-3 py-1.5 font-bold uppercase tracking-wider text-[11px] text-slate-800">
            2. Contact Information &amp; Addresses
          </h2>
          <table className="w-full border-collapse border border-slate-300">
            <tbody>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold w-1/4">Mobile Number</td>
                <td className="border border-slate-300 px-3 py-1.5 font-mono font-bold w-1/4">{student.mobile}</td>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold w-1/4">Email Address</td>
                <td className="border border-slate-300 px-3 py-1.5 w-1/4">{student.email || '—'}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold">Emergency Contact</td>
                <td colSpan={3} className="border border-slate-300 px-3 py-1.5">
                  <strong>{student.emergency_contact_name}</strong> ({student.emergency_contact_relation}) —{' '}
                  <span className="font-mono font-semibold">{student.emergency_contact_phone}</span>
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold">Present Address</td>
                <td colSpan={3} className="border border-slate-300 px-3 py-1.5">{student.present_address}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold">Permanent Address</td>
                <td colSpan={3} className="border border-slate-300 px-3 py-1.5">{student.permanent_address}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section 3: Passport, Training & Overseas Deployment */}
        <div className="mt-4">
          <h2 className="bg-slate-100 border border-slate-300 px-3 py-1.5 font-bold uppercase tracking-wider text-[11px] text-slate-800">
            3. Passport, Trade Training &amp; Overseas Target
          </h2>
          <table className="w-full border-collapse border border-slate-300">
            <tbody>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold w-1/4">Passport Number</td>
                <td className="border border-slate-300 px-3 py-1.5 font-mono font-bold uppercase w-1/4">{student.passport_no}</td>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold w-1/4">Issue / Expiry Date</td>
                <td className="border border-slate-300 px-3 py-1.5 w-1/4">
                  {student.passport_issue_date ? formatDate(student.passport_issue_date) : '—'} /{' '}
                  <strong>{student.passport_expiry_date ? formatDate(student.passport_expiry_date) : '—'}</strong>
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold">Trade Curriculum</td>
                <td className="border border-slate-300 px-3 py-1.5 font-bold">{student.trade_name}</td>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold">Batch &amp; Session</td>
                <td className="border border-slate-300 px-3 py-1.5 font-mono">
                  {student.batch || 'N/A'} ({student.session || 'Morning'})
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold">Target Destination</td>
                <td className="border border-slate-300 px-3 py-1.5 font-bold">{student.destination_country}</td>
                <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold">Contract Duration</td>
                <td className="border border-slate-300 px-3 py-1.5">
                  {student.destination_contract_years ? `${student.destination_contract_years} Years` : 'Course Only / TBD'}
                </td>
              </tr>
              {student.has_previous_overseas_work && (
                <tr>
                  <td className="border border-slate-300 px-3 py-1.5 bg-slate-50/70 font-semibold">Prior Overseas Work</td>
                  <td colSpan={3} className="border border-slate-300 px-3 py-1.5">
                    {student.overseas_country} ({student.overseas_from_year}–{student.overseas_to_year}) • Trade:{' '}
                    {student.overseas_trade} • Old Passport: <span className="font-mono">{student.overseas_passport_no || '—'}</span> •
                    Visa: <span className="font-mono">{student.overseas_visa_no || '—'}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Section 4: Package Fee Summary & Documents Status */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <h2 className="bg-slate-100 border border-slate-300 px-3 py-1.5 font-bold uppercase tracking-wider text-[11px] text-slate-800">
              4. Package Fee Breakdown (BDT)
            </h2>
            <table className="w-full border-collapse border border-slate-300">
              <tbody>
                <tr>
                  <td className="border border-slate-300 px-3 py-1 bg-slate-50/70">Admission Fee</td>
                  <td className="border border-slate-300 px-3 py-1 text-right font-mono">{formatBDT(fees.admission_fee || 0)}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-3 py-1 bg-slate-50/70">Training Course Fee</td>
                  <td className="border border-slate-300 px-3 py-1 text-right font-mono">{formatBDT(fees.course_fee || 0)}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-3 py-1 bg-slate-50/70">Visa Processing Cost</td>
                  <td className="border border-slate-300 px-3 py-1 text-right font-mono">{formatBDT(fees.visa_cost || 0)}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-3 py-1 bg-slate-50/70">Govt. / Medical Fee</td>
                  <td className="border border-slate-300 px-3 py-1 text-right font-mono">{formatBDT(fees.govt_fee || 0)}</td>
                </tr>
                {fees.discount > 0 && (
                  <tr>
                    <td className="border border-slate-300 px-3 py-1 bg-slate-50/70 text-emerald-700">Special Discount</td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono text-emerald-700">-{formatBDT(fees.discount)}</td>
                  </tr>
                )}
                <tr className="bg-slate-100 font-bold">
                  <td className="border border-slate-300 px-3 py-1.5">Total Agreed Payable</td>
                  <td className="border border-slate-300 px-3 py-1.5 text-right font-mono">{formatBDT(fees.total_payable || 0)}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-3 py-1 font-semibold text-emerald-700">Total Paid to Date</td>
                  <td className="border border-slate-300 px-3 py-1 text-right font-mono font-bold text-emerald-700">{formatBDT(student.total_paid || 0)}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-3 py-1 font-semibold text-rose-700">Remaining Balance Due</td>
                  <td className="border border-slate-300 px-3 py-1 text-right font-mono font-bold text-rose-700">{formatBDT(student.total_due || 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="bg-slate-100 border border-slate-300 px-3 py-1.5 font-bold uppercase tracking-wider text-[11px] text-slate-800">
              5. Submitted Documents &amp; Result Status
            </h2>
            <div className="border border-slate-300 p-2.5 space-y-1.5">
              {documents.map((d: any) => (
                <div key={d._id} className="flex items-center justify-between text-[11px] border-b border-slate-100 pb-1 last:border-none last:pb-0">
                  <span className="font-medium text-slate-800">{d.document_type}</span>
                  {d.received ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                      <CheckCircle2 className="w-3 h-3" /> Received
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <Clock className="w-3 h-3" /> Pending
                    </span>
                  )}
                </div>
              ))}

              {assessment && (
                <div className="mt-2 pt-2 border-t border-slate-300 text-[11px] flex justify-between font-semibold">
                  <span>Exam Result: <strong>{assessment.result_status}</strong> ({assessment.total_score ?? '—'}%)</span>
                  {assessment.certificate_no && <span className="font-mono">{assessment.certificate_no}</span>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Declaration */}
        <div className="mt-4 p-2.5 bg-slate-50 border border-slate-200 rounded text-[10px] text-slate-600 leading-relaxed">
          <strong>Declaration:</strong> I hereby declare that all information, identity documents, and passport particulars submitted above are true and accurate to the best of my knowledge. I agree to abide by the training discipline and agency terms.
        </div>

        {/* Signature Blocks */}
        <div className="pt-12 pb-2 grid grid-cols-3 gap-8 text-center text-xs text-slate-700">
          <div>
            <div className="border-t border-slate-500 pt-1.5 font-semibold">Candidate Signature</div>
          </div>
          <div>
            <div className="border-t border-slate-500 pt-1.5 font-semibold">
              Admitted By ({student.created_by || 'Counselor'})
            </div>
          </div>
          <div>
            <div className="border-t border-slate-500 pt-1.5 font-bold text-slate-900">
              Authorized Director &amp; Seal
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

