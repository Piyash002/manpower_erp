'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CreditCard,
  Search,
  RefreshCw,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  DollarSign,
  User,
  ArrowRight,
  Filter,
  Check,
  Printer,
  Sparkles,
  Download,
  FileSpreadsheet,
  ChevronDown,
} from 'lucide-react';
import { formatBDT, formatDate } from '@/lib/formatters';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

interface InstallmentItem {
  _id: string;
  student: {
    _id: string;
    name: string;
    student_no: string;
    mobile: string;
    passport_no: string;
    trade_name: string;
    destination_country: string;
    total_paid: number;
    total_due: number;
    status: string;
  };
  installment_no: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  remaining_due: number;
  paid_on?: string | null;
  status: 'Paid' | 'Partial' | 'Pending' | 'Overdue';
  isOverdue: boolean;
  isDueThisMonth: boolean;
}

interface StatsData {
  totalOutstandingDue: number;
  overdueCount: number;
  overdueAmount: number;
  dueThisMonthCount: number;
  dueThisMonthAmount: number;
  paidCount: number;
  paidAmount: number;
  totalInstallments: number;
}

function InstallmentCollectionContent() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams?.get('status');

  const [installments, setInstallments] = useState<InstallmentItem[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'overdue' | 'due_this_month' | 'unpaid' | 'paid'>(
    initialStatus === 'overdue' ? 'overdue' : 'all'
  );

  // Collect Payment Modal state
  const [selectedItem, setSelectedItem] = useState<InstallmentItem | null>(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'bKash' | 'Nagad' | 'Bank Transfer' | 'Cheque'>('Cash');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [nextDueDate, setNextDueDate] = useState<string>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payError, setPayError] = useState('');

  // Success Receipt Modal state
  const [receiptSuccess, setReceiptSuccess] = useState<{
    receiptNo: string;
    amount: number;
    studentName: string;
    studentNo: string;
  } | null>(null);

  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleExportInstallmentsCSV = () => {
    if (installments.length === 0) return;
    const headers = [
      'Installment No',
      'Student Roll',
      'Candidate Name',
      'Mobile',
      'Passport No',
      'Trade',
      'Destination Country',
      'Due Date',
      'Installment Amount (BDT)',
      'Paid Amount (BDT)',
      'Remaining Due (BDT)',
      'Status',
    ];

    const rows = installments.map((item) => [
      `"Inst #${item.installment_no}"`,
      `"${item.student?.student_no || ''}"`,
      `"${item.student?.name || ''}"`,
      `"${item.student?.mobile || ''}"`,
      `"${item.student?.passport_no || ''}"`,
      `"${item.student?.trade_name || ''}"`,
      `"${item.student?.destination_country || ''}"`,
      `"${formatDate(item.due_date)}"`,
      item.amount || 0,
      item.paid_amount || 0,
      item.remaining_due || 0,
      `"${item.isOverdue ? 'OVERDUE' : item.status.toUpperCase()}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Installments_Report_${activeTab}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const fetchInstallments = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);

      if (activeTab === 'overdue') {
        params.append('status', 'overdue');
      } else if (activeTab === 'due_this_month') {
        params.append('timeframe', 'due_this_month');
      } else if (activeTab === 'unpaid') {
        params.append('status', 'unpaid');
      } else if (activeTab === 'paid') {
        params.append('status', 'paid');
      }

      const res = await fetch(`/api/installments?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to load installment data');
      }

      setInstallments(data.installments || []);
      setStats(data.stats || null);
    } catch (err: any) {
      setError(err.message || 'Could not fetch installments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchInstallments();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, activeTab]);

  const openPaymentModal = (item: InstallmentItem) => {
    setSelectedItem(item);
    setPaymentAmount(item.remaining_due.toString());
    setPaymentMethod('Cash');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentRef('');
    setPaymentNote(`Installment #${item.installment_no} Collection`);
    setNextDueDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setPayError('');
    setIsPayModalOpen(true);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    setPayError('');
    const amt = Math.round(Number(paymentAmount));
    if (!amt || amt <= 0) {
      setPayError('Please enter a valid payment amount greater than 0');
      return;
    }

    if (amt > selectedItem.student.total_due) {
      setPayError(
        `Amount exceeds the student's total remaining due of ${formatBDT(selectedItem.student.total_due)}`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: selectedItem.student._id,
          amount: amt,
          method: paymentMethod,
          reference: paymentRef,
          payment_date: paymentDate,
          note: paymentNote,
          next_due_date: nextDueDate,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Payment collection failed');
      }

      setIsPayModalOpen(false);
      setReceiptSuccess({
        receiptNo: data.payment.receipt_no,
        amount: amt,
        studentName: selectedItem.student.name,
        studentNo: selectedItem.student.student_no,
      });

      fetchInstallments();
    } catch (err: any) {
      setPayError(err.message || 'Payment processing error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDueBadge = (item: InstallmentItem) => {
    if (item.status === 'Paid') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          Paid
        </span>
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(item.due_date);
    due.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const absDays = Math.abs(diffDays);
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
          <AlertTriangle className="w-3 h-3 text-rose-600" />
          Overdue by {absDays} day{absDays > 1 ? 's' : ''}
        </span>
      );
    } else if (diffDays === 0) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 animate-pulse">
          <Clock className="w-3 h-3 text-amber-700" />
          Due Today
        </span>
      );
    } else if (diffDays <= 7) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
          <Clock className="w-3 h-3 text-amber-600" />
          Due in {diffDays} day{diffDays > 1 ? 's' : ''}
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
          <Calendar className="w-3 h-3 text-slate-500" />
          Due on {formatDate(item.due_date)}
        </span>
      );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Paid':
        return <Badge variant="success">Paid</Badge>;
      case 'Overdue':
        return <Badge variant="danger">Overdue</Badge>;
      case 'Partial':
        return <Badge variant="info">Partial</Badge>;
      case 'Pending':
      default:
        return <Badge variant="gray">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Installment Collection & Dues
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-md">
              Accounts Desk
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Track student payment schedules, collect upcoming & overdue installments, and issue instant money receipts.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Export CSV Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-xs transition-colors"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span>Export CSV</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-60 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 z-40 text-xs animate-in fade-in zoom-in-95 space-y-1">
                <button
                  onClick={handleExportInstallmentsCSV}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2 text-slate-700 font-medium"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <div>
                    <span className="block font-semibold">Installments Schedule CSV</span>
                    <span className="block text-[10px] text-slate-400">Current tab filter export</span>
                  </div>
                </button>

                <a
                  href="/api/reports/payments?reportType=transactions&format=csv"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setShowExportMenu(false)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2 text-slate-700 font-medium"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <div>
                    <span className="block font-semibold">All Payments & Receipts CSV</span>
                    <span className="block text-[10px] text-slate-400">Complete transaction history</span>
                  </div>
                </a>

                <a
                  href="/api/reports/payments?reportType=trade_batch_summary&format=csv"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setShowExportMenu(false)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2 text-slate-700 font-medium"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <div>
                    <span className="block font-semibold">Trade & Batch Summary CSV</span>
                    <span className="block text-[10px] text-slate-400">Collections per trade/batch</span>
                  </div>
                </a>
              </div>
            )}
          </div>

          <button
            onClick={fetchInstallments}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-xs transition-colors"
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Outstanding Due */}
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Outstanding Due
            </span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatBDT(stats?.totalOutstandingDue || 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Across all candidate installment plans
          </p>
        </div>

        {/* Overdue Installments */}
        <div className="p-4 bg-white rounded-xl border border-rose-200 shadow-xs bg-rose-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider">
              Overdue Installments
            </span>
            <div className="p-2 bg-rose-100 text-rose-700 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-rose-700">
            {stats?.overdueCount || 0}
            <span className="text-sm font-normal text-rose-600 ml-2">
              ({formatBDT(stats?.overdueAmount || 0)})
            </span>
          </p>
          <p className="mt-1 text-xs text-rose-600">Past agreed payment deadline</p>
        </div>

        {/* Due This Month */}
        <div className="p-4 bg-white rounded-xl border border-amber-200 shadow-xs bg-amber-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
              Due This Month
            </span>
            <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-900">
            {stats?.dueThisMonthCount || 0}
            <span className="text-sm font-normal text-amber-700 ml-2">
              ({formatBDT(stats?.dueThisMonthAmount || 0)})
            </span>
          </p>
          <p className="mt-1 text-xs text-amber-700">Scheduled in current month</p>
        </div>

        {/* Total Collected */}
        <div className="p-4 bg-white rounded-xl border border-emerald-200 shadow-xs bg-emerald-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
              Paid / Cleared
            </span>
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-900">
            {stats?.paidCount || 0}
            <span className="text-sm font-normal text-emerald-700 ml-2">
              ({formatBDT(stats?.paidAmount || 0)})
            </span>
          </p>
          <p className="mt-1 text-xs text-emerald-700">Cleared installment vouchers</p>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-medium text-slate-600">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                activeTab === 'all'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              All Installments
            </button>
            <button
              onClick={() => setActiveTab('overdue')}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md transition-all ${
                activeTab === 'overdue'
                  ? 'bg-rose-600 text-white font-semibold shadow-xs'
                  : 'text-rose-700 hover:bg-rose-100/70'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Overdue ({stats?.overdueCount || 0})
            </button>
            <button
              onClick={() => setActiveTab('due_this_month')}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md transition-all ${
                activeTab === 'due_this_month'
                  ? 'bg-amber-600 text-white font-semibold shadow-xs'
                  : 'text-amber-800 hover:bg-amber-100/70'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Due This Month ({stats?.dueThisMonthCount || 0})
            </button>
            <button
              onClick={() => setActiveTab('unpaid')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                activeTab === 'unpaid'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              Unpaid / Partial
            </button>
            <button
              onClick={() => setActiveTab('paid')}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md transition-all ${
                activeTab === 'paid'
                  ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                  : 'text-emerald-700 hover:bg-emerald-100/70'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              Paid ({stats?.paidCount || 0})
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative min-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search candidate, ID, phone, passport..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs md:text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
            />
          </div>
        </div>
      </div>

      {/* Installments Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">Loading installment data...</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center text-rose-600">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
            <p className="font-semibold">{error}</p>
          </div>
        ) : installments.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
              <CreditCard className="w-6 h-6" />
            </div>
            <p className="font-semibold text-slate-700 text-base">No installments found</p>
            <p className="text-xs text-slate-400 mt-1">
              {search
                ? `No match found for query "${search}"`
                : 'There are no installments matching this filter.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3.5">Student / Candidate</th>
                  <th className="px-4 py-3.5">Trade & Country</th>
                  <th className="px-4 py-3.5">Installment #</th>
                  <th className="px-4 py-3.5">Due Date & Timeline</th>
                  <th className="px-4 py-3.5 text-right">Inst. Amount</th>
                  <th className="px-4 py-3.5 text-right">Remaining Due</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {installments.map((item) => {
                  const student = item.student;
                  return (
                    <tr
                      key={item._id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        item.isOverdue ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      {/* Candidate Column */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700 shrink-0">
                            {student.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/students/${student._id}`}
                                className="font-semibold text-slate-900 hover:text-emerald-700 transition-colors"
                              >
                                {student.name}
                              </Link>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                              <span className="font-mono bg-slate-100 px-1.5 py-0.2 rounded text-[11px] text-slate-700">
                                {student.student_no}
                              </span>
                              <span>•</span>
                              <span>{student.mobile}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Trade & Country */}
                      <td className="px-4 py-3.5">
                        <div className="text-xs font-medium text-slate-800">
                          {student.trade_name}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {student.destination_country}
                        </div>
                      </td>

                      {/* Installment Number */}
                      <td className="px-4 py-3.5">
                        <span className="font-semibold text-slate-700">
                          Installment #{item.installment_no}
                        </span>
                      </td>

                      {/* Due Date & Timeline Badge */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="font-medium text-slate-800">
                            {formatDate(item.due_date)}
                          </span>
                          {getDueBadge(item)}
                        </div>
                      </td>

                      {/* Installment Amount */}
                      <td className="px-4 py-3.5 text-right font-medium text-slate-700">
                        {formatBDT(item.amount)}
                        {item.paid_amount > 0 && (
                          <div className="text-xs text-emerald-600">
                            Paid: {formatBDT(item.paid_amount)}
                          </div>
                        )}
                      </td>

                      {/* Remaining Due */}
                      <td className="px-4 py-3.5 text-right">
                        <span
                          className={`font-bold text-base ${
                            item.remaining_due > 0 ? 'text-rose-700' : 'text-slate-400'
                          }`}
                        >
                          {formatBDT(item.remaining_due)}
                        </span>
                        {item.remaining_due > 0 && student.total_due > item.remaining_due && (
                          <div className="text-[11px] text-slate-400">
                            Total Due: {formatBDT(student.total_due)}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 text-center">
                        {getStatusBadge(item.status)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {item.remaining_due > 0 ? (
                            <button
                              onClick={() => openPaymentModal(item)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-xs transition-colors"
                              title="Collect payment for this installment"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              Collect Payment
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 py-1.5 px-2 bg-emerald-50 rounded-lg">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Cleared
                            </span>
                          )}

                          <Link
                            href={`/students/${student._id}`}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                            title="View candidate full profile"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* COLLECT PAYMENT MODAL */}
      <Modal
        isOpen={isPayModalOpen}
        onClose={() => setIsPayModalOpen(false)}
        title="Collect Installment Payment"
        description="Record cash/bank/mobile payment and issue a Money Receipt voucher"
        maxWidth="lg"
      >
        {selectedItem && (
          <form onSubmit={handlePaymentSubmit} className="space-y-4">
            {/* Student & Installment Summary Banner */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-base">
                    {selectedItem.student.name}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">
                    ID: {selectedItem.student.student_no} • {selectedItem.student.mobile}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    {selectedItem.student.trade_name} → {selectedItem.student.destination_country}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-slate-500 uppercase">
                    Inst. #{selectedItem.installment_no} Due
                  </span>
                  <p className="text-lg font-extrabold text-rose-700">
                    {formatBDT(selectedItem.remaining_due)}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Student Total Due: {formatBDT(selectedItem.student.total_due)}
                  </p>
                </div>
              </div>
            </div>

            {payError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{payError}</span>
              </div>
            )}

            {/* Payment Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Collection Amount (BDT) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">
                    ৳
                  </span>
                  <input
                    type="number"
                    min="1"
                    max={selectedItem.student.total_due}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    required
                    className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    placeholder="Enter amount"
                  />
                </div>
                <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(selectedItem.remaining_due.toString())}
                    className="text-emerald-700 font-semibold hover:underline"
                  >
                    Set Installment Due ({formatBDT(selectedItem.remaining_due)})
                  </button>
                  {selectedItem.student.total_due > selectedItem.remaining_due && (
                    <button
                      type="button"
                      onClick={() => setPaymentAmount(selectedItem.student.total_due.toString())}
                      className="text-blue-700 font-semibold hover:underline"
                    >
                      Pay Full Due ({formatBDT(selectedItem.student.total_due)})
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Method *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e: any) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Cash">Cash (কাউন্টার ক্যাশ)</option>
                  <option value="bKash">bKash (বিকাশ)</option>
                  <option value="Nagad">Nagad (নগদ)</option>
                  <option value="Bank Transfer">Bank Transfer (ব্যাংক ট্রান্সফার)</option>
                  <option value="Cheque">Cheque (চেক)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Collection Date *
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reference / TrxID / Cheque #
                </label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="e.g. TRX992138 or Bank Cheque #123"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Note / Remarks
              </label>
              <input
                type="text"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="Optional payment comments"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Next Due Date Section (বকেয়া থাকলে পরবর্তী কিস্তির তারিখ নির্ধারণ) */}
            {selectedItem && (Number(paymentAmount) < selectedItem.student.total_due) && (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-amber-900 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-700" />
                    <span>Next Due Date (পরবর্তী কিস্তির তারিখ)</span>
                  </label>
                  <span className="text-[11px] text-amber-700 font-mono font-bold">
                    Remaining Due: {formatBDT(selectedItem.student.total_due - (Number(paymentAmount) || 0))}
                  </span>
                </div>
                <input
                  type="date"
                  value={nextDueDate}
                  onChange={(e) => setNextDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-slate-900 font-bold focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-[10px] text-amber-800">
                  এই পেমেন্টের পর প্রার্থীর অবশিষ্ট বকেয়া পরিশোধের নির্ধারিত তারিখ সেট করুন।
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsPayModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Recording Payment...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-3.5 h-3.5" />
                    Confirm & Issue Money Receipt
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* SUCCESS CONFIRMATION MODAL WITH RECEIPT LINK */}
      <Modal
        isOpen={!!receiptSuccess}
        onClose={() => setReceiptSuccess(null)}
        title="Payment Collected Successfully!"
        maxWidth="md"
      >
        {receiptSuccess && (
          <div className="text-center py-4 space-y-4">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-slate-900">
                {formatBDT(receiptSuccess.amount)} Collected
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                From candidate <strong className="text-slate-900">{receiptSuccess.studentName}</strong> (
                <span className="font-mono text-slate-700">{receiptSuccess.studentNo}</span>)
              </p>
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg">
                <span className="text-xs text-slate-500 font-semibold">Receipt Number:</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {receiptSuccess.receiptNo}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              The installment schedule and candidate ledger have been updated automatically.
            </p>

            <div className="flex items-center justify-center gap-3 pt-3">
              <Link
                href={`/receipts/${receiptSuccess.receiptNo}`}
                target="_blank"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
              >
                <Printer className="w-4 h-4" />
                Print / View Money Receipt
                <ExternalLink className="w-3 h-3 opacity-70" />
              </Link>
              <button
                type="button"
                onClick={() => setReceiptSuccess(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function InstallmentCollection() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">Loading installment collections...</p>
        </div>
      }
    >
      <InstallmentCollectionContent />
    </Suspense>
  );
}
