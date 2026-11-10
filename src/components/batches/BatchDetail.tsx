'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  GraduationCap,
  ArrowLeft,
  Calendar,
  Users,
  Award,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Upload,
  ExternalLink,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Search,
  Check,
  UserPlus,
  Paperclip,
  Download,
  Printer,
} from 'lucide-react';
import { formatDate } from '@/lib/formatters';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/components/layout/DashboardLayout';

interface TraineeAssessment {
  _id: string;
  student: {
    _id: string;
    name: string;
    student_no: string;
    mobile: string;
    passport_no: string;
    status: string;
    trade_name: string;
    destination_country: string;
  };
  exam_date?: string | null;
  theory_score?: number | null;
  practical_score?: number | null;
  total_score?: number | null;
  result_status: 'Pending' | 'Passed' | 'Failed';
  certificate_no?: string;
  certificate_url?: string;
  certificate_issue_date?: string | null;
  remarks?: string;
  evaluated_by?: string;
}

interface BatchDetailProps {
  batchId: string;
}

export function BatchDetail({ batchId }: BatchDetailProps) {
  const { user } = useAuth();
  const [batch, setBatch] = useState<any | null>(null);
  const [trainees, setTrainees] = useState<TraineeAssessment[]>([]);
  const [availableStudents, setAvailableStudents] = useState<any[]>([]);
  const [stats, setStats] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Assessment & Certificate Modal state
  const [selectedTrainee, setSelectedTrainee] = useState<TraineeAssessment | null>(null);
  const [isGradeModalOpen, setIsGradeModalOpen] = useState(false);
  const [gradeFormData, setGradeFormData] = useState({
    exam_date: new Date().toISOString().split('T')[0],
    theory_score: '',
    practical_score: '',
    result_status: 'Passed' as 'Pending' | 'Passed' | 'Failed',
    certificate_no: '',
    certificate_url: '',
    certificate_issue_date: new Date().toISOString().split('T')[0],
    remarks: '',
  });
  const [uploadingCert, setUploadingCert] = useState(false);
  const [isSubmittingGrade, setIsSubmittingGrade] = useState(false);
  const [gradeError, setGradeError] = useState('');

  // Enroll Students Modal state
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [selectedEnrollIds, setSelectedEnrollIds] = useState<string[]>([]);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState('');

  // Edit Batch Modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  const canEdit = user?.role === 'Admin' || user?.role === 'Counselor';

  const loadBatchData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/batches/${batchId}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to load batch');
      }

      setBatch(data.batch);
      setTrainees(data.trainees || []);
      setAvailableStudents(data.availableTradeStudents || []);
      setStats(data.stats || null);

      setEditFormData({
        name: data.batch.name,
        start_date: data.batch.start_date ? data.batch.start_date.split('T')[0] : '',
        end_date: data.batch.end_date ? data.batch.end_date.split('T')[0] : '',
        exam_date: data.batch.exam_date ? data.batch.exam_date.split('T')[0] : '',
        instructor: data.batch.instructor || '',
        capacity: data.batch.capacity?.toString() || '30',
        status: data.batch.status,
        notes: data.batch.notes || '',
      });
    } catch (err: any) {
      setError(err.message || 'Error fetching batch detail');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBatchData();
  }, [batchId]);

  // Open Grade Modal
  const openGradeModal = (t: TraineeAssessment) => {
    setSelectedTrainee(t);
    setGradeFormData({
      exam_date: t.exam_date ? t.exam_date.split('T')[0] : (batch?.exam_date ? batch.exam_date.split('T')[0] : new Date().toISOString().split('T')[0]),
      theory_score: t.theory_score !== null && t.theory_score !== undefined ? t.theory_score.toString() : '80',
      practical_score: t.practical_score !== null && t.practical_score !== undefined ? t.practical_score.toString() : '85',
      result_status: t.result_status || 'Passed',
      certificate_no: t.certificate_no || `CERT-${batch?.batch_code || 'TC'}-${t.student.student_no.replace(/[^0-9]/g, '')}`,
      certificate_url: t.certificate_url || '',
      certificate_issue_date: t.certificate_issue_date ? t.certificate_issue_date.split('T')[0] : new Date().toISOString().split('T')[0],
      remarks: t.remarks || '',
    });
    setGradeError('');
    setIsGradeModalOpen(true);
  };

  // Upload Certificate File
  const handleCertUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingCert(true);
    setGradeError('');

    try {
      const data = new FormData();
      data.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: data,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'File upload failed');
      }

      setGradeFormData((prev) => ({
        ...prev,
        certificate_url: json.url,
      }));
    } catch (err: any) {
      setGradeError(err.message || 'Certificate upload error');
    } finally {
      setUploadingCert(false);
    }
  };

  // Submit Grade & Certificate
  const handleGradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrainee) return;

    setGradeError('');
    setIsSubmittingGrade(true);

    try {
      const res = await fetch(`/api/batches/${batchId}/assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: selectedTrainee.student._id,
          exam_date: gradeFormData.exam_date,
          theory_score: gradeFormData.theory_score ? Number(gradeFormData.theory_score) : null,
          practical_score: gradeFormData.practical_score ? Number(gradeFormData.practical_score) : null,
          result_status: gradeFormData.result_status,
          certificate_no: gradeFormData.certificate_no,
          certificate_url: gradeFormData.certificate_url,
          certificate_issue_date: gradeFormData.certificate_issue_date,
          remarks: gradeFormData.remarks,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to save examination result');
      }

      setIsGradeModalOpen(false);
      loadBatchData();
    } catch (err: any) {
      setGradeError(err.message || 'Submission error');
    } finally {
      setIsSubmittingGrade(false);
    }
  };

  // Enroll Selected Students
  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEnrollIds.length === 0) return;

    setEnrollError('');
    setIsEnrolling(true);

    try {
      const res = await fetch(`/api/batches/${batchId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_ids: selectedEnrollIds }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to enroll students');
      }

      setIsEnrollModalOpen(false);
      setSelectedEnrollIds([]);
      loadBatchData();
    } catch (err: any) {
      setEnrollError(err.message || 'Enrollment error');
    } finally {
      setIsEnrolling(false);
    }
  };

  // Update Batch Details
  const handleEditBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');
    setIsSubmittingEdit(true);

    try {
      const res = await fetch(`/api/batches/${batchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Update failed');
      }

      setIsEditModalOpen(false);
      loadBatchData();
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'In Training':
        return (
          <Badge variant="info" className="whitespace-nowrap">
            In Training
          </Badge>
        );
      case 'Completed':
        return (
          <Badge variant="success" className="whitespace-nowrap">
            Completed
          </Badge>
        );
      case 'Upcoming':
        return (
          <Badge variant="warning" className="whitespace-nowrap">
            Upcoming
          </Badge>
        );
      case 'Archived':
      default:
        return (
          <Badge variant="gray" className="whitespace-nowrap">
            Archived
          </Badge>
        );
    }
  };

  const getResultBadge = (status: string) => {
    switch (status) {
      case 'Passed':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full whitespace-nowrap">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            Passed
          </span>
        );
      case 'Failed':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-800 bg-rose-100 px-2.5 py-0.5 rounded-full whitespace-nowrap">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            Failed
          </span>
        );
      case 'Pending':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full whitespace-nowrap">
            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
            Pending
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center">
        <RefreshCw className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-600">Loading batch & assessment records...</p>
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-2" />
        <h3 className="text-lg font-bold text-slate-800">Batch Not Found</h3>
        <p className="text-sm text-slate-500 mt-1">{error || 'Could not load batch details.'}</p>
        <Link
          href="/batches"
          className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Batches
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Navigation & Title */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-start gap-3 min-w-0">
          <Link
            href="/batches"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors shrink-0 mt-0.5"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug">
              {batch.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-500">
              <span className="font-mono bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded border border-blue-200 whitespace-nowrap">
                {batch.batch_code}
              </span>
              {getStatusBadge(batch.status)}
              <span className="text-slate-300 hidden sm:inline">•</span>
              <span className="font-medium text-slate-700">{batch.trade_name}</span>
              {batch.instructor && (
                <>
                  <span className="text-slate-300">•</span>
                  <span>Trainer: {batch.instructor}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href={`/api/reports/exam-results?batch_id=${batchId}&format=csv`}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap"
            title="Download full batch results as CSV"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>Result CSV</span>
          </a>

          <Link
            href={`/batches/${batchId}/result`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap"
            title="Open printable full batch result sheet"
          >
            <Printer className="w-3.5 h-3.5 shrink-0" />
            <span>Print Result</span>
          </Link>

          {canEdit && (
            <>
              <button
                onClick={() => setIsEnrollModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5 shrink-0" />
                <span>Enroll</span>
              </button>
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-xs transition-colors whitespace-nowrap"
              >
                <Edit className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>Edit</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Balanced 4-Column Responsive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Dates & Schedule */}
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Schedule &amp; Exam
          </span>
          <div className="flex items-center justify-between text-xs text-slate-700">
            <span className="text-slate-500">Duration:</span>
            <span className="font-semibold whitespace-nowrap">
              {formatDate(batch.start_date)} – {formatDate(batch.end_date)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
            <span className="text-amber-700 font-semibold">Exam Date:</span>
            <span className="font-bold text-amber-800 whitespace-nowrap">
              {batch.exam_date ? formatDate(batch.exam_date) : 'Pending'}
            </span>
          </div>
        </div>

        {/* Total Trainees */}
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Enrolled Trainees
          </span>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {stats?.totalEnrolled || 0}
            <span className="text-xs font-normal text-slate-400 ml-1">/ {batch.capacity}</span>
          </p>
        </div>

        {/* Passed & Failed */}
        <div className="p-4 bg-white rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
            Exam Results
          </span>
          <div className="flex items-baseline gap-2 mt-1 flex-wrap">
            <span className="text-2xl font-black text-emerald-700">{stats?.passed || 0}</span>
            <span className="text-xs font-bold text-emerald-600">Pass</span>
            {stats?.failed > 0 && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-lg font-bold text-rose-700">{stats?.failed}</span>
                <span className="text-xs font-semibold text-rose-600">Fail</span>
              </>
            )}
            <span className="text-xs text-slate-500 ml-auto">{stats?.pending || 0} pending</span>
          </div>
        </div>

        {/* Certificates Issued */}
        <div className="p-4 bg-white rounded-xl border border-blue-200 bg-blue-50/20 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
            Certificates Issued
          </span>
          <p className="text-2xl font-black text-blue-700 mt-1">
            {stats?.certificatesIssued || 0}
            <span className="text-xs font-normal text-blue-600 ml-1.5">issued</span>
          </p>
        </div>
      </div>

      {/* Trainees & Examination Assessment Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Exam Results &amp; Certificates</h3>
            <p className="text-xs text-slate-500">
              Grade scores, set Pass/Fail status, and upload certificates.
            </p>
          </div>

          <button
            onClick={loadBatchData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-xs whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Refresh</span>
          </button>
        </div>

        {trainees.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <Users className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <p className="font-bold text-slate-800">No candidates enrolled in this batch yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Click &quot;Enroll&quot; above to add {batch.trade_name} students into this batch.
            </p>
            {canEdit && (
              <button
                onClick={() => setIsEnrollModalOpen(true)}
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm"
              >
                <UserPlus className="w-4 h-4" /> Enroll Candidates
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Candidate</th>
                  <th className="px-4 py-3 whitespace-nowrap text-center">Theory</th>
                  <th className="px-4 py-3 whitespace-nowrap text-center">Practical</th>
                  <th className="px-4 py-3 whitespace-nowrap text-center">Total</th>
                  <th className="px-4 py-3 whitespace-nowrap text-center">Result</th>
                  <th className="px-4 py-3 whitespace-nowrap">Certificate</th>
                  <th className="px-4 py-3 whitespace-nowrap text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trainees.map((t) => {
                  const s = t.student;
                  const hasCert = Boolean(t.certificate_url);
                  return (
                    <tr key={t._id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Candidate Column */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700 shrink-0">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/students/${s._id}`}
                              className="font-semibold text-slate-900 hover:text-blue-600 transition-colors block truncate max-w-[200px]"
                            >
                              {s.name}
                            </Link>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5 whitespace-nowrap">
                              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px] text-slate-700">
                                {s.student_no}
                              </span>
                              <span>•</span>
                              <span className="font-mono">{s.mobile}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Theory Score */}
                      <td className="px-4 py-3 text-center text-xs font-medium text-slate-700 whitespace-nowrap">
                        {t.theory_score !== null && t.theory_score !== undefined ? (
                          <span className="font-mono font-bold">{t.theory_score}/100</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Practical Score */}
                      <td className="px-4 py-3 text-center text-xs font-medium text-slate-700 whitespace-nowrap">
                        {t.practical_score !== null && t.practical_score !== undefined ? (
                          <span className="font-mono font-bold">{t.practical_score}/100</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Total Score */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {t.total_score !== null && t.total_score !== undefined ? (
                          <span className="inline-flex px-2 py-0.5 bg-slate-100 rounded-md font-mono font-bold text-xs text-slate-900">
                            {t.total_score}%
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Result Status */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {getResultBadge(t.result_status)}
                      </td>

                      {/* Certificate */}
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {hasCert ? (
                          <a
                            href={t.certificate_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-mono font-semibold text-blue-600 hover:underline"
                          >
                            <Award className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span>{t.certificate_no || 'View'}</span>
                            <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {canEdit ? (
                          <button
                            onClick={() => openGradeModal(t)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors whitespace-nowrap"
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            <span>Grade</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">View</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* GRADE & CERTIFICATE MODAL */}
      <Modal
        isOpen={isGradeModalOpen}
        onClose={() => setIsGradeModalOpen(false)}
        title="Grade Exam & Issue Certificate"
        description="Enter trainee test scores, evaluate result status, and upload training completion certificate"
        maxWidth="lg"
      >
        {selectedTrainee && (
          <form onSubmit={handleGradeSubmit} className="space-y-4">
            {/* Candidate Banner */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">
                  {selectedTrainee.student.name}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  ID: {selectedTrainee.student.student_no} • {selectedTrainee.student.mobile}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-slate-500 uppercase">Trade</span>
                <p className="font-bold text-slate-800 text-xs">{batch.trade_name}</p>
              </div>
            </div>

            {gradeError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{gradeError}</span>
              </div>
            )}

            {/* Exam Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Exam Date *
                </label>
                <input
                  type="date"
                  value={gradeFormData.exam_date}
                  onChange={(e) => setGradeFormData({ ...gradeFormData, exam_date: e.target.value })}
                  required
                  className="w-full px-3 py-2 text-xs md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Theory Score (0-100)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={gradeFormData.theory_score}
                  onChange={(e) => setGradeFormData({ ...gradeFormData, theory_score: e.target.value })}
                  placeholder="e.g. 85"
                  className="w-full px-3 py-2 text-xs md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Practical Score (0-100)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={gradeFormData.practical_score}
                  onChange={(e) => setGradeFormData({ ...gradeFormData, practical_score: e.target.value })}
                  placeholder="e.g. 90"
                  className="w-full px-3 py-2 text-xs md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Result Status */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Evaluation Result Status *
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setGradeFormData({ ...gradeFormData, result_status: 'Passed' })}
                  className={`py-2 px-3 text-xs font-bold rounded-lg border flex items-center justify-center gap-1.5 transition-all ${
                    gradeFormData.result_status === 'Passed'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" /> Passed
                </button>

                <button
                  type="button"
                  onClick={() => setGradeFormData({ ...gradeFormData, result_status: 'Failed' })}
                  className={`py-2 px-3 text-xs font-bold rounded-lg border flex items-center justify-center gap-1.5 transition-all ${
                    gradeFormData.result_status === 'Failed'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <AlertCircle className="w-4 h-4" /> Failed
                </button>

                <button
                  type="button"
                  onClick={() => setGradeFormData({ ...gradeFormData, result_status: 'Pending' })}
                  className={`py-2 px-3 text-xs font-bold rounded-lg border flex items-center justify-center gap-1.5 transition-all ${
                    gradeFormData.result_status === 'Pending'
                      ? 'bg-slate-700 text-white border-slate-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Clock className="w-4 h-4" /> Pending
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Setting to &quot;Passed&quot; or &quot;Failed&quot; will automatically sync candidate profile status in ERP.
              </p>
            </div>

            {/* Certificate Section */}
            <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-200/70 space-y-3">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-blue-600" />
                <h5 className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                  Certificate Upload & Verification
                </h5>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Certificate Number
                  </label>
                  <input
                    type="text"
                    value={gradeFormData.certificate_no}
                    onChange={(e) => setGradeFormData({ ...gradeFormData, certificate_no: e.target.value })}
                    placeholder="e.g. CERT-PW-2026-001"
                    className="w-full px-3 py-2 text-xs md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Issue Date
                  </label>
                  <input
                    type="date"
                    value={gradeFormData.certificate_issue_date}
                    onChange={(e) => setGradeFormData({ ...gradeFormData, certificate_issue_date: e.target.value })}
                    className="w-full px-3 py-2 text-xs md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* File Upload Control */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Upload Certificate Document (PDF / Image)
                </label>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer shadow-xs transition-colors">
                    <Upload className="w-4 h-4 text-slate-500" />
                    <span>{uploadingCert ? 'Uploading...' : 'Choose Certificate File'}</span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={handleCertUpload}
                      disabled={uploadingCert}
                      className="hidden"
                    />
                  </label>

                  {gradeFormData.certificate_url && (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Certificate Attached</span>
                      <a
                        href={gradeFormData.certificate_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline inline-flex items-center gap-0.5 ml-1"
                      >
                        Preview <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Examiner Remarks / Notes
              </label>
              <textarea
                rows={2}
                value={gradeFormData.remarks}
                onChange={(e) => setGradeFormData({ ...gradeFormData, remarks: e.target.value })}
                placeholder="Optional feedback, welder stamping code, or grade comments..."
                className="w-full px-3 py-2 text-xs md:text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsGradeModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingGrade}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {isSubmittingGrade ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Save Result & Certificate
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ENROLL STUDENTS MODAL */}
      <Modal
        isOpen={isEnrollModalOpen}
        onClose={() => setIsEnrollModalOpen(false)}
        title={`Enroll Candidates to Batch (${batch.batch_code})`}
        description={`Select admitted students enrolled in ${batch.trade_name} to assign them to this batch.`}
        maxWidth="lg"
      >
        <form onSubmit={handleEnrollSubmit} className="space-y-4">
          {enrollError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{enrollError}</span>
            </div>
          )}

          {availableStudents.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              <Users className="w-8 h-8 mx-auto mb-2 text-slate-400" />
              <p className="text-sm font-semibold text-slate-700">
                All registered candidates in this trade are already enrolled in this batch.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Admit new candidates under {batch.trade_name} to assign them here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 pb-1 border-b border-slate-100">
                <span>Available Candidates ({availableStudents.length})</span>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedEnrollIds.length === availableStudents.length) {
                      setSelectedEnrollIds([]);
                    } else {
                      setSelectedEnrollIds(availableStudents.map((s) => s._id));
                    }
                  }}
                  className="text-blue-600 font-semibold hover:underline"
                >
                  {selectedEnrollIds.length === availableStudents.length
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {availableStudents.map((s) => {
                  const isChecked = selectedEnrollIds.includes(s._id);
                  return (
                    <label
                      key={s._id}
                      className={`flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer transition-colors ${
                        isChecked ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedEnrollIds([...selectedEnrollIds, s._id]);
                          } else {
                            setSelectedEnrollIds(selectedEnrollIds.filter((id) => id !== s._id));
                          }
                        }}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div className="flex-1 text-xs">
                        <span className="font-bold text-slate-900 block">{s.name}</span>
                        <span className="font-mono text-slate-500">
                          {s.student_no} • {s.mobile} • Passport: {s.passport_no || 'N/A'}
                        </span>
                      </div>
                      <Badge variant="gray">{s.status}</Badge>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsEnrollModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isEnrolling || selectedEnrollIds.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              {isEnrolling ? 'Enrolling...' : `Enroll (${selectedEnrollIds.length}) Selected`}
            </button>
          </div>
        </form>
      </Modal>

      {/* EDIT BATCH MODAL */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Batch Details"
        description="Update dates, examination timeline, status or trainer assignment"
        maxWidth="md"
      >
        <form onSubmit={handleEditBatchSubmit} className="space-y-4">
          {editError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{editError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Batch Title *
            </label>
            <input
              type="text"
              value={editFormData.name || ''}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              required
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Start Date *
              </label>
              <input
                type="date"
                value={editFormData.start_date || ''}
                onChange={(e) => setEditFormData({ ...editFormData, start_date: e.target.value })}
                required
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                End Date *
              </label>
              <input
                type="date"
                value={editFormData.end_date || ''}
                onChange={(e) => setEditFormData({ ...editFormData, end_date: e.target.value })}
                required
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Scheduled Exam Date
              </label>
              <input
                type="date"
                value={editFormData.exam_date || ''}
                onChange={(e) => setEditFormData({ ...editFormData, exam_date: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Status
              </label>
              <select
                value={editFormData.status || 'Upcoming'}
                onChange={(e: any) => setEditFormData({ ...editFormData, status: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="Upcoming">Upcoming</option>
                <option value="In Training">In Training</option>
                <option value="Completed">Completed</option>
                <option value="Archived">Archived</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Trainer / Instructor
            </label>
            <input
              type="text"
              value={editFormData.instructor || ''}
              onChange={(e) => setEditFormData({ ...editFormData, instructor: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingEdit}
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              {isSubmittingEdit ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

