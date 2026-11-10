'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit3,
  FileCheck2,
  FileText,
  Mail,
  MapPin,
  Phone,
  Plane,
  Printer,
  ShieldAlert,
  User,
  CreditCard,
  Plus,
  GraduationCap,
  Award,
  ExternalLink,
  Upload,
  Paperclip,
  Check,
  XCircle,
  RefreshCw,
  Sparkles,
  Download,
  Globe2,
} from 'lucide-react';
import { formatBDT, formatDate, toInputDate } from '@/lib/formatters';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { MoneyReceipt } from '@/components/receipt/MoneyReceipt';
import { useAuth } from '@/components/layout/DashboardLayout';

interface StudentProfileProps {
  studentId: string;
}

export function StudentProfile({ studentId }: StudentProfileProps) {
  const router = useRouter();
  const { user } = useAuth();

  const [student, setStudent] = useState<any | null>(null);
  const [installments, setInstallments] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [assessment, setAssessment] = useState<any | null>(null);
  const [batch, setBatch] = useState<any | null>(null);
  const [passportExpiringSoon, setPassportExpiringSoon] = useState(false);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [activeReceipt, setActiveReceipt] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isAssessmentModalOpen, setIsAssessmentModalOpen] = useState(false);
  const [availableBatches, setAvailableBatches] = useState<any[]>([]);
  const [countryCosts, setCountryCosts] = useState<any[]>([]);

  // Documents Checklist Upload / Inline Edit State
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [docNoteInput, setDocNoteInput] = useState('');
  const [docExpiryInput, setDocExpiryInput] = useState('');
  const [newDocName, setNewDocName] = useState('');
  const [newDocNeedsExpiry, setNewDocNeedsExpiry] = useState(false);
  const [addingDoc, setAddingDoc] = useState(false);

  // Profile Edit Form State
  const [editFormData, setEditFormData] = useState<any>({});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Assessment & Certificate Form State
  const [assessmentFormData, setAssessmentFormData] = useState({
    theory_score: '',
    practical_score: '',
    total_score: '',
    result_status: 'Passed' as 'Pending' | 'Passed' | 'Failed',
    exam_date: new Date().toISOString().split('T')[0],
    certificate_no: '',
    certificate_url: '',
    certificate_issue_date: new Date().toISOString().split('T')[0],
    remarks: '',
    evaluated_by: '',
    sync_student_status: true,
  });
  const [uploadingCert, setUploadingCert] = useState(false);
  const [isSubmittingAssessment, setIsSubmittingAssessment] = useState(false);
  const [assessmentError, setAssessmentError] = useState('');

  const [paymentFormData, setPaymentFormData] = useState({
    amount: '',
    method: 'Cash',
    reference: '',
    payment_date: new Date().toISOString().split('T')[0],
    note: '',
    next_due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [editError, setEditError] = useState('');
  const [paymentError, setPaymentError] = useState('');

  const canEdit = user?.role === 'Admin' || user?.role === 'Counselor';
  const canCollectPayment =
    user?.role === 'Admin' || user?.role === 'Counselor' || user?.role === 'Accountant';

  const loadStudentData = async () => {
    try {
      const [res, batchRes, countryRes] = await Promise.all([
        fetch(`/api/students/${studentId}`),
        fetch('/api/batches'),
        fetch('/api/country-costs'),
      ]);

      const data = await res.json();
      if (data.success) {
        setStudent(data.student);
        setInstallments(data.installments || []);
        setPayments(data.payments || []);
        setDocuments(data.documents || []);
        setAssessment(data.assessment || null);
        setBatch(data.batch || null);
        setPassportExpiringSoon(data.passportExpiringSoon);

        setEditFormData({
          name: data.student.name || '',
          father_name: data.student.father_name || '',
          mother_name: data.student.mother_name || '',
          date_of_birth: toInputDate(data.student.date_of_birth),
          gender: data.student.gender || 'Male',
          blood_group: data.student.blood_group || '',
          nid_or_birth_cert: data.student.nid_or_birth_cert || '',
          religion: data.student.religion || 'Islam',
          marital_status: data.student.marital_status || 'Single',
          photo_url: data.student.photo_url || '',
          mobile: data.student.mobile || '',
          email: data.student.email || '',
          emergency_contact_name: data.student.emergency_contact_name || '',
          emergency_contact_relation: data.student.emergency_contact_relation || '',
          emergency_contact_phone: data.student.emergency_contact_phone || '',
          present_address: data.student.present_address || '',
          permanent_address: data.student.permanent_address || '',
          passport_no: data.student.passport_no || '',
          passport_issue_date: toInputDate(data.student.passport_issue_date),
          passport_expiry_date: toInputDate(data.student.passport_expiry_date),
          destination_country: data.student.destination_country || 'Not decided yet',
          destination_contract_years: data.student.destination_contract_years ?? 0,
          status: data.student.status || 'Active',
          batch: data.student.batch || '',
          admission_fee: data.student.fee_snapshot?.admission_fee ?? 0,
          course_fee: data.student.fee_snapshot?.course_fee ?? 0,
          visa_cost: data.student.fee_snapshot?.visa_cost ?? 0,
          govt_fee: data.student.fee_snapshot?.govt_fee ?? 0,
          discount: data.student.fee_snapshot?.discount ?? 0,
          visa_due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        });
      }

      if (batchRes.ok) {
        const batchData = await batchRes.json();
        if (batchData.success && batchData.batches) {
          setAvailableBatches(batchData.batches);
        }
      }

      if (countryRes.ok) {
        const cData = await countryRes.json();
        const costsList = cData.countryCosts || cData.costs || [];
        if (cData.success && Array.isArray(costsList)) {
          setCountryCosts(costsList);
        }
      }
    } catch (err) {
      console.error('Error fetching student profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudentData();
  }, [studentId]);

  // Handle Status Change (PRD Section 5.5)
  const handleStatusChange = async (newStatus: string) => {
    if (!canEdit) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/students/${studentId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setStudent((prev: any) => ({ ...prev, status: newStatus }));
      } else {
        alert(data.message || 'Failed to update status');
      }
    } catch (e) {
      console.error(e);
      alert('Error updating status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Handle Document Checklist Toggle (PRD Section 5.6)
  const handleDocumentToggle = async (docId: string, currentReceived: boolean) => {
    if (!canEdit) return;
    try {
      const res = await fetch(`/api/students/${studentId}/documents`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: docId,
          received: !currentReceived,
        }),
      });
      const data = await res.json();
      if (data.success && data.document) {
        setDocuments((prev) =>
          prev.map((d) => (d._id === docId ? data.document : d))
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Handle Document Expiry update
  const handleDocumentExpiryChange = async (docId: string, expiryDate: string) => {
    if (!canEdit) return;
    try {
      const res = await fetch(`/api/students/${studentId}/documents`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: docId,
          expiry_date: expiryDate,
        }),
      });
      const data = await res.json();
      if (data.success && data.document) {
        setDocuments((prev) =>
          prev.map((d) => (d._id === docId ? data.document : d))
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Upload Document Scan/PDF directly inside Checklist & mark received
  const handleDocumentFileUpload = async (docId: string, file: File) => {
    if (!canEdit || !file) return;
    setUploadingDocId(docId);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.success || !uploadData.url) {
        alert(uploadData.message || 'File upload failed');
        return;
      }

      const res = await fetch(`/api/students/${studentId}/documents`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: docId,
          file_url: uploadData.url,
          received: true,
        }),
      });
      const data = await res.json();
      if (data.success && data.document) {
        setDocuments((prev) => prev.map((d) => (d._id === docId ? data.document : d)));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to upload document');
    } finally {
      setUploadingDocId(null);
    }
  };

  // Save Document Notes & Expiry inline
  const handleSaveDocDetails = async (docId: string) => {
    if (!canEdit) return;
    try {
      const res = await fetch(`/api/students/${studentId}/documents`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: docId,
          notes: docNoteInput,
          expiry_date: docExpiryInput || null,
        }),
      });
      const data = await res.json();
      if (data.success && data.document) {
        setDocuments((prev) => prev.map((d) => (d._id === docId ? data.document : d)));
        setEditingDocId(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Add Custom Document item to checklist
  const handleAddCustomDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !newDocName.trim()) return;
    setAddingDoc(true);
    try {
      const res = await fetch(`/api/students/${studentId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: newDocName.trim(),
          needs_expiry: newDocNeedsExpiry,
        }),
      });
      const data = await res.json();
      if (data.success && data.document) {
        setDocuments((prev) => [...prev, data.document]);
        setNewDocName('');
        setNewDocNeedsExpiry(false);
      } else {
        alert(data.message || 'Could not add document');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAddingDoc(false);
    }
  };

  // Handle Profile Update Submission (PRD Section 5.7)
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');
    setIsSubmittingEdit(true);

    try {
      const res = await fetch(`/api/students/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Update failed');
      }

      setIsEditModalOpen(false);
      loadStudentData();
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Handle Photo Upload for Student Profile
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.url) {
        setEditFormData((prev: any) => ({ ...prev, photo_url: data.url }));
      } else {
        alert(data.message || 'Photo upload failed');
      }
    } catch (err) {
      console.error(err);
      alert('Photo upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Handle Certificate File Upload
  const handleCertificateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCert(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.url) {
        setAssessmentFormData((prev: any) => ({ ...prev, certificate_url: data.url }));
      } else {
        alert(data.message || 'Certificate upload failed');
      }
    } catch (err) {
      console.error(err);
      alert('Certificate upload failed');
    } finally {
      setUploadingCert(false);
    }
  };

  // Open Exam & Certificate Evaluation Modal
  const openAssessmentModal = () => {
    setAssessmentError('');
    setAssessmentFormData({
      theory_score:
        assessment?.theory_score !== null && assessment?.theory_score !== undefined
          ? String(assessment.theory_score)
          : '',
      practical_score:
        assessment?.practical_score !== null && assessment?.practical_score !== undefined
          ? String(assessment.practical_score)
          : '',
      total_score:
        assessment?.total_score !== null && assessment?.total_score !== undefined
          ? String(assessment.total_score)
          : '',
      result_status:
        assessment?.result_status ||
        (student?.status === 'Passed' ? 'Passed' : student?.status === 'Failed' ? 'Failed' : 'Passed'),
      exam_date: assessment?.exam_date
        ? toInputDate(assessment.exam_date)
        : batch?.exam_date
        ? toInputDate(batch.exam_date)
        : new Date().toISOString().split('T')[0],
      certificate_no:
        assessment?.certificate_no ||
        `CERT-${new Date().getFullYear()}-${student?.student_no?.replace(/[^0-9]/g, '')?.slice(-4) || '0001'}`,
      certificate_url: assessment?.certificate_url || '',
      certificate_issue_date: assessment?.certificate_issue_date
        ? toInputDate(assessment.certificate_issue_date)
        : new Date().toISOString().split('T')[0],
      remarks: assessment?.remarks || '',
      evaluated_by: assessment?.evaluated_by || user?.name || '',
      sync_student_status: true,
    });
    setIsAssessmentModalOpen(true);
  };

  // Submit Exam & Certificate Evaluation
  const handleAssessmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssessmentError('');
    setIsSubmittingAssessment(true);
    try {
      const res = await fetch(`/api/students/${studentId}/assessment`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assessmentFormData),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to save assessment');
      }
      setAssessment(data.assessment);
      if (data.studentStatus) {
        setStudent((prev: any) => ({ ...prev, status: data.studentStatus }));
      }
      setIsAssessmentModalOpen(false);
      loadStudentData();
    } catch (err: any) {
      setAssessmentError(err.message || 'Failed to save assessment');
    } finally {
      setIsSubmittingAssessment(false);
    }
  };

  // Handle Record Payment
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError('');
    setIsSubmittingPayment(true);

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          amount: paymentFormData.amount,
          method: paymentFormData.method,
          reference: paymentFormData.reference,
          payment_date: paymentFormData.payment_date,
          note: paymentFormData.note,
          next_due_date: paymentFormData.next_due_date,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Payment recording failed');
      }

      setIsPaymentModalOpen(false);
      setPaymentFormData({
        amount: '',
        method: 'Cash',
        reference: '',
        payment_date: new Date().toISOString().split('T')[0],
        note: '',
        next_due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      });

      // View Receipt
      const receiptRes = await fetch(`/api/payments/${data.receipt_no}`);
      const receiptData = await receiptRes.json();
      if (receiptData.success) {
        setActiveReceipt(receiptData.receipt);
      }

      loadStudentData();
    } catch (err: any) {
      setPaymentError(err.message);
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Open Receipt
  const handleOpenReceipt = async (receiptNo: string) => {
    try {
      const res = await fetch(`/api/payments/${receiptNo}`);
      const data = await res.json();
      if (data.success) {
        setActiveReceipt(data.receipt);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-slate-500">
        Loading candidate profile...
      </div>
    );
  }

  if (!student) {
    return (
      <div className="p-8 text-center text-slate-600">
        <p>Candidate not found.</p>
        <Link href="/students" className="text-blue-600 hover:underline mt-2 inline-block">
          Return to Student Directory
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top back navigation & Profile Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/students"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Students</span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/students/${studentId}/admission-form`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 shadow-xs transition-colors"
            title="Print or Download Full Candidate Details on Official Agency Pad"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Download / Print Form</span>
          </Link>

          {canEdit &&
            ((student.fee_snapshot?.visa_cost || 0) === 0 ||
              student.destination_country === 'Not decided yet') && (
              <button
                onClick={() => {
                  const targetCountry = student.destination_country;
                  if (targetCountry && targetCountry !== 'Not decided yet' && (student.fee_snapshot?.visa_cost || 0) === 0) {
                    const studentTradeId = student?.trade_id?._id || student?.trade_id;
                    const matchedRate =
                      countryCosts.find(
                        (c: any) =>
                          c.country === targetCountry &&
                          String(c.trade_id?._id || c.trade_id) === String(studentTradeId)
                      ) || countryCosts.find((c: any) => c.country === targetCountry);
                    if (matchedRate) {
                      setEditFormData((prev: any) => ({
                        ...prev,
                        visa_cost: matchedRate.visa_cost,
                        govt_fee: matchedRate.govt_fee,
                        destination_contract_years: matchedRate.contract_years,
                      }));
                    }
                  }
                  setIsEditModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 shadow-xs transition-colors"
                title="Add Destination Country & Visa Package Fee to this candidate"
              >
                <Globe2 className="w-3.5 h-3.5" />
                <span>+ Include Visa / Country</span>
              </button>
            )}

          {canEdit && (
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-xs"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Profile</span>
            </button>
          )}
        </div>
      </div>

      {/* PRD Section 5.7: Passport Expiry Alert within 6 months */}
      {passportExpiringSoon && (
        <div className="p-4 bg-rose-50 border-l-4 border-rose-500 rounded-r-xl flex items-start gap-3 shadow-xs">
          <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-rose-900">
              URGENT ALERT: Passport Expiring Within 6 Months!
            </h4>
            <p className="text-xs text-rose-700 mt-0.5">
              Passport #{student.passport_no} is scheduled to expire on{' '}
              <span className="font-bold underline">
                {formatDate(student.passport_expiry_date)}
              </span>
              . Work permit and visa submission requires at least 6 months validity. Urgent renewal
              is required before Embassy stamping.
            </p>
          </div>
        </div>
      )}

      {/* HEADER PROFILE BANNER */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Candidate Info */}
          <div className="flex items-center gap-4">
            {student.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={student.photo_url}
                alt=""
                className="w-20 h-20 rounded-xl object-cover border-2 border-blue-500 shadow-md shrink-0"
              />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-2xl uppercase shadow-md shrink-0">
                {student.name.charAt(0)}
              </div>
            )}

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                  {student.name}
                </h1>
                <span className="px-2.5 py-0.5 font-mono font-bold text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-md">
                  {student.student_no}
                </span>
              </div>

              <p className="text-sm text-slate-500 mt-1">
                {student.trade_name} &bull; Batch: <span className="font-semibold">{student.batch}</span> ({student.session})
              </p>

              <div className="flex items-center gap-4 mt-2 text-xs text-slate-600">
                <span className="flex items-center gap-1 font-mono">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {student.mobile}
                </span>
                <span className="flex items-center gap-1 font-mono">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  Passport: {student.passport_no}
                </span>
              </div>
            </div>
          </div>

          {/* Status Selector & Actions */}
          <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end gap-3 border-t md:border-t-0 pt-4 md:pt-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Candidate Status:</span>
              {canEdit ? (
                <select
                  value={student.status}
                  disabled={updatingStatus}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Active">Active</option>
                  <option value="Passed">Passed</option>
                  <option value="Failed">Failed</option>
                  <option value="Dropped">Dropped</option>
                </select>
              ) : (
                <StatusBadge status={student.status} />
              )}
            </div>

            {canCollectPayment && student.total_due > 0 && (
              <button
                onClick={() => setIsPaymentModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
              >
                <DollarSign className="w-4 h-4" />
                <span>Collect Installment / Payment</span>
              </button>
            )}
          </div>
        </div>

        {/* FINANCIAL TOTALS BAR (PRD Section 5.5) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs text-slate-500 font-semibold uppercase">Total Package Payable</p>
            <p className="text-xl font-black font-mono text-slate-900 mt-1">
              {formatBDT(student.fee_snapshot?.total_payable)}
            </p>
          </div>

          <div className="p-3 bg-emerald-50/60 rounded-lg border border-emerald-200">
            <p className="text-xs text-emerald-700 font-semibold uppercase">Total Paid To Date</p>
            <p className="text-xl font-black font-mono text-emerald-700 mt-1">
              {formatBDT(student.total_paid)}
            </p>
          </div>

          <div className="p-3 bg-rose-50/60 rounded-lg border border-rose-200">
            <p className="text-xs text-rose-700 font-semibold uppercase">Outstanding Due Balance</p>
            <p className="text-xl font-black font-mono text-rose-700 mt-1">
              {formatBDT(student.total_due)}
            </p>
          </div>
        </div>
      </div>

      {/* MAIN CARDS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* CARD: FEE SNAPSHOT & INSTALLMENT SCHEDULE */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-slate-800 text-base">
                  Fee Snapshot & Installment Schedule
                </h3>
              </div>
              <span className="text-xs text-slate-400 italic">Snapshot locked at admission</span>
            </div>

            {/* Fee Snapshot summary */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 bg-slate-50 rounded-lg text-xs">
              <div>
                <p className="text-slate-500">Admission Fee</p>
                <p className="font-bold text-slate-800 mt-0.5">
                  {formatBDT(student.fee_snapshot?.admission_fee)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Course Fee</p>
                <p className="font-bold text-slate-800 mt-0.5">
                  {formatBDT(student.fee_snapshot?.course_fee)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Visa Processing</p>
                <p className="font-bold text-slate-800 mt-0.5">
                  {formatBDT(student.fee_snapshot?.visa_cost)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Govt Fee</p>
                <p className="font-bold text-slate-800 mt-0.5">
                  {formatBDT(student.fee_snapshot?.govt_fee)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Discount</p>
                <p className="font-bold text-emerald-600 mt-0.5">
                  -{formatBDT(student.fee_snapshot?.discount)}
                </p>
              </div>
            </div>

            {/* Installments Table */}
            <div>
              <h4 className="text-xs font-bold uppercase text-slate-600 tracking-wider mb-2">
                Monthly Installments List
              </h4>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-600 font-semibold uppercase">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Due Date</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-right">Paid</th>
                      <th className="px-3 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {installments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                          No installments scheduled (Package paid in full at admission)
                        </td>
                      </tr>
                    ) : (
                      installments.map((inst) => {
                        const isLate =
                          inst.status !== 'Paid' &&
                          new Date(inst.due_date) < new Date(new Date().setHours(0, 0, 0, 0));

                        return (
                          <tr key={inst._id} className="hover:bg-slate-50 font-mono">
                            <td className="px-3 py-2.5 font-bold text-slate-700">
                              Inst #{inst.installment_no}
                            </td>
                            <td className="px-3 py-2.5 font-sans">{formatDate(inst.due_date)}</td>
                            <td className="px-3 py-2.5 text-right font-bold text-slate-800">
                              {formatBDT(inst.amount)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-emerald-700 font-semibold">
                              {formatBDT(inst.paid_amount)}
                            </td>
                            <td className="px-3 py-2.5 text-center font-sans">
                              {isLate ? (
                                <Badge variant="danger" size="sm">
                                  Overdue
                                </Badge>
                              ) : (
                                <StatusBadge status={inst.status} />
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* CARD: PAYMENTS HISTORY */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-emerald-600" />
                <h3 className="font-semibold text-slate-800 text-base">Recorded Money Receipts</h3>
              </div>
              <span className="text-xs text-slate-400">Payments are immutable</span>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 font-semibold uppercase">
                  <tr>
                    <th className="px-3 py-2">Receipt No</th>
                    <th className="px-3 py-2">Payment Date</th>
                    <th className="px-3 py-2">Method & Ref</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-slate-400 font-sans">
                        No payments recorded yet
                      </td>
                    </tr>
                  ) : (
                    payments.map((pmt) => (
                      <tr key={pmt._id} className="hover:bg-slate-50 font-mono">
                        <td className="px-3 py-2.5 font-bold text-blue-700">{pmt.receipt_no}</td>
                        <td className="px-3 py-2.5 font-sans">{formatDate(pmt.payment_date)}</td>
                        <td className="px-3 py-2.5 font-sans">
                          <span className="font-medium text-slate-800">{pmt.method}</span>
                          {pmt.reference && (
                            <span className="block text-[11px] font-mono text-slate-400">
                              Ref: {pmt.reference}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-black text-emerald-700 text-sm">
                          {formatBDT(pmt.amount)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-sans">
                          <button
                            onClick={() => handleOpenReceipt(pmt.receipt_no)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-blue-600 hover:text-white bg-blue-50 hover:bg-blue-600 rounded transition-colors"
                          >
                            <Printer className="w-3 h-3" />
                            <span>Print Voucher</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* CARD: PERSONAL & CONTACT INFO */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <User className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-slate-800 text-base">Personal & Contact Record</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 font-medium">Father&apos;s Name:</span>
                <p className="font-semibold text-slate-800 text-sm mt-0.5">{student.father_name}</p>
              </div>

              <div>
                <span className="text-slate-400 font-medium">Mother&apos;s Name:</span>
                <p className="font-semibold text-slate-800 text-sm mt-0.5">{student.mother_name}</p>
              </div>

              <div>
                <span className="text-slate-400 font-medium">Date of Birth:</span>
                <p className="font-semibold text-slate-800 mt-0.5">
                  {formatDate(student.date_of_birth)}
                </p>
              </div>

              <div>
                <span className="text-slate-400 font-medium">Gender & Blood Group:</span>
                <p className="font-semibold text-slate-800 mt-0.5">
                  {student.gender} ({student.blood_group})
                </p>
              </div>

              <div>
                <span className="text-slate-400 font-medium">NID / Birth Certificate:</span>
                <p className="font-mono font-bold text-slate-800 mt-0.5">
                  {student.nid_or_birth_cert}
                </p>
              </div>

              <div>
                <span className="text-slate-400 font-medium">Religion & Marital Status:</span>
                <p className="font-semibold text-slate-800 mt-0.5">
                  {student.religion} &bull; {student.marital_status}
                </p>
              </div>

              <div>
                <span className="text-slate-400 font-medium">Emergency Contact:</span>
                <p className="font-semibold text-slate-800 mt-0.5">
                  {student.emergency_contact_name} ({student.emergency_contact_relation}) -{' '}
                  <span className="font-mono">{student.emergency_contact_phone}</span>
                </p>
              </div>

              <div>
                <span className="text-slate-400 font-medium">Email:</span>
                <p className="font-semibold text-slate-800 mt-0.5">{student.email || 'None'}</p>
              </div>

              <div className="sm:col-span-2">
                <span className="text-slate-400 font-medium">Present Address:</span>
                <p className="text-slate-800 mt-0.5">{student.present_address}</p>
              </div>

              <div className="sm:col-span-2">
                <span className="text-slate-400 font-medium">Permanent Address:</span>
                <p className="text-slate-800 mt-0.5">{student.permanent_address}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Column */}
        <div className="space-y-6">
          {/* CARD: PASSPORT & DESTINATION */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Plane className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-slate-800 text-base">Passport & Destination</h3>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 font-medium">Passport Number:</span>
                <p className="font-mono font-bold text-base text-slate-900 mt-0.5 uppercase">
                  {student.passport_no}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 font-medium">Issue Date:</span>
                  <p className="font-medium text-slate-800 mt-0.5">
                    {formatDate(student.passport_issue_date)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Expiry Date:</span>
                  <p
                    className={`font-bold mt-0.5 ${
                      passportExpiringSoon ? 'text-rose-600 underline' : 'text-slate-800'
                    }`}
                  >
                    {formatDate(student.passport_expiry_date)}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <span className="text-slate-400 font-medium">Target Destination:</span>
                <p className="font-bold text-slate-900 text-sm mt-0.5">
                  {student.destination_country}
                </p>
                {student.destination_contract_years > 0 && (
                  <p className="text-slate-500 text-[11px]">
                    Contract: {student.destination_contract_years} Years
                  </p>
                )}
              </div>

              {/* Previous Overseas History */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-slate-400 font-medium">Prior Overseas Work:</span>
                {student.has_previous_overseas_work ? (
                  <div className="p-2.5 bg-blue-50/60 rounded-lg text-slate-800 space-y-1 mt-1 text-[11px]">
                    <p>
                      <strong>Country:</strong> {student.overseas_country} (
                      {student.overseas_from_year} - {student.overseas_to_year})
                    </p>
                    <p>
                      <strong>Trade:</strong> {student.overseas_trade}
                    </p>
                    {student.overseas_passport_no && (
                      <p className="font-mono">
                        <strong>Old Passport:</strong> {student.overseas_passport_no}
                      </p>
                    )}
                    {student.overseas_visa_no && (
                      <p className="font-mono">
                        <strong>Old Visa No:</strong> {student.overseas_visa_no}
                      </p>
                    )}
                    {student.overseas_reason_for_return && (
                      <p>
                        <strong>Return Reason:</strong> {student.overseas_reason_for_return}
                      </p>
                    )}
                    {(student.overseas_passport_url || student.overseas_visa_url) && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {student.overseas_passport_url && (
                          <a
                            href={student.overseas_passport_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 rounded font-semibold"
                          >
                            View Old Passport
                          </a>
                        )}
                        {student.overseas_visa_url && (
                          <a
                            href={student.overseas_visa_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 rounded font-semibold"
                          >
                            View Old Visa
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-500 italic mt-0.5">None (First time overseas candidate)</p>
                )}
              </div>
            </div>
          </div>

          {/* CARD: TRAINING BATCH & EXAMINATION */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-slate-800 text-base">Trade, Batch & Exam Result</h3>
              </div>
              <StatusBadge status={student.status} />
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Trade Curriculum:</span>
                <span className="font-bold text-slate-900">{student.trade_name}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Assigned Batch:</span>
                {batch ? (
                  <Link
                    href={`/batches/${batch._id}`}
                    className="font-mono font-bold text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <span>{batch.name}</span>
                    <span className="bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded text-[11px] border border-blue-200">
                      {batch.batch_code}
                    </span>
                  </Link>
                ) : (
                  <span className="font-mono font-semibold text-slate-700">
                    {student.batch || 'Not assigned'}
                  </span>
                )}
              </div>

              {batch && (
                <div className="p-2.5 bg-slate-50 rounded-lg space-y-1 text-[11px] text-slate-600">
                  <p>
                    <strong>Schedule:</strong> {formatDate(batch.start_date)} → {formatDate(batch.end_date)}
                  </p>
                  {batch.exam_date && (
                    <p>
                      <strong>Exam Date:</strong> {formatDate(batch.exam_date)}
                    </p>
                  )}
                  {batch.instructor && (
                    <p>
                      <strong>Trainer:</strong> {batch.instructor}
                    </p>
                  )}
                </div>
              )}

              {/* Assessment Scores */}
              {assessment && (
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <span className="text-slate-500 font-semibold uppercase text-[11px] block">
                    Examination Evaluation
                  </span>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <span className="text-[10px] text-slate-400 block uppercase">Theory</span>
                      <span className="font-bold text-slate-800">
                        {assessment.theory_score !== null && assessment.theory_score !== undefined
                          ? `${assessment.theory_score}/100`
                          : '—'}
                      </span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <span className="text-[10px] text-slate-400 block uppercase">Practical</span>
                      <span className="font-bold text-slate-800">
                        {assessment.practical_score !== null && assessment.practical_score !== undefined
                          ? `${assessment.practical_score}/100`
                          : '—'}
                      </span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <span className="text-[10px] text-slate-400 block uppercase">Total</span>
                      <span className="font-bold text-blue-700">
                        {assessment.total_score !== null && assessment.total_score !== undefined
                          ? `${assessment.total_score}%`
                          : '—'}
                      </span>
                    </div>
                  </div>

                  {assessment.remarks && (
                    <p className="text-[11px] text-slate-500 italic mt-1">
                      &quot;{assessment.remarks}&quot;
                    </p>
                  )}
                </div>
              )}

              {/* Certificate Download */}
              <div className="pt-2 border-t border-slate-100">
                {assessment?.certificate_url ? (
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
                        <Award className="w-4 h-4 text-emerald-600" />
                        <span>Training Certificate Verified</span>
                      </div>
                      <span className="text-[11px] font-mono text-emerald-700">
                        {assessment.certificate_no}
                      </span>
                    </div>
                    <a
                      href={assessment.certificate_url}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                    >
                      <Award className="w-3.5 h-3.5" />
                      View / Download Certificate
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ) : batch ? (
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Certificate pending exam evaluation</span>
                    <Link
                      href={`/batches/${batch._id}`}
                      className="text-blue-600 font-semibold hover:underline"
                    >
                      Go to Batch Exam
                    </Link>
                  </div>
                ) : (
                  <p className="text-slate-400 italic text-[11px]">No batch assessment records yet</p>
                )}
              </div>

              {/* Action Button: Evaluate / Edit Exam Result & Certificate */}
              {canEdit && (
                <div className="pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={openAssessmentModal}
                    className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                  >
                    <Award className="w-4 h-4 text-emerald-400" />
                    <span>
                      {assessment ? 'Update Exam Result & Certificate' : 'Add Exam Result & Certificate'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* CARD: DOCUMENTS CHECKLIST (PRD Section 5.6) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-slate-800 text-base">Documents Checklist</h3>
              </div>
              <span className="text-xs text-slate-400">Upload &amp; Manage</span>
            </div>

            <div className="space-y-2.5">
              {documents.map((doc) => {
                const docFileUrl =
                  doc.file_url ||
                  (doc.document_type === 'Photos' && student.photo_url ? student.photo_url : '');
                const isUploadingThis = uploadingDocId === doc._id;
                const isEditingThis = editingDocId === doc._id;

                return (
                  <div
                    key={doc._id}
                    className={`p-3 rounded-lg border transition-colors ${
                      doc.received
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={doc.received}
                          disabled={!canEdit}
                          onChange={() => handleDocumentToggle(doc._id, doc.received)}
                          className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 mt-0.5 cursor-pointer"
                        />
                        <div>
                          <p
                            className={`text-xs font-semibold ${
                              doc.received ? 'text-emerald-900' : 'text-slate-700'
                            }`}
                          >
                            {doc.document_type}
                          </p>
                          {doc.received && doc.received_on && (
                            <p className="text-[10px] text-emerald-600 mt-0.5">
                              Received: {formatDate(doc.received_on)}
                            </p>
                          )}
                          {doc.notes && (
                            <p className="text-[10px] text-slate-500 mt-0.5 italic">{doc.notes}</p>
                          )}
                        </div>
                      </div>

                      {doc.received ? (
                        <Badge variant="success" size="sm">
                          Received
                        </Badge>
                      ) : (
                        <Badge variant="gray" size="sm">
                          Pending
                        </Badge>
                      )}
                    </div>

                    {/* File Upload, View/Download, and Inline Edit Controls */}
                    <div className="mt-2 pt-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {docFileUrl && (
                          <a
                            href={docFileUrl}
                            target="_blank"
                            rel="noreferrer"
                            download
                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded font-semibold"
                            title="View or Download Document"
                          >
                            <Download className="w-3 h-3" />
                            <span>View / Download</span>
                          </a>
                        )}

                        {canEdit && (
                          <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded font-semibold">
                            <Upload className="w-3 h-3 text-slate-500" />
                            <span>
                              {isUploadingThis
                                ? 'Uploading...'
                                : docFileUrl
                                ? 'Replace File'
                                : 'Upload File'}
                            </span>
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              disabled={isUploadingThis}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleDocumentFileUpload(doc._id, f);
                              }}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>

                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditingThis) {
                              setEditingDocId(null);
                            } else {
                              setEditingDocId(doc._id);
                              setDocNoteInput(doc.notes || '');
                              setDocExpiryInput(toInputDate(doc.expiry_date));
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded font-medium"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>{isEditingThis ? 'Close' : 'Edit'}</span>
                        </button>
                      )}
                    </div>

                    {/* Inline Edit Details (Expiry + Note/Ref) */}
                    {isEditingThis && canEdit ? (
                      <div className="mt-2 pt-2 border-t border-slate-200 space-y-2 text-[11px]">
                        <div>
                          <label className="block font-semibold text-slate-600 mb-0.5">
                            Validity Expiry Date (Optional)
                          </label>
                          <input
                            type="date"
                            value={docExpiryInput}
                            onChange={(e) => setDocExpiryInput(e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-600 mb-0.5">
                            Notes / Reference #
                          </label>
                          <input
                            type="text"
                            value={docNoteInput}
                            onChange={(e) => setDocNoteInput(e.target.value)}
                            placeholder="e.g. Medical Fit, Police Ref #123..."
                            className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-slate-800"
                          />
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleSaveDocDetails(doc._id)}
                            className="px-3 py-1 bg-slate-900 text-white rounded font-semibold hover:bg-slate-800"
                          >
                            Save Details
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Always show Validity Expiry cleanly if present or needed */
                      (doc.needs_expiry || doc.expiry_date) && (
                        <div className="mt-2 pt-1.5 border-t border-slate-200/50 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Validity Expiry:</span>
                          {canEdit ? (
                            <input
                              type="date"
                              value={toInputDate(doc.expiry_date)}
                              onChange={(e) => handleDocumentExpiryChange(doc._id, e.target.value)}
                              className="px-2 py-0.5 bg-white border border-slate-300 rounded text-[11px] text-slate-800"
                            />
                          ) : (
                            <span className="font-semibold text-slate-700">
                              {doc.expiry_date ? formatDate(doc.expiry_date) : '—'}
                            </span>
                          )}
                        </div>
                      )
                    )}
                  </div>
                );
              })}

              {/* Add Custom Document Input */}
              {canEdit && (
                <form
                  onSubmit={handleAddCustomDocument}
                  className="pt-2 border-t border-slate-100 space-y-2"
                >
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={newDocName}
                      onChange={(e) => setNewDocName(e.target.value)}
                      placeholder="Add extra doc (e.g. Training Cert)"
                      className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800"
                    />
                    <button
                      type="submit"
                      disabled={addingDoc || !newDocName.trim()}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newDocNeedsExpiry}
                      onChange={(e) => setNewDocNeedsExpiry(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span>Requires validity expiry date</span>
                  </label>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* EDIT PROFILE MODAL - FULL CANDIDATE PROFILE MANAGEMENT */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Candidate Profile"
        description="Update personal identity, contact details, passport particulars, and training batch."
        maxWidth="2xl"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto px-1">
          {editError && (
            <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
              {editError}
            </div>
          )}

          {/* Section 1: Candidate Photo & Identity */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span>Identity & Personal Details</span>
            </h4>

            {/* Photo Upload & Preview */}
            <div className="flex items-center gap-4 pb-2 border-b border-slate-200/80">
              {editFormData.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={editFormData.photo_url}
                  alt="Candidate Photo"
                  className="w-14 h-14 rounded-xl object-cover border-2 border-blue-500 shadow-xs shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-500 text-xs font-bold shrink-0">
                  Photo
                </div>
              )}

              <div className="flex-1">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Candidate Photo
                </label>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 shadow-xs transition-colors">
                    <Upload className="w-3.5 h-3.5 text-blue-600" />
                    <span>{uploadingPhoto ? 'Uploading...' : 'Upload New Photo'}</span>
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
                      className="text-[11px] text-rose-600 hover:underline font-semibold"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Candidate Full Name *</label>
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
                <label className="block font-bold text-slate-600 mb-1">Blood Group</label>
                <input
                  type="text"
                  placeholder="e.g. B+, O+, A+"
                  value={editFormData.blood_group || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, blood_group: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">NID / Birth Certificate *</label>
                <input
                  type="text"
                  required
                  value={editFormData.nid_or_birth_cert || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, nid_or_birth_cert: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Marital Status</label>
                <select
                  value={editFormData.marital_status || 'Single'}
                  onChange={(e) => setEditFormData({ ...editFormData, marital_status: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                >
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Divorced">Divorced</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Contact & Addresses */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-blue-600" />
              <span>Contact Particulars & Addresses</span>
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
                <label className="block font-bold text-slate-600 mb-1">Email Address</label>
                <input
                  type="email"
                  value={editFormData.email || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Emergency Contact Name</label>
                <input
                  type="text"
                  value={editFormData.emergency_contact_name || ''}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, emergency_contact_name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Emergency Contact Phone</label>
                <input
                  type="text"
                  value={editFormData.emergency_contact_phone || ''}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, emergency_contact_phone: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-600 mb-1">Present Address</label>
                <textarea
                  rows={2}
                  value={editFormData.present_address || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, present_address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-600 mb-1">Permanent Address</label>
                <textarea
                  rows={2}
                  value={editFormData.permanent_address || ''}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, permanent_address: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Passport & Overseas Target */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Plane className="w-3.5 h-3.5 text-blue-600" />
              <span>Passport & Target Overseas Destination</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Passport Number *</label>
                <input
                  type="text"
                  required
                  value={editFormData.passport_no || ''}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, passport_no: e.target.value.toUpperCase() })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-mono font-bold uppercase"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Passport Issue Date</label>
                <input
                  type="date"
                  value={editFormData.passport_issue_date || ''}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, passport_issue_date: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Passport Expiry Date *</label>
                <input
                  type="date"
                  required
                  value={editFormData.passport_expiry_date || ''}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, passport_expiry_date: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Target Destination Country</label>
                <select
                  value={editFormData.destination_country || 'Not decided yet'}
                  onChange={(e) => {
                    const selectedCountry = e.target.value;
                    if (selectedCountry === 'Not decided yet') {
                      setEditFormData({
                        ...editFormData,
                        destination_country: 'Not decided yet',
                        destination_contract_years: 0,
                        visa_cost: 0,
                        govt_fee: 0,
                      });
                    } else {
                      const studentTradeId = student?.trade_id?._id || student?.trade_id;
                      const match =
                        countryCosts.find(
                          (c: any) =>
                            c.country === selectedCountry &&
                            String(c.trade_id?._id || c.trade_id) === String(studentTradeId)
                        ) || countryCosts.find((c: any) => c.country === selectedCountry);

                      setEditFormData({
                        ...editFormData,
                        destination_country: selectedCountry,
                        visa_cost: match ? match.visa_cost : editFormData.visa_cost,
                        govt_fee: match ? match.govt_fee : editFormData.govt_fee,
                        destination_contract_years: match
                          ? match.contract_years
                          : editFormData.destination_contract_years || 2,
                      });
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-medium"
                >
                  <option value="Not decided yet">Course Only (Not decided yet)</option>
                  {Array.from(
                    new Set([
                      ...countryCosts.map((c: any) => c.country),
                      'Saudi Arabia',
                      'Singapore',
                      'UAE - Dubai',
                      'Qatar',
                      'Malaysia',
                      editFormData.destination_country || '',
                    ])
                  )
                    .filter((c) => c && c !== 'Not decided yet')
                    .map((c) => {
                      const studentTradeId = student?.trade_id?._id || student?.trade_id;
                      const rate =
                        countryCosts.find(
                          (item: any) =>
                            item.country === c &&
                            String(item.trade_id?._id || item.trade_id) === String(studentTradeId)
                        ) || countryCosts.find((item: any) => item.country === c);

                      return (
                        <option key={c} value={c}>
                          {c}
                          {rate ? ` (Visa + Govt: ${formatBDT(rate.visa_cost + rate.govt_fee)})` : ''}
                        </option>
                      );
                    })}
                </select>
              </div>
            </div>
          </div>

          {/* Section 4: Training Batch & Candidate Status */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
              <span>Training Batch &amp; Overall Status</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Assigned Training Batch</label>
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
                <label className="block font-bold text-slate-600 mb-1">Candidate Status</label>
                <select
                  value={editFormData.status || 'Active'}
                  onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-semibold"
                >
                  <option value="Active">Active (In Training / Processing)</option>
                  <option value="Passed">Passed (Exam &amp; Certification Passed)</option>
                  <option value="Failed">Failed (Exam Failed / Retake)</option>
                  <option value="Dropped">Dropped (Left Training)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 5: Visa Inclusion & Package Fee Update */}
          <div className="border border-emerald-200 rounded-xl p-4 space-y-3 bg-emerald-50/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                <Globe2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Include Visa / Update Package Fees (BDT)</span>
              </h4>
              {(() => {
                const targetCountry = editFormData.destination_country;
                if (!targetCountry || targetCountry === 'Not decided yet') {
                  return (
                    <span className="text-[11px] text-emerald-700 font-medium">
                      Select Target Country above to load Visa &amp; Govt fees
                    </span>
                  );
                }
                const studentTradeId = student?.trade_id?._id || student?.trade_id;
                const matchedRate =
                  countryCosts.find(
                    (c: any) =>
                      c.country === targetCountry &&
                      String(c.trade_id?._id || c.trade_id) === String(studentTradeId)
                  ) || countryCosts.find((c: any) => c.country === targetCountry);

                if (!matchedRate) return null;
                return (
                  <button
                    type="button"
                    onClick={() =>
                      setEditFormData({
                        ...editFormData,
                        visa_cost: matchedRate.visa_cost,
                        govt_fee: matchedRate.govt_fee,
                        destination_contract_years: matchedRate.contract_years,
                      })
                    }
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-bold shadow-xs transition-colors"
                  >
                    Apply {targetCountry} Rate ({formatBDT(matchedRate.visa_cost + matchedRate.govt_fee)})
                  </button>
                );
              })()}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Admission</label>
                <input
                  type="number"
                  min={0}
                  value={editFormData.admission_fee ?? 0}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, admission_fee: Number(e.target.value) })
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-slate-900"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Course Fee</label>
                <input
                  type="number"
                  min={0}
                  value={editFormData.course_fee ?? 0}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, course_fee: Number(e.target.value) })
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-slate-900"
                />
              </div>
              <div>
                <label className="block font-bold text-emerald-800 mb-1">Visa Cost</label>
                <input
                  type="number"
                  min={0}
                  value={editFormData.visa_cost ?? 0}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, visa_cost: Number(e.target.value) })
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-emerald-300 rounded-lg font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block font-bold text-emerald-800 mb-1">Govt Fee</label>
                <input
                  type="number"
                  min={0}
                  value={editFormData.govt_fee ?? 0}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, govt_fee: Number(e.target.value) })
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-emerald-300 rounded-lg font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Discount</label>
                <input
                  type="number"
                  min={0}
                  value={editFormData.discount ?? 0}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, discount: Number(e.target.value) })
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-slate-900"
                />
              </div>
            </div>

            {(() => {
              const newPayable = Math.max(
                0,
                Number(editFormData.admission_fee || 0) +
                  Number(editFormData.course_fee || 0) +
                  Number(editFormData.visa_cost || 0) +
                  Number(editFormData.govt_fee || 0) -
                  Number(editFormData.discount || 0)
              );
              const newDue = Math.max(0, newPayable - (student?.total_paid || 0));
              const oldDue = student?.total_due || 0;
              return (
                <div className="p-2.5 bg-white border border-emerald-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap gap-3 font-mono">
                    <span>
                      New Total: <strong>{formatBDT(newPayable)}</strong>
                    </span>
                    <span className="text-emerald-700">
                      Paid: <strong>{formatBDT(student?.total_paid || 0)}</strong>
                    </span>
                    <span className="text-rose-700">
                      New Due: <strong>{formatBDT(newDue)}</strong>
                    </span>
                  </div>

                  {newDue > oldDue && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-amber-800">
                        New Visa Due Date:
                      </span>
                      <input
                        type="date"
                        value={editFormData.visa_due_date || ''}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, visa_due_date: e.target.value })
                        }
                        className="px-2 py-1 border border-amber-300 rounded text-[11px] font-mono text-slate-900"
                      />
                    </div>
                  )}
                </div>
              );
            })()}
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
              disabled={isSubmittingEdit}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs"
            >
              {isSubmittingEdit ? 'Saving Profile...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* EVALUATE & EDIT EXAM RESULT & CERTIFICATE MODAL */}
      <Modal
        isOpen={isAssessmentModalOpen}
        onClose={() => setIsAssessmentModalOpen(false)}
        title="Candidate Exam Result & Certificate"
        description={`Record theory/practical evaluation and upload certified diploma for ${student?.name} (${student?.student_no})`}
        maxWidth="xl"
      >
        <form onSubmit={handleAssessmentSubmit} className="space-y-4 text-xs">
          {assessmentError && (
            <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
              {assessmentError}
            </div>
          )}

          {/* Exam Marks Evaluation */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-emerald-600" />
                <span>Examination Evaluation</span>
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Batch: {student?.batch || 'General'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Theory Score (/100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="0 - 100"
                  value={assessmentFormData.theory_score}
                  onChange={(e) => {
                    const th = e.target.value;
                    const pr = assessmentFormData.practical_score;
                    let tot = '';
                    if (th !== '' && pr !== '') {
                      tot = String(Math.round((Number(th) + Number(pr)) / 2));
                    }
                    const resStat =
                      th !== '' && pr !== ''
                        ? Number(th) >= 40 && Number(pr) >= 40
                          ? 'Passed'
                          : 'Failed'
                        : assessmentFormData.result_status;

                    setAssessmentFormData({
                      ...assessmentFormData,
                      theory_score: th,
                      total_score: tot,
                      result_status: resStat as any,
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Practical Score (/100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="0 - 100"
                  value={assessmentFormData.practical_score}
                  onChange={(e) => {
                    const pr = e.target.value;
                    const th = assessmentFormData.theory_score;
                    let tot = '';
                    if (th !== '' && pr !== '') {
                      tot = String(Math.round((Number(th) + Number(pr)) / 2));
                    }
                    const resStat =
                      th !== '' && pr !== ''
                        ? Number(th) >= 40 && Number(pr) >= 40
                          ? 'Passed'
                          : 'Failed'
                        : assessmentFormData.result_status;

                    setAssessmentFormData({
                      ...assessmentFormData,
                      practical_score: pr,
                      total_score: tot,
                      result_status: resStat as any,
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Total Score (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="Average"
                  value={assessmentFormData.total_score}
                  onChange={(e) =>
                    setAssessmentFormData({ ...assessmentFormData, total_score: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 bg-white rounded-lg text-xs text-blue-700 font-mono font-bold"
                />
              </div>
            </div>

            {/* Exam Date & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Exam Conducted Date</label>
                <input
                  type="date"
                  value={assessmentFormData.exam_date}
                  onChange={(e) =>
                    setAssessmentFormData({ ...assessmentFormData, exam_date: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Result Status (ফলাফল) *</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setAssessmentFormData({ ...assessmentFormData, result_status: 'Passed' })
                    }
                    className={`py-2 text-center rounded-lg font-bold border transition-all ${
                      assessmentFormData.result_status === 'Passed'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Passed (পাস)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setAssessmentFormData({ ...assessmentFormData, result_status: 'Failed' })
                    }
                    className={`py-2 text-center rounded-lg font-bold border transition-all ${
                      assessmentFormData.result_status === 'Failed'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Failed (ফেল)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setAssessmentFormData({ ...assessmentFormData, result_status: 'Pending' })
                    }
                    className={`py-2 text-center rounded-lg font-bold border transition-all ${
                      assessmentFormData.result_status === 'Pending'
                        ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Pending
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Certificate Particulars & Upload */}
          <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200/80 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-200/60">
              <span className="font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                <Award className="w-4 h-4 text-emerald-600" />
                <span>Certificate & Diploma Attachment</span>
              </span>
              <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-100/60 px-2 py-0.5 rounded">
                Verified Credential
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">Certificate Number</label>
                  <button
                    type="button"
                    onClick={() => {
                      const yr = new Date().getFullYear();
                      const num = student?.student_no?.replace(/[^0-9]/g, '')?.slice(-4) || '0001';
                      setAssessmentFormData({
                        ...assessmentFormData,
                        certificate_no: `CERT-${yr}-${num}`,
                      });
                    }}
                    className="text-[10px] font-bold text-emerald-700 hover:underline flex items-center gap-0.5"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Auto-Gen</span>
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="e.g. CERT-2026-0012"
                  value={assessmentFormData.certificate_no}
                  onChange={(e) =>
                    setAssessmentFormData({ ...assessmentFormData, certificate_no: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Certificate Issue Date</label>
                <input
                  type="date"
                  value={assessmentFormData.certificate_issue_date}
                  onChange={(e) =>
                    setAssessmentFormData({
                      ...assessmentFormData,
                      certificate_issue_date: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                />
              </div>
            </div>

            {/* Certificate File Upload & Preview */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Certificate Document (PDF or Scanned Copy)
              </label>

              <div className="flex items-center gap-2">
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-800 shadow-xs transition-colors">
                  <Upload className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{uploadingCert ? 'Uploading File...' : 'Upload File (PDF/Image)'}</span>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={handleCertificateUpload}
                    disabled={uploadingCert}
                    className="hidden"
                  />
                </label>

                <input
                  type="text"
                  placeholder="Or paste direct certificate URL..."
                  value={assessmentFormData.certificate_url}
                  onChange={(e) =>
                    setAssessmentFormData({
                      ...assessmentFormData,
                      certificate_url: e.target.value,
                    })
                  }
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-800 font-mono"
                />
              </div>

              {assessmentFormData.certificate_url && (
                <div className="mt-2 flex items-center justify-between p-2 bg-white rounded-lg border border-emerald-200 text-xs">
                  <div className="flex items-center gap-2 truncate text-emerald-800 font-medium">
                    <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="truncate">{assessmentFormData.certificate_url}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={assessmentFormData.certificate_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-700 font-bold hover:underline inline-flex items-center gap-0.5"
                    >
                      <span>Preview</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      type="button"
                      onClick={() =>
                        setAssessmentFormData({ ...assessmentFormData, certificate_url: '' })
                      }
                      className="text-[11px] text-rose-600 hover:underline font-semibold"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Remarks & Evaluator */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Evaluator / Examiner Name</label>
                <input
                  type="text"
                  value={assessmentFormData.evaluated_by}
                  onChange={(e) =>
                    setAssessmentFormData({
                      ...assessmentFormData,
                      evaluated_by: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Remarks / Note</label>
                <input
                  type="text"
                  placeholder="e.g. Excellent practical welding score"
                  value={assessmentFormData.remarks}
                  onChange={(e) =>
                    setAssessmentFormData({ ...assessmentFormData, remarks: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900"
                />
              </div>
            </div>

            {/* Sync Candidate Status Checkbox */}
            <div className="pt-2 border-t border-emerald-200/60 flex items-center gap-2">
              <input
                type="checkbox"
                id="sync_student_status"
                checked={assessmentFormData.sync_student_status}
                onChange={(e) =>
                  setAssessmentFormData({
                    ...assessmentFormData,
                    sync_student_status: e.target.checked,
                  })
                }
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
              />
              <label htmlFor="sync_student_status" className="text-xs font-semibold text-slate-700 cursor-pointer">
                Synchronize candidate overall profile status to &quot;{assessmentFormData.result_status}&quot;
              </label>
            </div>
          </div>

          <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAssessmentModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingAssessment}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs"
            >
              {isSubmittingAssessment ? 'Saving Evaluation...' : 'Save Exam Result & Certificate'}
            </button>
          </div>
        </form>
      </Modal>

      {/* RECORD PAYMENT MODAL */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Record Payment / Installment"
        description={`Record incoming installment for ${student.name} (${student.student_no})`}
        maxWidth="md"
      >
        <form onSubmit={handlePaymentSubmit} className="space-y-4">
          {paymentError && (
            <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
              {paymentError}
            </div>
          )}

          <div>
            <div className="flex justify-between items-center mb-1 text-xs">
              <span className="font-semibold text-slate-700 uppercase">Payment Amount (BDT) *</span>
              <span className="text-slate-500">
                Max Due: <strong className="text-rose-600">{formatBDT(student.total_due)}</strong>
              </span>
            </div>
            <input
              type="number"
              required
              min={1}
              max={student.total_due}
              value={paymentFormData.amount}
              onChange={(e) =>
                setPaymentFormData({ ...paymentFormData, amount: e.target.value })
              }
              placeholder="e.g. 25000"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base font-bold text-slate-900 font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 uppercase mb-1">
                Payment Method *
              </label>
              <select
                value={paymentFormData.method}
                onChange={(e) =>
                  setPaymentFormData({ ...paymentFormData, method: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
              >
                <option value="Cash">Cash</option>
                <option value="bKash">bKash</option>
                <option value="Nagad">Nagad</option>
                <option value="Rocket">Rocket</option>
                <option value="Bank transfer">Bank transfer</option>
                <option value="Cheque">Cheque</option>
                <option value="Card">Card</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 uppercase mb-1">
                Reference / Trx No
              </label>
              <input
                type="text"
                value={paymentFormData.reference}
                onChange={(e) =>
                  setPaymentFormData({ ...paymentFormData, reference: e.target.value })
                }
                placeholder="Trx or Cheque #"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-800"
              />
            </div>
          </div>

          <div className="text-xs">
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              Payment Date *
            </label>
            <input
              type="date"
              required
              value={paymentFormData.payment_date}
              onChange={(e) =>
                setPaymentFormData({ ...paymentFormData, payment_date: e.target.value })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
            />
          </div>

          <div className="text-xs">
            <label className="block font-semibold text-slate-700 uppercase mb-1">Note</label>
            <input
              type="text"
              value={paymentFormData.note}
              onChange={(e) => setPaymentFormData({ ...paymentFormData, note: e.target.value })}
              placeholder="e.g. 2nd Installment payment"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
            />
          </div>

          {/* Next Due Date Section (বকেয়া থাকলে পরবর্তী কিস্তির তারিখ নির্ধারণ) */}
          {Number(paymentFormData.amount) < student.total_due && (
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <label className="font-bold text-amber-900 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-700" />
                  <span>Next Due Date (পরবর্তী কিস্তির তারিখ)</span>
                </label>
                <span className="text-[11px] text-amber-700 font-mono font-bold">
                  Remaining Due: {formatBDT(student.total_due - (Number(paymentFormData.amount) || 0))}
                </span>
              </div>
              <input
                type="date"
                value={paymentFormData.next_due_date}
                onChange={(e) =>
                  setPaymentFormData({ ...paymentFormData, next_due_date: e.target.value })
                }
                className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-slate-900 font-bold focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-[10px] text-amber-800">
                এই পেমেন্টের পর প্রার্থীর অবশিষ্ট বকেয়া পরিশোধের নির্ধারিত তারিখ সেট করুন।
              </p>
            </div>
          )}

          <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingPayment}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm"
            >
              {isSubmittingPayment ? 'Recording...' : 'Confirm & Generate Receipt'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MONEY RECEIPT VOUCHER MODAL */}
      {activeReceipt && (
        <Modal
          isOpen={true}
          onClose={() => setActiveReceipt(null)}
          title="Printable Money Receipt"
          description={`Receipt #${activeReceipt.receipt_no} - ${activeReceipt.student?.name}`}
          maxWidth="4xl"
        >
          <MoneyReceipt receipt={activeReceipt} onClose={() => setActiveReceipt(null)} />
        </Modal>
      )}
    </div>
  );
}

