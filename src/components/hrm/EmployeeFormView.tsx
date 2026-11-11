'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Save,
  Trash2,
  UploadCloud,
  FileText,
  ZoomIn,
} from 'lucide-react';
import { EmployeeAvatar } from './EmployeeAvatar';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/formatters';

interface EmployeeDocItem {
  title: string;
  category: 'NID' | 'CV' | 'Certificate' | 'Appointment' | 'Other';
  url: string;
  uploaded_at?: string;
}

interface MetaData {
  departments: Array<{ _id: string; name: string; code: string }>;
  designations: Array<{ _id: string; name: string; code: string; grade_label?: string }>;
  schedules: Array<{ _id: string; name: string; shift?: string; start_time: string; end_time: string }>;
  structures: Array<{ _id: string; name: string; code: string }>;
  managers: Array<{ _id: string; employee_id: string; firstName: string; lastName: string; designation: string }>;
  erpUsers: Array<{ _id: string; name: string; username: string; role: string }>;
}

const BLOOD_GROUPS = ['', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const EMPLOYEE_TYPES = ['Permanent', 'Contract', 'Intern', 'Part-time'] as const;
const STATUSES = ['Active', 'On Leave', 'Inactive', 'Resigned', 'Terminated'] as const;
const PAY_METHODS = ['Bank', 'bKash', 'Nagad', 'Cash'] as const;

export function EmployeeFormView({ employeeId }: { employeeId?: string }) {
  const router = useRouter();
  const isEdit = Boolean(employeeId);

  const [meta, setMeta] = useState<MetaData>({
    departments: [],
    designations: [],
    schedules: [],
    structures: [],
    managers: [],
    erpUsers: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const [empCode, setEmpCode] = useState('');
  const [form, setForm] = useState({
    photo_url: '',
    firstName: '',
    lastName: '',
    father_name: '',
    mother_name: '',
    date_of_birth: '',
    gender: '',
    nid_number: '',
    blood_group: '',
    marital_status: '',
    phone: '',
    email: '',
    present_address: '',
    permanent_address: '',
    emergency_name: '',
    emergency_relation: '',
    emergency_phone: '',
    department_id: '',
    department: '',
    designation_id: '',
    designation: '',
    manager_id: '',
    employee_type: 'Permanent',
    joining_date: new Date().toISOString().split('T')[0],
    resignation_date: '',
    status: 'Active',
    biometric_id: '',
    shift: 'Regular',
    schedule_id: '',
    userId: '',
    basic_salary: '15000',
    commission_rate: '0',
    structure_id: '',
    salary_change_reason: '',
    payment_method: 'Bank',
    bank_name: '',
    bank_branch: '',
    bank_account_no: '',
  });

  const [documents, setDocuments] = useState<EmployeeDocItem[]>([]);
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState<EmployeeDocItem['category']>('NID');
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Canvas Photo Crop/Resize state
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const reqs: Promise<Response>[] = [fetch('/api/hrm/meta')];
        if (employeeId) reqs.push(fetch(`/api/hrm/employees/${employeeId}`));
        const [metaRes, empRes] = await Promise.all(reqs);
        const metaJson = await metaRes.json();
        const empJson = empRes ? await empRes.json() : null;

        if (cancelled) return;
        if (metaJson.success && metaJson.data) {
          setMeta(metaJson.data);
        }

        if (empJson?.success && empJson.data) {
          const e = empJson.data;
          setEmpCode(e.employee_id || '');
          setForm({
            photo_url: e.photo_url || '',
            firstName: e.firstName || '',
            lastName: e.lastName || '',
            father_name: e.father_name || '',
            mother_name: e.mother_name || '',
            date_of_birth: e.date_of_birth ? String(e.date_of_birth).split('T')[0] : '',
            gender: e.gender || '',
            nid_number: e.nid_number || '',
            blood_group: e.blood_group || '',
            marital_status: e.marital_status || '',
            phone: e.phone || '',
            email: e.email || '',
            present_address: e.present_address || '',
            permanent_address: e.permanent_address || '',
            emergency_name: e.emergency_contact?.name || '',
            emergency_relation: e.emergency_contact?.relation || '',
            emergency_phone: e.emergency_contact?.phone || '',
            department_id: e.department_id?._id || e.department_id || '',
            department: e.department || '',
            designation_id: e.designation_id?._id || e.designation_id || '',
            designation: e.designation || '',
            manager_id: e.manager_id?._id || e.manager_id || '',
            employee_type: e.employee_type || 'Permanent',
            joining_date: e.joining_date ? String(e.joining_date).split('T')[0] : '',
            resignation_date: e.resignation_date ? String(e.resignation_date).split('T')[0] : '',
            status: e.status || 'Active',
            biometric_id: e.biometric_id || '',
            shift: e.shift || 'Regular',
            schedule_id: e.schedule_id?._id || e.schedule_id || '',
            userId: e.userId?._id || e.userId || '',
            basic_salary: String(e.basic_salary ?? 0),
            commission_rate: String(e.commission_rate ?? 0),
            structure_id: e.contract_structure_id || '',
            salary_change_reason: '',
            payment_method: e.payment_method || 'Bank',
            bank_name: e.bank_name || '',
            bank_branch: e.bank_branch || '',
            bank_account_no: e.bank_account_no || '',
          });
          setDocuments(Array.isArray(e.documents) ? e.documents : []);
        } else if (metaJson.success && metaJson.data?.departments?.length > 0 && !employeeId) {
          setForm((prev) => ({
            ...prev,
            department_id: metaJson.data.departments[0]._id,
            department: metaJson.data.departments[0].name,
            designation_id: metaJson.data.designations?.[0]?._id || '',
            designation: metaJson.data.designations?.[0]?.name || '',
          }));
        }
      } catch (err) {
        console.error('Failed loading employee form:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  const drawCropCanvas = (imageSrc: string, zoomVal: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      const size = 240;
      canvas.width = size;
      canvas.height = size;
      ctx.clearRect(0, 0, size, size);
      const minDim = Math.min(img.width, img.height);
      const cropDim = minDim / zoomVal;
      const sx = (img.width - cropDim) / 2;
      const sy = (img.height - cropDim) / 2;
      ctx.drawImage(img, sx, sy, cropDim, cropDim, 0, 0, size, size);
    };
    img.src = imageSrc;
  };

  useEffect(() => {
    if (cropSrc) {
      drawCropCanvas(cropSrc, cropZoom);
    }
  }, [cropSrc, cropZoom]);

  const cropAndUploadDataUrl = async (
    imageSrc: string,
    zoomVal: number,
    closeEditor: boolean
  ) => {
    setUploadingPhoto(true);
    setPhotoStatus(null);
    setBanner(null);
    try {
      const blob = await new Promise<Blob | null>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const outCanvas = document.createElement('canvas');
          const size = 300;
          outCanvas.width = size;
          outCanvas.height = size;
          const ctx = outCanvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context unavailable'));
            return;
          }
          const minDim = Math.min(img.width, img.height);
          const cropDim = minDim / zoomVal;
          const sx = (img.width - cropDim) / 2;
          const sy = (img.height - cropDim) / 2;
          ctx.drawImage(img, sx, sy, cropDim, cropDim, 0, 0, size, size);
          outCanvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
        };
        img.onerror = () => reject(new Error('Invalid image file'));
        img.src = imageSrc;
      });

      if (!blob) throw new Error('Failed to process photo.');
      const fd = new FormData();
      fd.append('file', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      fd.append('kind', 'photo');

      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Photo upload failed');

      setForm((prev) => ({ ...prev, photo_url: json.url }));
      if (closeEditor) setCropSrc(null);
      setPhotoStatus({ type: 'ok', msg: 'Photo uploaded! Click Save to store with employee.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Photo upload error';
      setPhotoStatus({ type: 'err', msg });
      setBanner({ type: 'err', msg });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSelectPhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const isImage =
      file.type.startsWith('image/') ||
      /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
    if (!isImage) {
      const msg = 'Please choose an image file (JPG, PNG, or WebP).';
      setPhotoStatus({ type: 'err', msg });
      setBanner({ type: 'err', msg });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      const msg = 'Source image must be under 10 MB.';
      setPhotoStatus({ type: 'err', msg });
      setBanner({ type: 'err', msg });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || '');
      setCropZoom(1);
      setCropSrc(src);
      // Immediately upload centered 300x300 JPEG so photo_url is ready even if user doesn't adjust zoom
      void cropAndUploadDataUrl(src, 1, false);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadCroppedPhoto = async () => {
    if (!cropSrc) return;
    await cropAndUploadDataUrl(cropSrc, cropZoom, true);
  };

  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setBanner({ type: 'err', msg: 'Document must not exceed 5 MB.' });
      return;
    }
    setUploadingDoc(true);
    setBanner(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'document');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Document upload failed');

      setDocuments((prev) => [
        ...prev,
        {
          title: docTitle.trim() || file.name,
          category: docCategory,
          url: json.url,
          uploaded_at: new Date().toISOString(),
        },
      ]);
      setDocTitle('');
      setBanner({ type: 'ok', msg: `Uploaded "${file.name}". Click Save Employee to persist.` });
    } catch (err: unknown) {
      setBanner({ type: 'err', msg: err instanceof Error ? err.message : 'Upload error' });
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setBanner(null);
    try {
      const payload = {
        ...form,
        basic_salary: Number(form.basic_salary) || 0,
        commission_rate: Number(form.commission_rate) || 0,
        emergency_contact: {
          name: form.emergency_name,
          relation: form.emergency_relation,
          phone: form.emergency_phone,
        },
        documents,
      };

      const url = isEdit ? `/api/hrm/employees/${employeeId}` : '/api/hrm/employees';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to save employee');

      setBanner({ type: 'ok', msg: json.message });
      setTimeout(() => {
        router.push('/hrm/employees');
      }, 650);
    } catch (err: unknown) {
      setBanner({ type: 'err', msg: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center bg-white rounded-xl border border-slate-200">
        <RefreshCw className="w-7 h-7 animate-spin text-emerald-600 mx-auto" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Top Bar */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/hrm/employees"
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {isEdit ? `Edit Employee (${empCode})` : 'Add New Employee'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Personal profile, department/designation, biometric mapping, payroll contract, and uploaded documents.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/hrm/employees"
            className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || uploadingPhoto}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {uploadingPhoto
              ? 'Uploading Photo...'
              : saving
              ? 'Saving...'
              : isEdit
              ? 'Save Changes'
              : 'Create Employee'}
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 border ${
            banner.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {banner.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{banner.msg}</span>
        </div>
      )}

      {/* 1. Profile Photo & Identity */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
          1. Photo &amp; Personal Identity
        </h2>

        <div className="flex flex-wrap items-center gap-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <EmployeeAvatar
            photoUrl={form.photo_url}
            firstName={form.firstName}
            lastName={form.lastName}
            size="xl"
          />
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-100">
                <Camera className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  {uploadingPhoto
                    ? 'Uploading Photo...'
                    : form.photo_url
                    ? 'Change Photo'
                    : 'Choose Photo (JPG/PNG/WebP, max 10MB)'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleSelectPhotoFile}
                  disabled={uploadingPhoto}
                  className="hidden"
                />
              </label>
              {form.photo_url && (
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, photo_url: '' }));
                    setCropSrc(null);
                    setPhotoStatus(null);
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg"
                >
                  Remove Photo
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Automatically crops &amp; resizes to 300×300 JPEG on selection. Adjust zoom below if needed.
            </p>
            {photoStatus && (
              <p
                className={`text-[11px] font-semibold ${
                  photoStatus.type === 'ok' ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {photoStatus.msg}
              </p>
            )}
          </div>

          {cropSrc && (
            <div className="w-full sm:w-auto flex flex-wrap items-center gap-4 pt-3 border-t border-slate-200">
              <canvas
                ref={canvasRef}
                className="w-28 h-28 rounded-full border-2 border-emerald-500 bg-white"
              />
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <ZoomIn className="w-3.5 h-3.5 text-slate-500" />
                  <span>Zoom: {cropZoom.toFixed(1)}x</span>
                  <input
                    type="range"
                    min="1"
                    max="2.5"
                    step="0.1"
                    value={cropZoom}
                    onChange={(e) => setCropZoom(Number(e.target.value))}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={handleUploadCroppedPhoto}
                    className="px-3 py-1.5 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                  >
                    {uploadingPhoto ? 'Uploading...' : 'Apply Zoom & Upload'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCropSrc(null)}
                    className="px-3 py-1.5 text-slate-600 bg-white border border-slate-200 rounded-lg"
                  >
                    Close Cropper
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">First Name *</label>
            <input
              type="text"
              required
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Last Name *</label>
            <input
              type="text"
              required
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">NID Number (Unique)</label>
            <input
              type="text"
              value={form.nid_number}
              onChange={(e) => setForm({ ...form, nid_number: e.target.value })}
              placeholder="National ID"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Father&apos;s Name</label>
            <input
              type="text"
              value={form.father_name}
              onChange={(e) => setForm({ ...form, father_name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Mother&apos;s Name</label>
            <input
              type="text"
              value={form.mother_name}
              onChange={(e) => setForm({ ...form, mother_name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Date of Birth</label>
            <input
              type="date"
              value={form.date_of_birth}
              onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Gender</label>
            <select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="">-- Select --</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Blood Group</label>
            <select
              value={form.blood_group}
              onChange={(e) => setForm({ ...form, blood_group: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg || 'none'} value={bg}>
                  {bg || '-- Select --'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Marital Status</label>
            <select
              value={form.marital_status}
              onChange={(e) => setForm({ ...form, marital_status: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="">-- Select --</option>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Divorced">Divorced</option>
              <option value="Widowed">Widowed</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. Contact & Address */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
          2. Contact, Address &amp; Emergency Contact
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Mobile Phone * (Unique)</label>
            <input
              type="text"
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Email (Unique)</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Present Address</label>
            <input
              type="text"
              value={form.present_address}
              onChange={(e) => setForm({ ...form, present_address: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Permanent Address</label>
            <input
              type="text"
              value={form.permanent_address}
              onChange={(e) => setForm({ ...form, permanent_address: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-1">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Emergency Contact Name</label>
            <input
              type="text"
              value={form.emergency_name}
              onChange={(e) => setForm({ ...form, emergency_name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Relation</label>
            <input
              type="text"
              value={form.emergency_relation}
              onChange={(e) => setForm({ ...form, emergency_relation: e.target.value })}
              placeholder="Spouse / Parent / Sibling"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Emergency Phone</label>
            <input
              type="text"
              value={form.emergency_phone}
              onChange={(e) => setForm({ ...form, emergency_phone: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* 3. Employment, Department, Designation & Attendance Mapping */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
          3. Employment &amp; Attendance Sync
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Department *</label>
            <select
              required
              value={form.department_id}
              onChange={(e) => {
                const chosen = meta.departments.find((d) => d._id === e.target.value);
                setForm({
                  ...form,
                  department_id: e.target.value,
                  department: chosen?.name || form.department,
                });
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="">-- Select Department --</option>
              {meta.departments.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Designation *</label>
            <select
              required
              value={form.designation_id}
              onChange={(e) => {
                const chosen = meta.designations.find((d) => d._id === e.target.value);
                setForm({
                  ...form,
                  designation_id: e.target.value,
                  designation: chosen?.name || form.designation,
                });
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="">-- Select Designation --</option>
              {meta.designations.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} {d.grade_label ? `(${d.grade_label})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Reporting Manager</label>
            <select
              value={form.manager_id}
              onChange={(e) => setForm({ ...form, manager_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="">-- No Manager --</option>
              {meta.managers
                .filter((m) => m._id !== employeeId)
                .map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.firstName} {m.lastName} ({m.employee_id})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Employee Type</label>
            <select
              value={form.employee_type}
              onChange={(e) => setForm({ ...form, employee_type: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              {EMPLOYEE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Joining Date</label>
            <input
              type="date"
              value={form.joining_date}
              onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Employment Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Biometric PIN / ID (Unique)
            </label>
            <input
              type="text"
              value={form.biometric_id}
              onChange={(e) => setForm({ ...form, biometric_id: e.target.value.toUpperCase() })}
              placeholder="e.g. 1001 or BIO-101"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Working Schedule / Shift</label>
            <select
              value={form.schedule_id}
              onChange={(e) => {
                const sched = meta.schedules.find((s) => s._id === e.target.value);
                setForm({
                  ...form,
                  schedule_id: e.target.value,
                  shift: sched?.shift || form.shift,
                });
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Dept / Default Schedule</option>
              {meta.schedules.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} ({s.start_time}–{s.end_time})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">ERP Login Account Link</label>
            <select
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="">No ERP User Linked</option>
              {meta.erpUsers.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name} (@{u.username} — {u.role})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 4. Payroll & Bank Details */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
          4. Salary, Payroll Contract &amp; Bank Details
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Basic Salary (BDT) *</label>
            <input
              type="number"
              required
              min="0"
              value={form.basic_salary}
              onChange={(e) => setForm({ ...form, basic_salary: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Payroll Salary Structure</label>
            <select
              value={form.structure_id}
              onChange={(e) => setForm({ ...form, structure_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Auto / Active Default</option>
              {meta.structures.map((st) => (
                <option key={st._id} value={st._id}>
                  {st.name} ({st.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Commission Rate (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={form.commission_rate}
              onChange={(e) => setForm({ ...form, commission_rate: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Payment Method</label>
            <select
              value={form.payment_method}
              onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              {PAY_METHODS.map((pm) => (
                <option key={pm} value={pm}>
                  {pm}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Bank / Wallet Name</label>
            <input
              type="text"
              value={form.bank_name}
              onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
              placeholder="e.g. Dutch-Bangla Bank"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Bank Branch</label>
            <input
              type="text"
              value={form.bank_branch}
              onChange={(e) => setForm({ ...form, bank_branch: e.target.value })}
              placeholder="e.g. Banani Branch"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Account / Wallet Number</label>
            <input
              type="text"
              value={form.bank_account_no}
              onChange={(e) => setForm({ ...form, bank_account_no: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          {isEdit && (
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Salary Change / Increment Note (recorded in Salary History)
              </label>
              <input
                type="text"
                value={form.salary_change_reason}
                onChange={(e) => setForm({ ...form, salary_change_reason: e.target.value })}
                placeholder="e.g. Annual increment 2026"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          )}
        </div>
      </div>

      {/* 5. Documents Upload */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
          5. Employee Documents (NID, CV, Certificates, Appointment Letter)
        </h2>

        <div className="flex flex-wrap items-end gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Category</label>
            <select
              value={docCategory}
              onChange={(e) => setDocCategory(e.target.value as EmployeeDocItem['category'])}
              className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="NID">NID Copy</option>
              <option value="CV">CV / Resume</option>
              <option value="Certificate">Certificate</option>
              <option value="Appointment">Appointment Letter</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block font-semibold text-slate-700 mb-1">Document Title</label>
            <input
              type="text"
              placeholder="e.g. Smart NID Front & Back"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            />
          </div>
          <label className="inline-flex items-center gap-1.5 px-4 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer">
            <UploadCloud className="w-4 h-4" />
            <span>{uploadingDoc ? 'Uploading...' : 'Attach File (max 5MB)'}</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              onChange={handleUploadDocument}
              disabled={uploadingDoc}
              className="hidden"
            />
          </label>
        </div>

        {documents.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No documents uploaded yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {documents.map((doc, idx) => (
              <div
                key={`${doc.url}-${idx}`}
                className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs bg-white"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                  <Badge variant="default">{doc.category}</Badge>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-slate-900 hover:text-emerald-700 truncate"
                  >
                    {doc.title}
                  </a>
                  {doc.uploaded_at && (
                    <span className="text-[11px] text-slate-400">
                      ({formatDate(doc.uploaded_at)})
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setDocuments((prev) => prev.filter((_, i) => i !== idx))}
                  className="p-1 text-slate-400 hover:text-rose-600 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </form>
  );
}

