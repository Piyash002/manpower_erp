'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Users,
  CalendarCheck,
  TrendingUp,
  CreditCard,
  AlertOctagon,
  Clock,
  UserPlus,
  ArrowRight,
  ShieldCheck,
  Building2,
  FileText,
  Calendar,
  Download,
  ChevronDown,
  Sparkles,
  Banknote,
  GraduationCap,
  Layers,
  Printer,
  FileSpreadsheet,
  Filter,
  Search,
  X,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Eye,
  ExternalLink,
} from 'lucide-react';
import { formatBDT, formatDate } from '@/lib/formatters';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { useAuth } from '@/components/layout/DashboardLayout';

export function DashboardOverview() {
  const { user } = useAuth();
  const [stats, setStats] = useState<any | null>(null);
  const [candidateDues, setCandidateDues] = useState<any[]>([]);
  const [categoryDistribution, setCategoryDistribution] = useState<any[]>([]);
  const [monthlyAdmissions, setMonthlyAdmissions] = useState<any[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [availableTrades, setAvailableTrades] = useState<string[]>([]);
  const [availableBatches, setAvailableBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [selectedTrade, setSelectedTrade] = useState('all');
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [timeframe, setTimeframe] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(true);

  // Fetch Dashboard Stats with Active Filters
  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedTrade !== 'all') params.append('trade', selectedTrade);
      if (selectedBatch !== 'all') params.append('batch', selectedBatch);
      if (selectedStatus !== 'all') params.append('status', selectedStatus);
      if (searchTerm.trim()) params.append('search', searchTerm.trim());

      // Compute timeframe dates
      const now = new Date();
      if (timeframe === 'this_month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        params.append('startDate', start.toISOString());
      } else if (timeframe === 'last_30_days') {
        const start = new Date();
        start.setDate(now.getDate() - 30);
        params.append('startDate', start.toISOString());
      } else if (timeframe === 'this_year') {
        const start = new Date(now.getFullYear(), 0, 1);
        params.append('startDate', start.toISOString());
      }

      const res = await fetch(`/api/dashboard/stats?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setCandidateDues(data.candidateDuesSummary || []);
        setCategoryDistribution(data.categoryDistribution || []);
        setMonthlyAdmissions(data.monthlyAdmissions || []);
        setRecentActivities(data.recentActivities || []);
        if (data.availableTrades) setAvailableTrades(data.availableTrades);
        if (data.availableBatches) setAvailableBatches(data.availableBatches);
      }
    } catch (err) {
      console.error('Failed to load filtered dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [selectedTrade, selectedBatch, selectedStatus, timeframe]);

  // Debounced Search Handler
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDashboardData();
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const canAdmit = user?.role === 'Admin' || user?.role === 'Counselor';

  // Export to CSV Function
  const handleExportCSV = () => {
    if (candidateDues.length === 0) return;
    const headers = [
      'Roll Number',
      'Candidate Name',
      'Mobile',
      'Passport No',
      'Trade',
      'Batch',
      'Total Fee (BDT)',
      'Total Paid (BDT)',
      'Due Balance (BDT)',
      'Next Due Date',
      'Next Due Amount (BDT)',
      'Status',
    ];

    const rows = candidateDues.map((c) => [
      `"${c.student_no}"`,
      `"${c.name}"`,
      `"${c.mobile || ''}"`,
      `"${c.passport_no || ''}"`,
      `"${c.trade_name || ''}"`,
      `"${c.batch || ''}"`,
      c.total_fee || 0,
      c.total_paid || 0,
      c.total_due || 0,
      c.nextInstallment ? `"${formatDate(c.nextInstallment.due_date)}"` : 'N/A',
      c.nextInstallment ? c.nextInstallment.remaining : 0,
      `"${c.hasOverdue ? 'OVERDUE' : c.total_due > 0 ? 'DUE PENDING' : 'FULLY PAID'}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Candidate_Installment_Dues_Report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  // Download Monthly Payment Transactions Report (CSV) via API
  const handleDownloadMonthlyPaymentsCSV = () => {
    const params = new URLSearchParams({
      reportType: 'transactions',
      format: 'csv',
    });
    if (selectedTrade !== 'all') params.append('trade', selectedTrade);
    if (selectedBatch !== 'all') params.append('batch', selectedBatch);
    if (timeframe === 'this_month') {
      const now = new Date();
      params.append('month', String(now.getMonth() + 1));
      params.append('year', String(now.getFullYear()));
    } else if (timeframe === 'this_year') {
      params.append('year', '2026');
    }
    window.open(`/api/reports/payments?${params.toString()}`, '_blank');
    setShowExportMenu(false);
  };

  // Download Trade & Batch-wise Financial Collection Summary (CSV) via API
  const handleDownloadTradeBatchSummaryCSV = () => {
    const params = new URLSearchParams({
      reportType: 'trade_batch_summary',
      format: 'csv',
    });
    if (selectedTrade !== 'all') params.append('trade', selectedTrade);
    if (selectedBatch !== 'all') params.append('batch', selectedBatch);
    window.open(`/api/reports/payments?${params.toString()}`, '_blank');
    setShowExportMenu(false);
  };

  const resetFilters = () => {
    setSelectedTrade('all');
    setSelectedBatch('all');
    setSelectedStatus('all');
    setTimeframe('all');
    setSearchTerm('');
  };

  const hasActiveFilters =
    selectedTrade !== 'all' ||
    selectedBatch !== 'all' ||
    selectedStatus !== 'all' ||
    timeframe !== 'all' ||
    searchTerm.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* Top Header: Title, Action Tools and New Admission CTA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-sans">
            Student Admission & Operations Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Filter candidate admissions, batch training schedules, and installment due balances
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {/* Filter Toggle Button */}
          <button
            onClick={() => setShowFiltersPanel(!showFiltersPanel)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-colors border ${
              showFiltersPanel
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters</span>
            {hasActiveFilters && (
              <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
            )}
          </button>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 shadow-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>Export</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 z-40 text-xs animate-in fade-in zoom-in-95 space-y-1">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  Export CSV & Print Reports
                </div>

                <button
                  onClick={handleDownloadMonthlyPaymentsCSV}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2 text-slate-700 font-medium"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <div>
                    <span className="block font-semibold">Monthly Payments CSV</span>
                    <span className="block text-[10px] text-slate-400">By trade, batch & month</span>
                  </div>
                </button>

                <button
                  onClick={handleDownloadTradeBatchSummaryCSV}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2 text-slate-700 font-medium"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <div>
                    <span className="block font-semibold">Trade & Batch Summary CSV</span>
                    <span className="block text-[10px] text-slate-400">Collections & collection rate</span>
                  </div>
                </button>

                <button
                  onClick={handleExportCSV}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2 text-slate-700 font-medium"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <div>
                    <span className="block font-semibold">Candidate Dues Report CSV</span>
                    <span className="block text-[10px] text-slate-400">Filtered candidates & dues</span>
                  </div>
                </button>

                <div className="border-t border-slate-100 pt-1">
                  <button
                    onClick={() => {
                      window.print();
                      setShowExportMenu(false);
                    }}
                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-slate-50 flex items-center gap-2 text-slate-600"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Print Summary Sheet</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* + Add Candidate CTA */}
          {canAdmit && (
            <Link
              href="/admissions/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-all"
            >
              <UserPlus className="w-3.5 h-3.5 text-white" />
              <span>+ Add Candidate</span>
            </Link>
          )}
        </div>
      </div>

      {/* DYNAMIC FILTERING TOOLBAR (Trade, Batch, Dues, Timeframe, Search) */}
      {showFiltersPanel && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Filter by Trade, Batch & Due Status
              </span>
            </div>

            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                <span>Reset All Filters</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* 1. Trade Filter */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Technical Trade
              </label>
              <select
                value={selectedTrade}
                onChange={(e) => setSelectedTrade(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                <option value="all">All Trades (সকল ট্রেড)</option>
                {availableTrades.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Batch Filter */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Training Batch
              </label>
              <select
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                <option value="all">All Batches (সকল ব্যাচ)</option>
                {availableBatches.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.code} ({b.name})
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Installment Due Status Filter */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Installment Due Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                <option value="all">All Payment Statuses</option>
                <option value="due">⚠️ Has Due Balance (বকেয়া আছে)</option>
                <option value="overdue">🚨 Overdue Installments (মেয়াদোত্তীর্ণ)</option>
                <option value="paid">✅ Fully Paid (পরিশোধিত)</option>
              </select>
            </div>

            {/* 4. Timeframe Filter */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Admission Period
              </label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                <option value="all">All Time (শুরু থেকে এ পর্যন্ত)</option>
                <option value="this_month">This Month (চলতি মাস)</option>
                <option value="last_30_days">Last 30 Days (বিগত ৩০ দিন)</option>
                <option value="this_year">This Year 2026 (২০২৬ সাল)</option>
              </select>
            </div>

            {/* 5. Search Bar */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Search Candidate
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Name, Roll ID, Mobile..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DYNAMIC KPI CARDS: Total Candidates, Collections, Outstanding Dues, Overdue */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Filtered Total Candidates */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium text-slate-400">Filtered Candidates</span>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-3xl font-black text-slate-900 font-sans tracking-tight">
                  {stats?.totalStudents || 0}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100">
                  Active
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Matching current filter</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm shadow-emerald-500/20">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-3 pt-2 -mx-5 -mb-5">
            <svg viewBox="0 0 400 45" className="w-full h-11 fill-none">
              <path
                d="M0,35 C50,25 100,40 160,20 C220,35 280,15 340,30 C370,35 390,20 400,15 L400,45 L0,45 Z"
                fill="#10b981"
                fillOpacity="0.1"
              />
              <path
                d="M0,35 C50,25 100,40 160,20 C220,35 280,15 340,30 C370,35 390,20 400,15"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Card 2: Filtered Total Collected */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium text-slate-400">Total Collected (আদায়)</span>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                  {formatBDT(stats?.totalCollected || 0)}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Paid by filtered students</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shadow-indigo-500/20">
              <Banknote className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-3 pt-2 -mx-5 -mb-5">
            <svg viewBox="0 0 400 45" className="w-full h-11 fill-none">
              <path
                d="M0,30 C60,40 120,20 180,35 C240,15 300,30 360,25 C380,22 390,28 400,20 L400,45 L0,45 Z"
                fill="#6366f1"
                fillOpacity="0.1"
              />
              <path
                d="M0,30 C60,40 120,20 180,35 C240,15 300,30 360,25 C380,22 390,28 400,20"
                stroke="#6366f1"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Card 3: Filtered Total Outstanding Due */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium text-slate-400">Outstanding Due (বাকি বকেয়া)</span>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-2xl font-black text-amber-600 font-mono tracking-tight">
                  {formatBDT(stats?.totalDue || 0)}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Pending collection</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm shadow-amber-500/20">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-3 pt-2 -mx-5 -mb-5">
            <svg viewBox="0 0 400 45" className="w-full h-11 fill-none">
              <path
                d="M0,38 C50,30 110,40 170,25 C230,35 290,15 350,28 C380,32 395,18 400,22 L400,45 L0,45 Z"
                fill="#f59e0b"
                fillOpacity="0.1"
              />
              <path
                d="M0,38 C50,30 110,40 170,25 C230,35 290,15 350,28 C380,32 395,18 400,22"
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Card 4: Overdue Installments Count */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-medium text-slate-400">Overdue Installments</span>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-3xl font-black text-rose-600 font-sans tracking-tight">
                  {stats?.overdueInstallmentsCount || 0}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-100">
                  Urgent
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Past due payment date</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-sm shadow-rose-500/20">
              <AlertOctagon className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-3 pt-2 -mx-5 -mb-5">
            <svg viewBox="0 0 400 45" className="w-full h-11 fill-none">
              <path
                d="M0,25 C60,35 120,15 180,30 C240,40 300,20 360,35 C380,30 390,25 400,32 L400,45 L0,45 Z"
                fill="#f43f5e"
                fillOpacity="0.1"
              />
              <path
                d="M0,25 C60,35 120,15 180,30 C240,40 300,20 360,35 C380,30 390,25 400,32"
                stroke="#f43f5e"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* CORE FEATURE: CANDIDATE INSTALLMENT & DUES OVERVIEW TABLE (কার কত কিস্তি বাকি) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Candidate Installment & Dues Summary (কার কত কিস্তি বাকি)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Live breakdown of total payable fees, collected payments, and upcoming/overdue installments
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
              Showing <span className="font-bold text-slate-900">{candidateDues.length}</span> Candidates
            </span>

            <Link
              href="/installments"
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            >
              <span>Full Collection Module</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Candidate / Roll</th>
                <th className="py-3 px-4">Trade & Batch</th>
                <th className="py-3 px-4 text-right">Total Fee</th>
                <th className="py-3 px-4 text-right">Total Paid</th>
                <th className="py-3 px-4 text-right">Due Balance (বাকি)</th>
                <th className="py-3 px-4">Next Installment</th>
                <th className="py-3 px-4">Due Status</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
                    Filtering candidates and calculating due balances...
                  </td>
                </tr>
              ) : candidateDues.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                    No candidates match the selected filters. Try resetting the filters.
                  </td>
                </tr>
              ) : (
                candidateDues.map((c) => (
                  <tr key={c._id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Candidate */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs shrink-0">
                          {c.name ? c.name.charAt(0).toUpperCase() : 'C'}
                        </div>
                        <div>
                          <Link
                            href={`/students/${c._id}`}
                            className="font-bold text-slate-900 hover:text-emerald-600 font-sans block"
                          >
                            {c.name}
                          </Link>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {c.student_no} &bull; {c.mobile || 'No Mobile'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Trade & Batch */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{c.trade_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Batch: {c.batch || 'Unassigned'}
                      </div>
                    </td>

                    {/* Total Fee */}
                    <td className="py-3 px-4 text-right font-mono font-medium text-slate-700">
                      {formatBDT(c.total_fee || 0)}
                    </td>

                    {/* Total Paid */}
                    <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-600">
                      {formatBDT(c.total_paid || 0)}
                    </td>

                    {/* Due Balance */}
                    <td className="py-3 px-4 text-right">
                      {c.total_due > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded-md font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 text-xs">
                          {formatBDT(c.total_due)}
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-md font-mono font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 text-[11px]">
                          PAID
                        </span>
                      )}
                    </td>

                    {/* Next Installment */}
                    <td className="py-3 px-4">
                      {c.nextInstallment ? (
                        <div>
                          <div className="flex items-center gap-1 font-mono font-semibold text-slate-800 text-[11px]">
                            <span>Inst #{c.nextInstallment.installment_no}:</span>
                            <span className={c.nextInstallment.isOverdue ? 'text-rose-600 font-bold' : ''}>
                              {formatBDT(c.nextInstallment.remaining)}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Due: {formatDate(c.nextInstallment.due_date)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No pending inst.</span>
                      )}
                    </td>

                    {/* Due Status */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {c.hasOverdue ? (
                        <Badge variant="danger" size="sm">
                          Overdue Due
                        </Badge>
                      ) : c.total_due > 0 ? (
                        <Badge variant="warning" size="sm">
                          Has Due
                        </Badge>
                      ) : (
                        <Badge variant="success" size="sm">
                          Fully Paid
                        </Badge>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        {c.total_due > 0 && (
                          <Link
                            href={`/installments?search=${c.student_no}`}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition-colors shadow-xs"
                          >
                            Collect Due
                          </Link>
                        )}
                        <Link
                          href={`/students/${c._id}`}
                          title="View Student Profile"
                          className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* LOWER SECTION: Category Distribution (Trade breakdown) & System Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Category / Trade Distribution (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Trade Category Distribution (ট্রেড ভিত্তিক শিক্ষার্থী)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Proportion of candidates enrolled across vocational training trades
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                Active Filter
              </span>
            </div>

            <div className="mt-5 space-y-4">
              {categoryDistribution.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No trades in current filter</p>
              ) : (
                categoryDistribution.map((trade) => (
                  <div key={trade.name} className="flex items-center gap-3 text-xs">
                    <span className="w-40 sm:w-48 truncate text-slate-600 font-medium shrink-0">
                      {trade.name}
                    </span>
                    <div className="flex-1 bg-slate-100 rounded-md h-5 overflow-hidden flex items-center">
                      <div
                        className="bg-emerald-600 h-full rounded-md transition-all duration-500"
                        style={{ width: `${Math.max(5, trade.percentage)}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-bold text-slate-700 font-mono shrink-0">
                      {trade.count} ({trade.percentage}%)
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-4 text-[11px] text-emerald-700 font-semibold flex items-center gap-1.5 border-t border-slate-100 mt-4">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Distribution calculates live from filtered candidate admissions</span>
          </div>
        </div>

        {/* System Activity Log (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Recent System Activity</h3>
                <p className="text-[11px] text-slate-400">Audited admissions and transactions</p>
              </div>
              <Link
                href="/audit-logs"
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                <span>Audit Logs</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-3 font-mono text-xs mt-3">
              {recentActivities.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400 font-sans">
                  No recent activity recorded
                </p>
              ) : (
                recentActivities.map((act) => (
                  <div
                    key={act._id}
                    className="p-2.5 bg-slate-50/80 rounded-xl flex items-start justify-between gap-3 text-[11px]"
                  >
                    <div>
                      <span className="font-bold text-emerald-700">{act.action}</span>
                      <span className="text-slate-600 block font-sans text-[11px] mt-0.5">
                        By {act.userName} ({act.userRole})
                      </span>
                    </div>
                    <span className="text-slate-400 font-sans text-[10px] whitespace-nowrap">
                      {new Date(act.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <Link
            href="/installments"
            className="w-full py-2.5 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Banknote className="w-3.5 h-3.5 text-emerald-600" />
            <span>Open Installment Collection Register</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
