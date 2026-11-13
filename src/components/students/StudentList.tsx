'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  UserPlus,
  Users,
  AlertTriangle,
  Eye,
  Edit3,
  Trash2,
  Loader2,
  CheckCircle2,
  User,
  Phone,
  Plane,
  GraduationCap,
  Upload,
  Award,
  FileText,
  Download,
  ArrowUpDown,
  Printer,
  ExternalLink,
  FileSpreadsheet,
} from 'lucide-react';
import { formatBDT } from '@/lib/formatters';
import { downloadExcel, printTableReport } from '@/lib/client-export';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/components/layout/DashboardLayout';
import { StudentResultDocument } from './StudentResultDocument';

interface StudentListItem {
  _id: string;
  student_no: string;
  name: string;
  father_name?: string;
  mother_name?: string;
  photo_url?: string;
  trade_id?: { _id: string; name: string };
  trade_name: string;
  batch: string;
  destination_country: string;
  mobile: string;
  passport_no: string;
  status: string;
  total_paid: number;
  total_due: number;
  fee_snapshot: {
    total_payable: number;
  };
  is_overdue?: boolean;
  assessment?: {
    theory_score?: number | null;
    practical_score?: number | null;
    total_score?: number | null;
    result_status?: 'Pending' | 'Passed' | 'Failed';
    certificate_no?: string;
    certificate_url?: string;
    certificate_issue_date?: string;
    exam_date?: string;
    remarks?: string;
    evaluated_by?: string;
  } | null;
}

export function StudentList() {
  const router = useRouter();
  const { user } = useAuth();
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTrade, setSelectedTrade] = useState('all');
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [trades, setTrades] = useState<any[]>([]);
  const [availableBatches, setAvailableBatches] = useState<any[]>([]);
  const [countries, setCountries] = useState<string[]>([
    'Saudi Arabia',
    'Singapore',
    'UAE - Dubai',
    'Qatar',
    'Malaysia',
    'Not decided yet',
  ]);
  const [totalStudents, setTotalStudents] = useState(0);

  // Toast feedback
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Certificate / Marksheet Preview Modal State
  const [docPreview, setDocPreview] = useState<{
    student: StudentListItem;
    type: 'certificate' | 'marksheet';
  } | null>(null);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingStudentNo, setEditingStudentNo] = useState('');
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});

  // Delete Modal State
  const [deletingStudent, setDeletingStudent] = useState<StudentListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Load trades, batches, and destination countries filter lists
  useEffect(() => {
    fetch('/api/trades')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setTrades(d.trades || []);
      })
      .catch((e) => console.error(e));

    fetch('/api/batches')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setAvailableBatches(d.batches || []);
      })
      .catch((e) => console.error(e));

    fetch('/api/country-costs')
      .then((r) => r.json())
      .then((d) => {
        const list = d.countryCosts || d.costs;
        if (d.success && Array.isArray(list)) {
          const dynamicCountries = list.map((c: any) => c.country || c.country_name).filter(Boolean);
          setCountries((prev) => Array.from(new Set([...prev, ...dynamicCountries])));
        }
      })
      .catch((e) => console.error(e));
  }, []);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (selectedTrade !== 'all') params.set('trade_id', selectedTrade);
      if (selectedBatch !== 'all') params.set('batch', selectedBatch);
      if (selectedCountry !== 'all') params.set('country', selectedCountry);
      if (selectedStatus !== 'all') params.set('status', selectedStatus);
      if (sortBy) params.set('sort', sortBy);

      const res = await fetch(`/api/students?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setStudents(data.students || []);
        setTotalStudents(data.total || 0);
      }
    } catch (err) {
      console.error('Fetch students error:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedTrade, selectedBatch, selectedCountry, selectedStatus, sortBy]);

  // Download Exam Results CSV based on active Batch, Trade, Country & Status filters
  const handleDownloadExamResultsCSV = () => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (selectedTrade !== 'all') params.set('trade_id', selectedTrade);
    if (selectedBatch !== 'all') params.set('batch', selectedBatch);
    if (selectedCountry !== 'all') params.set('country', selectedCountry);
    if (selectedStatus !== 'all') params.set('status', selectedStatus);
    params.set('sort', sortBy === 'newest' ? 'batch_asc' : sortBy);
    params.set('format', 'csv');

    window.location.href = `/api/reports/exam-results?${params.toString()}`;
  };

  // Fetch students with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchStudents();
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [fetchStudents]);

  const toInputDate = (val?: string | Date) => {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  };

  // Open Edit Modal & Fetch Full Student Info
  const handleOpenEditModal = async (student: StudentListItem) => {
    setEditError('');
    setEditingStudentId(student._id);
    setEditingStudentNo(student.student_no);
    setIsEditModalOpen(true);
    setIsLoadingEdit(true);

    try {
      const res = await fetch(`/api/students/${student._id}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to load student details');
      }
      const st = data.student;
      setEditFormData({
        name: st.name || '',
        father_name: st.father_name || '',
        mother_name: st.mother_name || '',
        date_of_birth: toInputDate(st.date_of_birth),
        gender: st.gender || 'Male',
        blood_group: st.blood_group || '',
        nid_or_birth_cert: st.nid_or_birth_cert || '',
        religion: st.religion || 'Islam',
        marital_status: st.marital_status || 'Single',
        mobile: st.mobile || '',
        email: st.email || '',
        emergency_contact_name: st.emergency_contact_name || '',
        emergency_contact_phone: st.emergency_contact_phone || '',
        present_address: st.present_address || '',
        permanent_address: st.permanent_address || '',
        passport_no: st.passport_no || '',
        passport_issue_date: toInputDate(st.passport_issue_date),
        passport_expiry_date: toInputDate(st.passport_expiry_date),
        destination_country: st.destination_country || '',
        batch: st.batch || '',
        status: st.status || 'Active',
        photo_url: st.photo_url || '',
      });
    } catch (err: any) {
      setEditError(err.message || 'Could not load student data');
    } finally {
      setIsLoadingEdit(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success && data.url) {
        setEditFormData((prev: any) => ({ ...prev, photo_url: data.url }));
      } else {
        setEditError(data.message || 'Photo upload failed');
      }
    } catch {
      setEditError('Photo upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudentId) return;
    setEditError('');
    setIsSavingEdit(true);

    try {
      const res = await fetch(`/api/students/${editingStudentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update student');
      }

      setIsEditModalOpen(false);
      showToast('success', `Candidate ${editingStudentNo} updated successfully.`);
      fetchStudents();
    } catch (err: any) {
      setEditError(err.message || 'Update failed');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingStudent) return;
    setDeleteError('');
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/students/${deletingStudent._id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to delete student');
      }

      setStudents((prev) => prev.filter((s) => s._id !== deletingStudent._id));
      setTotalStudents((prev) => Math.max(0, prev - 1));
      showToast('success', `Student ${deletingStudent.student_no} (${deletingStudent.name}) deleted.`);
      setDeletingStudent(null);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete student');
    } finally {
      setIsDeleting(false);
    }
  };

  const canAdmit = user?.role === 'Admin' || user?.role === 'Counselor';
  const canDelete = user?.role === 'Admin';

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Student Directory</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage candidates, filter by batch/trade/country, download certificates &amp; marksheets, and export exam results.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              const headers = [
                'Student ID',
                'Name',
                'Mobile',
                'Passport No',
                'Trade',
                'Batch',
                'Country',
                'Total Payable (BDT)',
                'Paid (BDT)',
                'Due (BDT)',
                'Status',
                'Exam Result',
              ];
              const rows = students.map((s) => [
                s.student_no,
                s.name,
                s.mobile,
                s.passport_no || '',
                s.trade_name,
                s.batch || '',
                s.destination_country,
                s.fee_snapshot?.total_payable || 0,
                s.total_paid || 0,
                s.total_due || 0,
                s.status,
                s.assessment?.result_status || 'Pending',
              ]);
              downloadExcel({
                filename: 'students-directory',
                sheetName: 'Students',
                headers,
                rows,
              });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg shadow-xs transition-colors"
            title="Export filtered students as Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Excel</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const headers = [
                'Student ID',
                'Name',
                'Mobile',
                'Trade',
                'Batch',
                'Country',
                'Payable',
                'Paid',
                'Due',
                'Status',
              ];
              const rows = students.map((s) => [
                s.student_no,
                s.name,
                s.mobile,
                s.trade_name,
                s.batch || '—',
                s.destination_country,
                s.fee_snapshot?.total_payable || 0,
                s.total_paid || 0,
                s.total_due || 0,
                s.status,
              ]);
              printTableReport({
                title: 'Students Directory Report',
                meta: `Trade: ${selectedTrade} | Batch: ${selectedBatch} | Country: ${selectedCountry} | Status: ${selectedStatus}`,
                headers,
                rows,
                rightAlignCols: [6, 7, 8],
                landscape: true,
              });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-xs transition-colors"
            title="Print filtered student directory"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadExamResultsCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-600 hover:text-white border border-emerald-200 rounded-lg shadow-xs transition-colors"
            title="Download Batch, Trade & Country-wise Exam Results CSV"
          >
            <Download className="w-4 h-4" />
            <span>Exam Results CSV</span>
          </button>

          {canAdmit && (
            <Link
              href="/admissions/new"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>New Admission</span>
            </Link>
          )}
        </div>
      </div>

      {/* Toast Message */}
      {toastMsg && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium ${
            toastMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{toastMsg.text}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-slate-400 hover:text-slate-600 font-bold px-1">
            &times;
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Search Box */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Name, ID, Mobile, Passport..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Trade Filter */}
          <div>
            <select
              value={selectedTrade}
              onChange={(e) => setSelectedTrade(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Trades</option>
              {trades.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Batch Filter */}
          <div>
            <select
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Batches</option>
              {availableBatches.map((b) => (
                <option key={b._id} value={b.batch_code}>
                  {b.batch_code} ({b.name})
                </option>
              ))}
            </select>
          </div>

          {/* Destination Country Filter */}
          <div>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Countries</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Passed">Passed</option>
              <option value="Failed">Failed</option>
              <option value="Dropped">Dropped</option>
            </select>
          </div>

          {/* Sorting Selector (Batch & More) */}
          <div className="relative">
            <ArrowUpDown className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Sort Candidates"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="batch_asc">Sort: Batch (A → Z)</option>
              <option value="batch_desc">Sort: Batch (Z → A)</option>
              <option value="student_no_asc">Sort: Roll / ID</option>
              <option value="name_asc">Sort: Name (A → Z)</option>
              <option value="due_desc">Sort: Highest Due</option>
            </select>
          </div>
        </div>

        {/* Active Filters Helper Strip */}
        {(selectedTrade !== 'all' ||
          selectedBatch !== 'all' ||
          selectedCountry !== 'all' ||
          selectedStatus !== 'all' ||
          searchQuery) && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500">
              Filtered Exam Results export will include matching candidates
              {selectedBatch !== 'all' ? ` • Batch: ${selectedBatch}` : ''}
              {selectedCountry !== 'all' ? ` • Country: ${selectedCountry}` : ''}
              {selectedStatus !== 'all' ? ` • Status: ${selectedStatus}` : ''}
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedTrade('all');
                setSelectedBatch('all');
                setSelectedCountry('all');
                setSelectedStatus('all');
                setSortBy('newest');
              }}
              className="text-blue-600 hover:underline font-semibold"
            >
              Reset All Filters
            </button>
          </div>
        )}
      </div>

      {/* Students Data Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[800px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3">Student ID</th>
                <th className="px-5 py-3">Candidate Name</th>
                <th className="px-5 py-3">Trade & Batch</th>
                <th className="px-5 py-3">Destination</th>
                <th className="px-5 py-3">Mobile & Passport</th>
                <th className="px-5 py-3 text-right">Paid</th>
                <th className="px-5 py-3 text-right">Due Balance</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-slate-400">
                    Loading student records...
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center">
                    <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-600 font-medium">No students found matching your criteria</p>
                    <p className="text-xs text-slate-400 mt-1">Try adjusting the search query or filter tags</p>
                  </td>
                </tr>
              ) : (
                students.map((student) => (
                  <tr
                    key={student._id}
                    onClick={() => router.push(`/students/${student._id}`)}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                  >
                    {/* Student ID */}
                    <td className="px-5 py-3.5 font-mono font-bold text-blue-700 whitespace-nowrap">
                      <Link
                        href={`/students/${student._id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline"
                      >
                        {student.student_no}
                      </Link>
                    </td>

                    {/* Name + Photo */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        {student.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={student.photo_url}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs uppercase shrink-0 border border-slate-200">
                            {student.name.charAt(0)}
                          </div>
                        )}
                        <span className="font-semibold text-slate-900">{student.name}</span>
                      </div>
                    </td>

                    {/* Trade & Batch */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <p className="font-medium text-slate-800">{student.trade_name}</p>
                      <p className="text-xs text-slate-500 font-mono">Batch: {student.batch}</p>
                    </td>

                    {/* Country */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
                        {student.destination_country}
                      </span>
                    </td>

                    {/* Mobile & Passport */}
                    <td className="px-5 py-3.5 whitespace-nowrap font-mono text-xs">
                      <p className="text-slate-800">{student.mobile}</p>
                      <p className="text-slate-400 uppercase">{student.passport_no}</p>
                    </td>

                    {/* Paid */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap font-mono font-semibold text-emerald-700">
                      {formatBDT(student.total_paid)}
                    </td>

                    {/* Due + Overdue badge (PRD Section 5.4: "Show an Overdue tag when an installment is late.") */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="flex flex-col items-end">
                        <span
                          className={`font-mono font-bold ${
                            student.total_due > 0 ? 'text-rose-600' : 'text-slate-500'
                          }`}
                        >
                          {formatBDT(student.total_due)}
                        </span>
                        {student.is_overdue && (
                          <Badge variant="danger" size="sm" className="mt-0.5 animate-pulse">
                            Overdue
                          </Badge>
                        )}
                      </div>
                    </td>

                    {/* Status & Score */}
                    <td className="px-5 py-3.5 text-center whitespace-nowrap">
                      <div className="flex flex-col items-center gap-1">
                        <StatusBadge status={student.status} />
                        {student.assessment?.total_score !== null &&
                          student.assessment?.total_score !== undefined && (
                            <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                              Score: {student.assessment.total_score}/100
                            </span>
                          )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Download Certificate when Passed */}
                        {(student.status === 'Passed' ||
                          student.assessment?.result_status === 'Passed') && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDocPreview({ student, type: 'certificate' });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:text-white bg-emerald-50 hover:bg-emerald-600 border border-emerald-200 rounded-md transition-colors"
                            title="View / Download Official Certificate"
                          >
                            <Award className="w-3.5 h-3.5" />
                            <span>Certificate</span>
                          </button>
                        )}

                        {/* Download Marksheet when Failed */}
                        {(student.status === 'Failed' ||
                          student.assessment?.result_status === 'Failed') && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDocPreview({ student, type: 'marksheet' });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-purple-700 hover:text-white bg-purple-50 hover:bg-purple-600 border border-purple-200 rounded-md transition-colors"
                            title="View / Download Exam Marksheet"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Marksheet</span>
                          </button>
                        )}

                        <Link
                          href={`/students/${student._id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-white bg-blue-50 hover:bg-blue-600 rounded-md transition-colors"
                          title="View Profile"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Profile</span>
                        </Link>

                        {canAdmit && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditModal(student);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:text-white bg-amber-50 hover:bg-amber-600 rounded-md transition-colors"
                            title="Edit Candidate"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                        )}

                        {canDelete && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteError('');
                              setDeletingStudent(student);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 rounded-md transition-colors"
                            title="Delete Candidate"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Showing {students.length} of {totalStudents} candidate(s)</span>
          <span className="font-mono">CodeZenX ERP</span>
        </div>
      </div>

      {/* EDIT STUDENT MODAL */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Student Profile — ${editingStudentNo}`}
        description="Update candidate personal, passport, contact, batch, and status information."
        maxWidth="2xl"
      >
        {isLoadingEdit ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-xs font-medium">Loading candidate details...</span>
          </div>
        ) : (
          <form onSubmit={handleSaveEdit} className="space-y-4">
            {editError && (
              <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{editError}</span>
              </div>
            )}

            {/* Personal & Parent Info */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span>Candidate Personal &amp; Parent Details</span>
              </h4>

              {/* Photo Upload Row */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                  {editFormData.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={editFormData.photo_url}
                      alt="Candidate"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <div className="flex-1 flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingPhoto ? 'Uploading...' : 'Change Photo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      disabled={uploadingPhoto}
                      className="hidden"
                    />
                  </label>
                  {editFormData.photo_url && (
                    <button
                      type="button"
                      onClick={() => setEditFormData({ ...editFormData, photo_url: '' })}
                      className="text-xs text-rose-600 hover:underline px-2"
                    >
                      Remove Photo
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.name || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Father&apos;s Name *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.father_name || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, father_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Mother&apos;s Name *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.mother_name || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, mother_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Date of Birth *</label>
                  <input
                    type="date"
                    required
                    value={editFormData.date_of_birth || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, date_of_birth: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Gender *</label>
                  <select
                    value={editFormData.gender || 'Male'}
                    onChange={(e) => setEditFormData({ ...editFormData, gender: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">NID / Birth Cert *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.nid_or_birth_cert || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, nid_or_birth_cert: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Contact Info */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-blue-600" />
                <span>Contact &amp; Addresses</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Mobile Number *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.mobile || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, mobile: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={editFormData.email || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-600 mb-1">Present Address</label>
                  <input
                    type="text"
                    value={editFormData.present_address || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, present_address: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Passport & Destination */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Plane className="w-3.5 h-3.5 text-blue-600" />
                <span>Passport &amp; Overseas Target</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Passport Number *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.passport_no || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, passport_no: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-mono font-bold uppercase"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Passport Expiry Date *</label>
                  <input
                    type="date"
                    required
                    value={editFormData.passport_expiry_date || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, passport_expiry_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Destination Country</label>
                  <input
                    type="text"
                    value={editFormData.destination_country || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, destination_country: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Batch & Status */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
                <span>Training Batch &amp; Status</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Training Batch</label>
                  <select
                    value={editFormData.batch || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, batch: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-mono"
                  >
                    <option value="">No Batch Assigned</option>
                    {availableBatches.map((b) => (
                      <option key={b._id} value={b.batch_code}>
                        {b.batch_code} ({b.name})
                      </option>
                    ))}
                    {editFormData.batch && !availableBatches.some((b) => b.batch_code === editFormData.batch) && (
                      <option value={editFormData.batch}>{editFormData.batch}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Status</label>
                  <select
                    value={editFormData.status || 'Active'}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-semibold"
                  >
                    <option value="Active">Active</option>
                    <option value="Passed">Passed</option>
                    <option value="Failed">Failed</option>
                    <option value="Dropped">Dropped</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingEdit || uploadingPhoto}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold shadow-sm inline-flex items-center gap-1.5"
              >
                {isSavingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSavingEdit ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={!!deletingStudent}
        onClose={() => !isDeleting && setDeletingStudent(null)}
        title="Confirm Delete Student"
        description="Permanent action — candidate record and linked transactions will be removed."
        maxWidth="md"
      >
        {deletingStudent && (
          <div className="space-y-4">
            {deleteError && (
              <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-900 space-y-1">
                <p className="font-bold">
                  আপনি কি নিশ্চিত যে এই ছাত্র/প্রার্থীর রেকর্ড ডিলিট করতে চান?
                </p>
                <p className="text-rose-700">
                  এটি করলে এই প্রার্থীর প্রোফাইল, কিস্তির শিডিউল, পেমেন্ট হিস্ট্রি ও ডকুমেন্ট স্থায়ীভাবে মুছে যাবে।
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Student ID:</span>
                <span className="font-mono font-bold text-slate-900">{deletingStudent.student_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Name:</span>
                <span className="font-bold text-slate-900">{deletingStudent.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Trade &amp; Batch:</span>
                <span className="text-slate-800">{deletingStudent.trade_name} ({deletingStudent.batch})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Paid / Due:</span>
                <span className="font-mono">
                  <strong className="text-emerald-700">{formatBDT(deletingStudent.total_paid)}</strong> /{' '}
                  <strong className="text-rose-600">{formatBDT(deletingStudent.total_due)}</strong>
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingStudent(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold shadow-sm inline-flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{isDeleting ? 'Deleting...' : 'Yes, Delete Student'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* CERTIFICATE / MARKSHEET PREVIEW & DOWNLOAD MODAL */}
      <Modal
        isOpen={!!docPreview}
        onClose={() => setDocPreview(null)}
        title={
          docPreview?.type === 'certificate'
            ? `Official Training Certificate — ${docPreview?.student?.student_no}`
            : `Exam Marksheet & Result Sheet — ${docPreview?.student?.student_no}`
        }
        description={
          docPreview?.type === 'certificate'
            ? `${docPreview?.student?.name} • Passed (${docPreview?.student?.trade_name})`
            : `${docPreview?.student?.name} • Assessment Transcript (${docPreview?.student?.trade_name})`
        }
        maxWidth="4xl"
      >
        {docPreview && (
          <div className="space-y-4">
            {/* Action Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-xs text-slate-600">
                {docPreview.type === 'certificate' ? (
                  <span>
                    Certificate No:{' '}
                    <strong className="font-mono text-slate-900">
                      {docPreview.student.assessment?.certificate_no || 'Auto-Generated'}
                    </strong>
                  </span>
                ) : (
                  <span>
                    Exam Result:{' '}
                    <strong className="text-rose-700 uppercase">
                      {docPreview.student.assessment?.result_status || docPreview.student.status}
                    </strong>
                    {docPreview.student.assessment?.total_score !== null &&
                      docPreview.student.assessment?.total_score !== undefined && (
                        <span className="ml-2 font-mono text-slate-700">
                          (Score: {docPreview.student.assessment.total_score}/100)
                        </span>
                      )}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {docPreview.type === 'certificate' &&
                  docPreview.student.assessment?.certificate_url && (
                    <a
                      href={docPreview.student.assessment.certificate_url}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Uploaded Certificate</span>
                    </a>
                  )}

                <Link
                  href={`/students/${docPreview.student._id}/result?type=${docPreview.type}`}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>
                    Print / Download{' '}
                    {docPreview.type === 'certificate' ? 'Certificate' : 'Marksheet'} (PDF)
                  </span>
                  <ExternalLink className="w-3 h-3 opacity-80" />
                </Link>
              </div>
            </div>

            {/* Rendered Official Document Preview */}
            <StudentResultDocument
              student={docPreview.student}
              assessment={docPreview.student.assessment}
              docType={docPreview.type}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

