'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  Phone,
  FileText,
  Plane,
  Briefcase,
  CreditCard,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Upload,
  CalendarDays,
  ShieldAlert,
  Plus,
} from 'lucide-react';
import { formatBDT, formatDate, calculateInstallments } from '@/lib/formatters';
import { MoneyReceipt } from '@/components/receipt/MoneyReceipt';
import { Modal } from '@/components/ui/Modal';
import {
  AddressSelector,
  AddressValue,
  composeAddressString,
} from '@/components/admissions/AddressSelector';

interface TradeItem {
  _id: string;
  name: string;
  course_days: number;
  admission_fee: number;
  course_fee: number;
  active: boolean;
}

interface CountryCostItem {
  _id: string;
  country: string;
  trade_id: string | { _id: string; name: string };
  visa_days: number;
  visa_cost: number;
  govt_fee: number;
  contract_years: number;
  total: number;
}

export function AdmissionForm() {
  const router = useRouter();

  // Reference lists
  const [trades, setTrades] = useState<TradeItem[]>([]);
  const [allCountryCosts, setAllCountryCosts] = useState<CountryCostItem[]>([]);
  const [availableCountryCosts, setAvailableCountryCosts] = useState<CountryCostItem[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Form State
  const [formData, setFormData] = useState({
    // 1. Identity
    name: '',
    father_name: '',
    mother_name: '',
    date_of_birth: '',
    gender: 'Male',
    blood_group: 'Unknown',
    nid_or_birth_cert: '',
    religion: 'Islam',
    marital_status: 'Single',
    photo_url: '',

    // 2. Contact
    mobile: '',
    email: '',
    emergency_contact_name: '',
    emergency_contact_relation: '',
    emergency_contact_phone: '',
    present_address: '',
    permanent_address: '',

    // 3. Passport
    passport_no: '',
    passport_issue_date: '',
    passport_expiry_date: '',
    passport_doc_url: '',

    // 4. Previous Overseas Work
    has_previous_overseas_work: false,
    overseas_country: '',
    overseas_from_year: '',
    overseas_to_year: '',
    overseas_trade: '',
    overseas_passport_no: '',
    overseas_visa_type: '',
    overseas_visa_no: '',
    overseas_visa_expiry: '',
    overseas_reason_for_return: '',

    // 5. Training & Destination
    trade_id: '',
    trade_name: '',
    batch: `B-${new Date().getFullYear()}-01`,
    session: 'Morning',
    admission_date: new Date().toISOString().split('T')[0],
    destination_country: 'Not decided yet',
    destination_contract_years: 0,

    // 6. Fees
    admission_fee: 0,
    course_fee: 0,
    visa_cost: 0,
    govt_fee: 0,
    discount: 0,

    // 7. Payment
    paid_now: 0,
    payment_method: 'Cash',
    payment_reference: '',
    payment_note: 'Admission & Initial Payment',
    installment_count: 3,
  });

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingPassport, setUploadingPassport] = useState(false);

  const [presentAddrObj, setPresentAddrObj] = useState<AddressValue>({
    district: '',
    upazila: '',
    details: '',
    customDistrict: false,
    customUpazila: false,
  });
  const [permanentAddrObj, setPermanentAddrObj] = useState<AddressValue>({
    district: '',
    upazila: '',
    details: '',
    customDistrict: false,
    customUpazila: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successReceipt, setSuccessReceipt] = useState<any | null>(null);
  const [createdStudent, setCreatedStudent] = useState<any | null>(null);
  const [existingBatches, setExistingBatches] = useState<any[]>([]);

  // Fetch initial Trades, Country Costs, and Batches
  useEffect(() => {
    async function loadData() {
      try {
        const [tradesRes, costsRes, batchesRes] = await Promise.all([
          fetch('/api/trades?active=true'),
          fetch('/api/country-costs'),
          fetch('/api/batches'),
        ]);

        const tradesData = await tradesRes.json();
        const costsData = await costsRes.json();
        const batchesData = await batchesRes.json();

        if (batchesData.success) {
          setExistingBatches(batchesData.batches || []);
        }

        if (tradesData.success) {
          setTrades(tradesData.trades || []);
          if (tradesData.trades && tradesData.trades.length > 0) {
            const first = tradesData.trades[0];
            setFormData((prev) => ({
              ...prev,
              trade_id: first._id,
              trade_name: first.name,
              admission_fee: first.admission_fee,
              course_fee: first.course_fee,
            }));
          }
        }

        if (costsData.success) {
          setAllCountryCosts(costsData.countryCosts || []);
        }
      } catch (err) {
        console.error('Failed to load setup data:', err);
      } finally {
        setLoadingInitial(false);
      }
    }
    loadData();
  }, []);

  // When trade changes, filter destination country list and update trade fees
  useEffect(() => {
    if (!formData.trade_id) {
      setAvailableCountryCosts([]);
      return;
    }

    const selectedTrade = trades.find((t) => t._id === formData.trade_id);
    if (selectedTrade) {
      const filteredCosts = allCountryCosts.filter((cost) => {
        const costTradeId =
          typeof cost.trade_id === 'object' && cost.trade_id !== null
            ? (cost.trade_id as any)._id
            : cost.trade_id;
        return costTradeId === formData.trade_id;
      });

      setAvailableCountryCosts(filteredCosts);

      // Auto-update base trade fees
      setFormData((prev) => ({
        ...prev,
        trade_name: selectedTrade.name,
        admission_fee: selectedTrade.admission_fee,
        course_fee: selectedTrade.course_fee,
      }));
    }
  }, [formData.trade_id, trades, allCountryCosts]);

  // Dynamically filter batches for the selected Trade
  const tradeBatches = useMemo(() => {
    if (!formData.trade_id) return [];
    return existingBatches.filter((b) => {
      const bTradeId =
        typeof b.trade_id === 'object' && b.trade_id !== null ? b.trade_id._id : b.trade_id;
      return bTradeId === formData.trade_id;
    });
  }, [existingBatches, formData.trade_id]);

  // Auto-select first active batch when tradeBatches change
  useEffect(() => {
    if (tradeBatches.length > 0) {
      const exists = tradeBatches.some((b) => b.batch_code === formData.batch);
      if (!exists) {
        setFormData((prev) => ({ ...prev, batch: tradeBatches[0].batch_code }));
      }
    }
  }, [tradeBatches]);

  // Quick Batch Modal State
  const [isQuickBatchModalOpen, setIsQuickBatchModalOpen] = useState(false);
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);
  const [quickBatchError, setQuickBatchError] = useState('');
  const [quickBatchForm, setQuickBatchForm] = useState({
    name: '',
    batch_code: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    instructor: '',
    capacity: '30',
  });

  const openQuickBatchModal = () => {
    const selectedTrade = trades.find((t) => t._id === formData.trade_id);
    const prefix = selectedTrade
      ? selectedTrade.name.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase()
      : 'TRD';
    const year = new Date().getFullYear();
    const nextNum = (tradeBatches.length + 1).toString().padStart(2, '0');
    const suggestedCode = `${prefix}-${year}-${nextNum}`;

    const start = new Date();
    const end = new Date(start.getTime() + (selectedTrade?.course_days || 45) * 24 * 60 * 60 * 1000);

    setQuickBatchForm({
      name: `${selectedTrade?.name || 'Training'} Batch ${nextNum}`,
      batch_code: suggestedCode,
      start_date: start.toISOString().split('T')[0],
      end_date: end.toISOString().split('T')[0],
      instructor: '',
      capacity: '30',
    });
    setQuickBatchError('');
    setIsQuickBatchModalOpen(true);
  };

  const handleQuickBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickBatchError('');
    setIsCreatingBatch(true);
    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: quickBatchForm.name,
          batch_code: quickBatchForm.batch_code,
          trade_id: formData.trade_id,
          start_date: quickBatchForm.start_date,
          end_date: quickBatchForm.end_date,
          instructor: quickBatchForm.instructor,
          capacity: quickBatchForm.capacity,
          status: 'In Training',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to create batch');
      }

      setExistingBatches((prev) => [data.batch, ...prev]);
      setFormData((prev) => ({ ...prev, batch: data.batch.batch_code }));
      setIsQuickBatchModalOpen(false);
    } catch (err: any) {
      setQuickBatchError(err.message || 'Error creating batch');
    } finally {
      setIsCreatingBatch(false);
    }
  };

  // Handle Country selection change
  const handleCountryChange = (countryName: string) => {
    if (countryName === 'Not decided yet') {
      setFormData((prev) => ({
        ...prev,
        destination_country: 'Not decided yet',
        destination_contract_years: 0,
        visa_cost: 0,
        govt_fee: 0,
      }));
      return;
    }

    const matched = availableCountryCosts.find((c) => c.country === countryName);
    if (matched) {
      setFormData((prev) => ({
        ...prev,
        destination_country: matched.country,
        destination_contract_years: matched.contract_years,
        visa_cost: matched.visa_cost,
        govt_fee: matched.govt_fee,
      }));
    }
  };

  // Calculations (PRD Section 7)
  const totalPayable = Math.max(
    0,
    Number(formData.admission_fee || 0) +
      Number(formData.course_fee || 0) +
      Number(formData.visa_cost || 0) +
      Number(formData.govt_fee || 0) -
      Number(formData.discount || 0)
  );

  const remainingBalance = Math.max(0, totalPayable - Number(formData.paid_now || 0));

  // Live calculated installment schedule preview
  const installmentPreview = calculateInstallments(
    remainingBalance,
    formData.installment_count,
    formData.admission_date || new Date()
  );

  // Handle Photo Upload
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const uploadForm = new FormData();
      uploadForm.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: uploadForm,
      });

      const data = await res.json();
      if (data.success && data.url) {
        setFormData((prev) => ({ ...prev, photo_url: data.url }));
      } else {
        alert(data.message || 'Failed to upload photo');
      }
    } catch (err) {
      console.error(err);
      alert('Error uploading file');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Handle Optional Passport Copy Upload
  const handlePassportUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPassport(true);
    try {
      const uploadForm = new FormData();
      uploadForm.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: uploadForm,
      });

      const data = await res.json();
      if (data.success && data.url) {
        setFormData((prev) => ({ ...prev, passport_doc_url: data.url }));
      } else {
        alert(data.message || 'Failed to upload passport copy');
      }
    } catch (err) {
      console.error(err);
      alert('Error uploading passport file');
    } finally {
      setUploadingPassport(false);
    }
  };

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Admission failed');
      }

      setCreatedStudent(data.student);

      if (data.receipt) {
        // Fetch complete receipt details for print voucher
        const receiptRes = await fetch(`/api/payments/${data.receipt.receipt_no}`);
        const receiptData = await receiptRes.json();
        if (receiptData.success) {
          setSuccessReceipt(receiptData.receipt);
        }
      } else {
        // If no payment was made, redirect directly to student profile
        router.push(`/students/${data.student._id}`);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingInitial) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-sm font-medium text-slate-500">Loading admission configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">New Student Admission</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Register a new candidate, calculate training & visa package fees, and issue the first money receipt.
          </p>
        </div>
      </div>

      {/* Duplicate / Validation Error Alert */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-800">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-rose-900">Admission Refused</h4>
            <p className="text-sm mt-0.5">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Flow Sequence Indicators */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs hidden sm:flex items-center justify-between text-xs font-semibold text-slate-500 overflow-x-auto">
        <div className="flex items-center gap-2 text-blue-600 shrink-0">
          <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[11px]">1</span>
          <span>1. Trade, Batch & Country</span>
        </div>
        <span className="text-slate-300">→</span>
        <div className="flex items-center gap-2 text-slate-700 shrink-0">
          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[11px]">2</span>
          <span>2. Passport & Expiry</span>
        </div>
        <span className="text-slate-300">→</span>
        <div className="flex items-center gap-2 text-slate-700 shrink-0">
          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[11px]">3</span>
          <span>3. Identity & Photo</span>
        </div>
        <span className="text-slate-300">→</span>
        <div className="flex items-center gap-2 text-slate-700 shrink-0">
          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[11px]">4</span>
          <span>4. Contact & Address</span>
        </div>
        <span className="text-slate-300">→</span>
        <div className="flex items-center gap-2 text-emerald-600 shrink-0">
          <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[11px]">5</span>
          <span>5. Fee & First Receipt</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Form Cards (Span 2) */}
          <div className="lg:col-span-2 space-y-6">
            {/* CARD 1: TRAINING TRADE & DESTINATION SETUP (FIRST PRIORITY) */}
            <div className="bg-white rounded-xl border border-blue-200 shadow-xs p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-slate-900 text-base">
                    1. Training Trade, Batch & Destination Setup
                  </h3>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md">
                  Step 1 (First Priority)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Select Training Trade *
                  </label>
                  <select
                    required
                    value={formData.trade_id}
                    onChange={(e) => setFormData({ ...formData, trade_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  >
                    {trades.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name} ({t.course_days} Days Course)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Destination Country & Visa Package *
                  </label>
                  <select
                    value={formData.destination_country}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  >
                    <option value="Not decided yet">Not decided yet (Course Only)</option>
                    {availableCountryCosts.map((c) => (
                      <option key={c._id} value={c.country}>
                        {c.country} ({c.contract_years} yr contract - Visa: {formatBDT(c.total)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 uppercase">
                      Training Batch *
                    </label>
                    <button
                      type="button"
                      onClick={openQuickBatchModal}
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add New Batch</span>
                    </button>
                  </div>

                  {tradeBatches.length > 0 ? (
                    <div className="space-y-1">
                      <select
                        required
                        value={formData.batch}
                        onChange={(e) => setFormData({ ...formData, batch: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-bold focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        {tradeBatches.map((b) => (
                          <option key={b._id} value={b.batch_code}>
                            {b.batch_code} — {b.name} ({formatDate(b.start_date)} to {formatDate(b.end_date)})
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-500">
                        Dynamic batch selection for {formData.trade_name || 'selected trade'}.
                      </p>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 flex items-center justify-between gap-2">
                      <span className="text-xs text-amber-800 font-medium">
                        No batch for this trade yet.
                      </span>
                      <button
                        type="button"
                        onClick={openQuickBatchModal}
                        className="px-2.5 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs transition-colors shrink-0"
                      >
                        + Create Batch
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Shift / Session *
                  </label>
                  <select
                    value={formData.session}
                    onChange={(e) => setFormData({ ...formData, session: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Morning">Morning (09:00 AM - 01:00 PM)</option>
                    <option value="Evening">Evening (02:00 PM - 06:00 PM)</option>
                    <option value="Full Day">Full Day Intensive</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Admission Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.admission_date}
                    onChange={(e) => setFormData({ ...formData, admission_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* CARD 2: PASSPORT PARTICULARS & EXPIRY CHECK (SECOND PRIORITY) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-slate-900 text-base">2. Passport Particulars & Validity</h3>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                  Step 2
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Passport Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.passport_no}
                    onChange={(e) =>
                      setFormData({ ...formData, passport_no: e.target.value.toUpperCase() })
                    }
                    placeholder="e.g. A01234567"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Issue Date
                  </label>
                  <input
                    type="date"
                    value={formData.passport_issue_date}
                    onChange={(e) =>
                      setFormData({ ...formData, passport_issue_date: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={formData.passport_expiry_date}
                    onChange={(e) =>
                      setFormData({ ...formData, passport_expiry_date: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Optional Passport Copy Upload */}
              <div className="p-3.5 bg-slate-50/80 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase">
                    Passport Copy / Scan Upload (Optional)
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Image or PDF — automatically marks Passport Copy as received in candidate checklist.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {formData.passport_doc_url ? (
                    <>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-xs font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Uploaded
                      </span>
                      <a
                        href={formData.passport_doc_url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md"
                      >
                        View
                      </a>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, passport_doc_url: '' })}
                        className="px-2 py-1 text-xs font-medium text-rose-600 hover:underline"
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 shadow-xs transition-colors">
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                      <span>{uploadingPassport ? 'Uploading...' : 'Upload Passport Copy'}</span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={handlePassportUpload}
                        disabled={uploadingPassport}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Passport Expiry Check Preview Alert (PRD Section 5.7) */}
              {formData.passport_expiry_date && (
                <div>
                  {(() => {
                    const expiry = new Date(formData.passport_expiry_date);
                    const now = new Date();
                    const sixMonthsAhead = new Date();
                    sixMonthsAhead.setMonth(now.getMonth() + 6);

                    if (expiry < now) {
                      return (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-700 text-xs">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>This passport has already EXPIRED. Must be renewed for overseas visa processing.</span>
                        </div>
                      );
                    } else if (expiry <= sixMonthsAhead) {
                      return (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-800 text-xs">
                          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                          <span>
                            Passport expires within 6 months ({formatDate(formData.passport_expiry_date)}). Renewal required prior to visa stamping.
                          </span>
                        </div>
                      );
                    } else {
                      return (
                        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-800 text-xs">
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                          <span>Passport validity is valid ({formatDate(formData.passport_expiry_date)}).</span>
                        </div>
                      );
                    }
                  })()}
                </div>
              )}
            </div>

            {/* CARD 3: CANDIDATE IDENTITY & PHOTO (THIRD PRIORITY) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-slate-900 text-base">3. Candidate Identity & Profile</h3>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                  Step 3
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Full Name (As in Passport) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. MOHAMMED RAHIM UDDIN"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Father&apos;s Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.father_name}
                    onChange={(e) => setFormData({ ...formData, father_name: e.target.value })}
                    placeholder="Father full name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Mother&apos;s Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.mother_name}
                    onChange={(e) => setFormData({ ...formData, mother_name: e.target.value })}
                    placeholder="Mother full name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date_of_birth}
                    onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Gender *
                  </label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Blood Group
                  </label>
                  <select
                    value={formData.blood_group}
                    onChange={(e) => setFormData({ ...formData, blood_group: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Unknown">Select / Unknown</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    NID / Birth Certificate No *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nid_or_birth_cert}
                    onChange={(e) => setFormData({ ...formData, nid_or_birth_cert: e.target.value })}
                    placeholder="10, 13 or 17 digit NID number"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Religion
                  </label>
                  <select
                    value={formData.religion}
                    onChange={(e) => setFormData({ ...formData, religion: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Islam">Islam</option>
                    <option value="Hinduism">Hinduism</option>
                    <option value="Christianity">Christianity</option>
                    <option value="Buddhism">Buddhism</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Marital Status
                  </label>
                  <select
                    value={formData.marital_status}
                    onChange={(e) => setFormData({ ...formData, marital_status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Widowed">Widowed</option>
                  </select>
                </div>

                {/* Photo upload */}
                <div className="sm:col-span-2 pt-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Candidate Photo (Optional)
                  </label>
                  <div className="flex items-center gap-4">
                    {formData.photo_url ? (
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={formData.photo_url}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                        <Upload className="w-5 h-5" />
                      </div>
                    )}
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <span>{uploadingPhoto ? 'Uploading...' : 'Choose Photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                        disabled={uploadingPhoto}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* CARD 4: CONTACT & ADDRESS DETAILS */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Phone className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-slate-900 text-base">4. Contact & Address Details</h3>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                  Step 4
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Mobile Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    placeholder="017XXXXXXXX"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="candidate@example.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Emergency Contact Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.emergency_contact_name}
                    onChange={(e) =>
                      setFormData({ ...formData, emergency_contact_name: e.target.value })
                    }
                    placeholder="Relative name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Relation & Phone *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      value={formData.emergency_contact_relation}
                      onChange={(e) =>
                        setFormData({ ...formData, emergency_contact_relation: e.target.value })
                      }
                      placeholder="Relation (e.g. Brother)"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      required
                      value={formData.emergency_contact_phone}
                      onChange={(e) =>
                        setFormData({ ...formData, emergency_contact_phone: e.target.value })
                      }
                      placeholder="Phone"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <AddressSelector
                    label="Present Address *"
                    value={presentAddrObj}
                    onChange={(next, composed) => {
                      setPresentAddrObj(next);
                      setFormData((prev) => ({ ...prev, present_address: composed }));
                    }}
                  />
                </div>

                <div className="sm:col-span-2">
                  <AddressSelector
                    label="Permanent Address *"
                    value={permanentAddrObj}
                    onChange={(next, composed) => {
                      setPermanentAddrObj(next);
                      setFormData((prev) => ({ ...prev, permanent_address: composed }));
                    }}
                    headerRight={
                      <button
                        type="button"
                        onClick={() => {
                          const copied = { ...presentAddrObj };
                          setPermanentAddrObj(copied);
                          setFormData((prev) => ({
                            ...prev,
                            permanent_address: composeAddressString(copied),
                          }));
                        }}
                        className="text-xs text-blue-600 hover:underline font-medium"
                      >
                        Same as present address
                      </button>
                    }
                  />
                </div>
              </div>
            </div>

            {/* CARD 5: PREVIOUS OVERSEAS WORK EXPERIENCE (OPTIONAL) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Plane className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-slate-900 text-base">
                    5. Prior Overseas Experience (Optional)
                  </h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                    Step 5
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="has_previous"
                      checked={formData.has_previous_overseas_work}
                      onChange={(e) =>
                        setFormData({ ...formData, has_previous_overseas_work: e.target.checked })
                      }
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    />
                    <label htmlFor="has_previous" className="text-xs font-medium text-slate-700">
                      Worked Abroad Previously
                    </label>
                  </div>
                </div>
              </div>

              {formData.has_previous_overseas_work && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Country
                    </label>
                    <input
                      type="text"
                      value={formData.overseas_country}
                      onChange={(e) => setFormData({ ...formData, overseas_country: e.target.value })}
                      placeholder="e.g. Saudi Arabia"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      From Year - To Year
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        placeholder="2018"
                        value={formData.overseas_from_year}
                        onChange={(e) =>
                          setFormData({ ...formData, overseas_from_year: e.target.value })
                        }
                        className="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                      />
                      <input
                        type="number"
                        placeholder="2022"
                        value={formData.overseas_to_year}
                        onChange={(e) =>
                          setFormData({ ...formData, overseas_to_year: e.target.value })
                        }
                        className="w-full px-2 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Trade Worked
                    </label>
                    <input
                      type="text"
                      value={formData.overseas_trade}
                      onChange={(e) => setFormData({ ...formData, overseas_trade: e.target.value })}
                      placeholder="e.g. Pipe Welder"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Previous Passport No
                    </label>
                    <input
                      type="text"
                      value={formData.overseas_passport_no}
                      onChange={(e) =>
                        setFormData({ ...formData, overseas_passport_no: e.target.value })
                      }
                      placeholder="Old passport if any"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Visa Type & Number
                    </label>
                    <input
                      type="text"
                      value={formData.overseas_visa_no}
                      onChange={(e) => setFormData({ ...formData, overseas_visa_no: e.target.value })}
                      placeholder="e.g. Work Permit #12345"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Reason for Returning
                    </label>
                    <input
                      type="text"
                      value={formData.overseas_reason_for_return}
                      onChange={(e) =>
                        setFormData({ ...formData, overseas_reason_for_return: e.target.value })
                      }
                      placeholder="e.g. Contract Completed"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Dynamic Fee Preview & First Payment (Span 1) */}
          <div className="space-y-6">
            {/* CARD 6: LIVE FEE BREAKDOWN PREVIEW */}
            <div className="bg-slate-900 text-white rounded-xl shadow-lg p-6 space-y-5 sticky top-20">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-blue-400" />
                  <h3 className="font-semibold text-white text-base">6. Fee Breakdown & Ledger</h3>
                </div>
                <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full font-mono">
                  Live Snapshot
                </span>
              </div>

              {/* Price Items Breakdown */}
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between items-center text-slate-300">
                  <span>Admission Fee</span>
                  <span className="font-medium font-mono text-white">
                    {formatBDT(formData.admission_fee)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-slate-300">
                  <span>Course Tuition Fee</span>
                  <span className="font-medium font-mono text-white">
                    {formatBDT(formData.course_fee)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-slate-300">
                  <span>Visa Processing Cost</span>
                  <span className="font-medium font-mono text-white">
                    {formatBDT(formData.visa_cost)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-slate-300">
                  <span>Government Fee</span>
                  <span className="font-medium font-mono text-white">
                    {formatBDT(formData.govt_fee)}
                  </span>
                </div>

                {/* Special Discount */}
                <div className="pt-2 border-t border-slate-800">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-400">Special Discount (BDT)</span>
                    <input
                      type="number"
                      min={0}
                      value={formData.discount}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          discount: Math.max(0, Number(e.target.value)),
                        })
                      }
                      className="w-28 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-right font-mono text-emerald-400 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Total Payable Summary */}
                <div className="pt-3 border-t-2 border-slate-700 flex justify-between items-baseline">
                  <span className="text-sm font-bold uppercase tracking-wider text-slate-300">
                    Total Payable:
                  </span>
                  <span className="text-2xl font-black text-amber-400 font-mono">
                    {formatBDT(totalPayable)}
                  </span>
                </div>
              </div>

              {/* FIRST PAYMENT INPUTS */}
              <div className="pt-4 border-t border-slate-800 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400">
                  First Payment Recording
                </h4>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Amount Paid Now (BDT) *</label>
                  <input
                    type="number"
                    min={0}
                    max={totalPayable}
                    value={formData.paid_now}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        paid_now: Math.min(totalPayable, Math.max(0, Number(e.target.value))),
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Method *</label>
                    <select
                      value={formData.payment_method}
                      onChange={(e) =>
                        setFormData({ ...formData, payment_method: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    <label className="block text-xs text-slate-400 mb-1">Reference / Trx ID</label>
                    <input
                      type="text"
                      value={formData.payment_reference}
                      onChange={(e) =>
                        setFormData({ ...formData, payment_reference: e.target.value })
                      }
                      placeholder="Trx or cheque #"
                      className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Remaining & Installment schedule preview */}
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Remaining Balance:</span>
                    <span className="font-bold font-mono text-rose-400 text-sm">
                      {formatBDT(remainingBalance)}
                    </span>
                  </div>

                  {remainingBalance > 0 && (
                    <>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Installments:</span>
                        <select
                          value={formData.installment_count}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              installment_count: Number(e.target.value),
                            })
                          }
                          className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                        >
                          {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                            <option key={n} value={n}>
                              {n} Monthly Installment{n > 1 ? 's' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Small schedule preview */}
                      <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 space-y-1.5 text-[11px] font-mono">
                        <p className="text-slate-400 text-[10px] font-sans uppercase font-bold">
                          Monthly Installment Schedule
                        </p>
                        {installmentPreview.slice(0, 4).map((inst) => (
                          <div key={inst.number} className="flex justify-between text-slate-300">
                            <span>
                              Inst #{inst.number} ({inst.dueDate}):
                            </span>
                            <span className="font-bold text-white">{formatBDT(inst.amount)}</span>
                          </div>
                        ))}
                        {installmentPreview.length > 4 && (
                          <p className="text-[10px] text-slate-500 italic">
                            + {installmentPreview.length - 4} more installments...
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Submit Admission Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm uppercase tracking-wider"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{isSubmitting ? 'Processing Admission...' : 'Confirm Admission'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* SUCCESS MODAL WITH PRINTABLE MONEY RECEIPT */}
      {successReceipt && (
        <Modal
          isOpen={true}
          onClose={() => router.push(`/students/${createdStudent?._id}`)}
          title="Admission Confirmed & First Money Receipt"
          description={`Student ID: ${createdStudent?.student_no} admitted successfully.`}
          maxWidth="4xl"
        >
          <MoneyReceipt
            receipt={successReceipt}
            onClose={() => router.push(`/students/${createdStudent?._id}`)}
          />
        </Modal>
      )}

      {/* QUICK CREATE BATCH MODAL */}
      <Modal
        isOpen={isQuickBatchModalOpen}
        onClose={() => setIsQuickBatchModalOpen(false)}
        title={`Quick Create Batch for ${formData.trade_name || 'Trade'}`}
        description="Establish a new training batch schedule without leaving the admission desk."
        maxWidth="md"
      >
        <form onSubmit={handleQuickBatchSubmit} className="space-y-4">
          {quickBatchError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{quickBatchError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Batch Code *
            </label>
            <input
              type="text"
              required
              value={quickBatchForm.batch_code}
              onChange={(e) =>
                setQuickBatchForm({ ...quickBatchForm, batch_code: e.target.value.toUpperCase() })
              }
              placeholder="e.g. PW-2026-02"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Batch Title / Name *
            </label>
            <input
              type="text"
              required
              value={quickBatchForm.name}
              onChange={(e) => setQuickBatchForm({ ...quickBatchForm, name: e.target.value })}
              placeholder="e.g. Pipe Welder Morning Batch 02"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Start Date *
              </label>
              <input
                type="date"
                required
                value={quickBatchForm.start_date}
                onChange={(e) =>
                  setQuickBatchForm({ ...quickBatchForm, start_date: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                End Date *
              </label>
              <input
                type="date"
                required
                value={quickBatchForm.end_date}
                onChange={(e) =>
                  setQuickBatchForm({ ...quickBatchForm, end_date: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Trainer / Instructor
              </label>
              <input
                type="text"
                value={quickBatchForm.instructor}
                onChange={(e) =>
                  setQuickBatchForm({ ...quickBatchForm, instructor: e.target.value })
                }
                placeholder="Trainer name"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Capacity
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={quickBatchForm.capacity}
                onChange={(e) =>
                  setQuickBatchForm({ ...quickBatchForm, capacity: e.target.value })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsQuickBatchModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreatingBatch}
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              {isCreatingBatch ? 'Creating...' : 'Create & Select Batch'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

