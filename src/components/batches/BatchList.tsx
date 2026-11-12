'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  GraduationCap,
  Plus,
  Search,
  Calendar,
  Users,
  Award,
  Clock,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Filter,
  RefreshCw,
  Building,
  FileCheck,
  Download,
  Printer,
  FileSpreadsheet,
  ArrowUpDown,
} from 'lucide-react';
import { formatDate } from '@/lib/formatters';
import { downloadExcel, printTableReport, sortTableItems, type SortDir } from '@/lib/client-export';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/components/layout/DashboardLayout';

interface BatchItem {
  _id: string;
  name: string;
  batch_code: string;
  trade_id: string;
  trade_name: string;
  start_date: string;
  end_date: string;
  exam_date?: string | null;
  instructor?: string;
  capacity: number;
  status: 'Upcoming' | 'In Training' | 'Completed' | 'Archived';
  notes?: string;
  stats: {
    totalEnrolled: number;
    passedCount: number;
    failedCount: number;
    pendingCount: number;
    certificatesCount: number;
  };
}

interface TradeOption {
  _id: string;
  name: string;
  course_days: number;
}

export function BatchList() {
  const { user } = useAuth();
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [trades, setTrades] = useState<TradeOption[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters & Sorting
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tradeFilter, setTradeFilter] = useState('all');
  const [sortKey, setSortKey] = useState('start_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Create Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    batch_code: '',
    trade_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    exam_date: '',
    instructor_id: '',
    instructor: '',
    capacity: '30',
    status: 'Upcoming',
    notes: '',
  });

  const canManage = user?.role === 'Admin' || user?.role === 'Counselor';

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (tradeFilter !== 'all') params.append('trade_id', tradeFilter);

      const [batchRes, tradeRes, empRes] = await Promise.all([
        fetch(`/api/batches?${params.toString()}`),
        fetch('/api/trades?active=true'),
        fetch('/api/hrm/employees?status=Active'),
      ]);

      const batchData = await batchRes.json();
      const tradeData = await tradeRes.json();
      const empData = await empRes.json();

      if (empData.success && Array.isArray(empData.data)) {
        setEmployees(empData.data);
      }

      if (batchData.success) {
        setBatches(batchData.batches || []);
      } else {
        throw new Error(batchData.message || 'Failed to load batches');
      }

      if (tradeData.success) {
        const tList: TradeOption[] = tradeData.trades || [];
        setTrades(tList);
        if (!formData.trade_id && tList.length > 0) {
          const firstTrade = tList[0];
          const start = new Date(formData.start_date || new Date().toISOString().split('T')[0]);
          start.setDate(start.getDate() + (firstTrade.course_days || 45));
          setFormData((prev) => ({
            ...prev,
            trade_id: firstTrade._id,
            end_date: prev.end_date || start.toISOString().split('T')[0],
          }));
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error loading batch directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, tradeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  // Auto-fill end date based on trade duration (course_days)
  const handleTradeSelect = (tradeId: string) => {
    const selectedTrade = trades.find((t) => t._id === tradeId);
    let newEndDate = formData.end_date;

    if (selectedTrade && formData.start_date) {
      const start = new Date(formData.start_date);
      start.setDate(start.getDate() + (selectedTrade.course_days || 45));
      newEndDate = start.toISOString().split('T')[0];
    }

    setFormData((prev) => ({
      ...prev,
      trade_id: tradeId,
      end_date: newEndDate,
    }));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to create batch');
      }

      setIsCreateModalOpen(false);
      setFormData({
        name: '',
        batch_code: '',
        trade_id: trades.length > 0 ? trades[0]._id : '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        exam_date: '',
        instructor_id: '',
        instructor: '',
        capacity: '30',
        status: 'Upcoming',
        notes: '',
      });
      loadData();
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Summary Metrics
  const totalBatches = batches.length;
  const inTrainingBatches = batches.filter((b) => b.status === 'In Training').length;
  const completedBatches = batches.filter((b) => b.status === 'Completed').length;
  const totalEnrolled = batches.reduce((acc, b) => acc + (b.stats?.totalEnrolled || 0), 0);
  const totalCertificates = batches.reduce((acc, b) => acc + (b.stats?.certificatesCount || 0), 0);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Batches &amp; Exam Results
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage training batches, grade candidate exams, and print or download batch results.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href={`/api/reports/exam-results?trade_id=${tradeFilter}&format=csv`}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap"
            title="Download all batch exam results as CSV"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>All Results CSV</span>
          </a>

          {canManage && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>New Batch</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase">Total Batches</span>
          <p className="text-2xl font-black text-slate-900 mt-1">{totalBatches}</p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-blue-200 bg-blue-50/20 shadow-xs">
          <span className="text-[11px] font-bold text-blue-700 uppercase">In Training</span>
          <p className="text-2xl font-black text-blue-700 mt-1">{inTrainingBatches}</p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
          <span className="text-[11px] font-bold text-emerald-800 uppercase">Completed</span>
          <p className="text-2xl font-black text-emerald-800 mt-1">{completedBatches}</p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-purple-200 bg-purple-50/20 shadow-xs">
          <span className="text-[11px] font-bold text-purple-800 uppercase">Enrolled</span>
          <p className="text-2xl font-black text-purple-900 mt-1">{totalEnrolled}</p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs col-span-2 sm:col-span-1">
          <span className="text-[11px] font-bold text-amber-800 uppercase">Certificates</span>
          <p className="text-2xl font-black text-amber-900 mt-1">{totalCertificates}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search batch name, code, instructor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs md:text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs md:text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="Upcoming">Upcoming</option>
            <option value="In Training">In Training</option>
            <option value="Completed">Completed</option>
          </select>

          {/* Trade Filter */}
          <select
            value={tradeFilter}
            onChange={(e) => setTradeFilter(e.target.value)}
            className="px-3 py-2 text-xs md:text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Trades</option>
            {trades.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 ml-2.5" />
            <select
              value={`${sortKey}:${sortDir}`}
              onChange={(e) => {
                const [k, d] = e.target.value.split(':');
                setSortKey(k);
                setSortDir(d as SortDir);
              }}
              className="px-2 py-2 text-xs md:text-sm bg-white text-slate-700 focus:outline-hidden"
            >
              <option value="start_date:desc">Newest Start Date</option>
              <option value="start_date:asc">Oldest Start Date</option>
              <option value="code:asc">Batch Code (A → Z)</option>
              <option value="name:asc">Batch Name (A → Z)</option>
              <option value="enrolled:desc">Most Enrolled</option>
              <option value="status:asc">Status</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              const sorted = sortTableItems(batches, sortKey, sortDir, {
                start_date: (b) => new Date(b.start_date || 0),
                code: (b) => b.batch_code || '',
                name: (b) => b.name || '',
                enrolled: (b) => b.stats?.totalEnrolled || 0,
                status: (b) => b.status || '',
              });
              downloadExcel({
                filename: 'training-batches',
                sheetName: 'Batches',
                headers: ['Code', 'Batch Name', 'Trade', 'Instructor', 'Start Date', 'End Date', 'Exam Date', 'Enrolled', 'Capacity', 'Passed', 'Certs', 'Status'],
                rows: sorted.map((b) => [
                  b.batch_code,
                  b.name,
                  b.trade_name,
                  b.instructor || '',
                  formatDate(b.start_date),
                  formatDate(b.end_date),
                  b.exam_date ? formatDate(b.exam_date) : '',
                  b.stats?.totalEnrolled || 0,
                  b.capacity,
                  b.stats?.passedCount || 0,
                  b.stats?.certificatesCount || 0,
                  b.status,
                ]),
              });
            }}
            className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </button>

          <button
            type="button"
            onClick={() => {
              const sorted = sortTableItems(batches, sortKey, sortDir, {
                start_date: (b) => new Date(b.start_date || 0),
                code: (b) => b.batch_code || '',
                name: (b) => b.name || '',
                enrolled: (b) => b.stats?.totalEnrolled || 0,
                status: (b) => b.status || '',
              });
              printTableReport({
                title: 'Training Batches & Assessment Summary',
                headers: ['Code', 'Batch Name', 'Trade', 'Instructor', 'Duration', 'Enrolled', 'Passed', 'Status'],
                rows: sorted.map((b) => [
                  b.batch_code,
                  b.name,
                  b.trade_name,
                  b.instructor || '—',
                  `${formatDate(b.start_date)} – ${formatDate(b.end_date)}`,
                  `${b.stats?.totalEnrolled || 0}/${b.capacity}`,
                  b.stats?.passedCount || 0,
                  b.status,
                ]),
                rightAlignCols: [6],
                landscape: true,
              });
            }}
            className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>

          <button
            onClick={loadData}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Batch Cards / Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">Loading batch directory...</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center text-rose-600">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
            <p className="font-semibold">{error}</p>
          </div>
        ) : batches.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <GraduationCap className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="font-semibold text-slate-700 text-base">No training batches found</p>
            <p className="text-xs text-slate-400 mt-1">
              Create your first batch to start scheduling candidates and recording exam results.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Batch</th>
                  <th className="px-4 py-3 whitespace-nowrap">Trade</th>
                  <th className="px-4 py-3 whitespace-nowrap">Schedule</th>
                  <th className="px-4 py-3 whitespace-nowrap">Exam Date</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Enrolled</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Results</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortTableItems(batches, sortKey, sortDir, {
                  start_date: (b) => new Date(b.start_date || 0),
                  code: (b) => b.batch_code || '',
                  name: (b) => b.name || '',
                  enrolled: (b) => b.stats?.totalEnrolled || 0,
                  status: (b) => b.status || '',
                }).map((batch) => {
                  return (
                    <tr key={batch._id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Name & Code */}
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/batches/${batch._id}`}
                          className="font-semibold text-slate-900 hover:text-blue-600 transition-colors block max-w-[220px] truncate"
                          title={batch.name}
                        >
                          {batch.name}
                        </Link>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5 whitespace-nowrap">
                          <span className="font-mono bg-blue-50 text-blue-700 font-semibold px-1.5 py-0.5 rounded border border-blue-200 text-[11px]">
                            {batch.batch_code}
                          </span>
                          {batch.instructor && (
                            <span className="truncate max-w-[130px]">• {batch.instructor}</span>
                          )}
                        </div>
                      </td>

                      {/* Trade */}
                      <td className="px-4 py-3.5">
                        <span className="font-medium text-slate-800 text-xs block max-w-[160px] truncate" title={batch.trade_name}>
                          {batch.trade_name}
                        </span>
                      </td>

                      {/* Training Dates */}
                      <td className="px-4 py-3.5 text-xs text-slate-700 whitespace-nowrap">
                        <div className="flex items-center gap-1 font-medium">
                          <span>{formatDate(batch.start_date)}</span>
                          <span className="text-slate-400">–</span>
                          <span>{formatDate(batch.end_date)}</span>
                        </div>
                      </td>

                      {/* Exam Date */}
                      <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                        {batch.exam_date ? (
                          <span className="inline-flex items-center gap-1 text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                            {formatDate(batch.exam_date)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Trainees Enrolled */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <span className="font-bold text-slate-800">
                          {batch.stats?.totalEnrolled || 0}
                        </span>
                        <span className="text-xs text-slate-400">/{batch.capacity}</span>
                      </td>

                      {/* Assessment Stats */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 text-xs">
                          <span className="inline-flex items-center gap-0.5 text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">
                            {batch.stats?.passedCount || 0} Pass
                          </span>
                          {batch.stats?.failedCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-rose-700 font-semibold bg-rose-50 px-1.5 py-0.5 rounded">
                              {batch.stats?.failedCount} Fail
                            </span>
                          )}
                          <span className="inline-flex items-center gap-0.5 text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.5 rounded">
                            {batch.stats?.certificatesCount || 0} Cert
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {getStatusBadge(batch.status)}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <a
                            href={`/api/reports/exam-results?batch_id=${batch._id}&format=csv`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-600 hover:text-white border border-emerald-200 rounded-lg transition-colors"
                            title={`Download ${batch.batch_code} Result CSV`}
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>CSV</span>
                          </a>

                          <Link
                            href={`/batches/${batch._id}/result`}
                            target="_blank"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
                            title={`Print ${batch.batch_code} Result Sheet`}
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Print</span>
                          </Link>

                          <Link
                            href={`/batches/${batch._id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                          >
                            <span>Manage &amp; Results</span>
                            <ArrowRight className="w-3.5 h-3.5" />
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

      {/* CREATE BATCH MODAL */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Training Batch"
        description="Establish a new training session, assign trade curriculum, and schedule examination dates"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {createError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{createError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Batch Code (Unique ID) *
              </label>
              <input
                type="text"
                value={formData.batch_code}
                onChange={(e) => setFormData({ ...formData, batch_code: e.target.value.toUpperCase() })}
                placeholder="e.g. PW-2026-01"
                required
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg uppercase font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Batch Name / Title *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Pipe Welder 6G Regular Batch 01"
                required
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Trade Curriculum *
              </label>
              <select
                value={formData.trade_id}
                onChange={(e) => handleTradeSelect(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                {trades.map((trade) => (
                  <option key={trade._id} value={trade._id}>
                    {trade.name} ({trade.course_days} Days)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Start Date *
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => {
                  setFormData({ ...formData, start_date: e.target.value });
                  handleTradeSelect(formData.trade_id);
                }}
                required
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                End Date (Training Completion) *
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                required
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Scheduled Exam Date
              </label>
              <input
                type="date"
                value={formData.exam_date}
                onChange={(e) => setFormData({ ...formData, exam_date: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Trainer / Instructor (Employee)
              </label>
              <select
                value={formData.instructor_id}
                onChange={(e) => {
                  const id = e.target.value;
                  const emp = employees.find((x) => x._id === id);
                  setFormData({
                    ...formData,
                    instructor_id: id,
                    instructor: emp ? `${emp.firstName} ${emp.lastName}` : '',
                  });
                }}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Employee Instructor (Optional)</option>
                {employees.map((emp) => (
                  <option key={emp._id} value={emp._id}>
                    {emp.firstName} {emp.lastName} ({emp.employee_id} • {emp.department})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Trainee Capacity
              </label>
              <input
                type="number"
                min="1"
                max="200"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Initial Status
              </label>
              <select
                value={formData.status}
                onChange={(e: any) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="Upcoming">Upcoming</option>
                <option value="In Training">In Training</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Notes / Workshop Details
            </label>
            <textarea
              rows={2}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Workshop schedule, equipment notes, or guidelines..."
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Creating Batch...' : 'Create Batch'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

