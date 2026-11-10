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
} from 'lucide-react';
import { formatDate } from '@/lib/formatters';
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
  duration_days: number;
}

export function BatchList() {
  const { user } = useAuth();
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [trades, setTrades] = useState<TradeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tradeFilter, setTradeFilter] = useState('all');

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

      const [batchRes, tradeRes] = await Promise.all([
        fetch(`/api/batches?${params.toString()}`),
        fetch('/api/trades?active=true'),
      ]);

      const batchData = await batchRes.json();
      const tradeData = await tradeRes.json();

      if (batchData.success) {
        setBatches(batchData.batches || []);
      } else {
        throw new Error(batchData.message || 'Failed to load batches');
      }

      if (tradeData.success) {
        setTrades(tradeData.trades || []);
        if (!formData.trade_id && tradeData.trades.length > 0) {
          setFormData((prev) => ({ ...prev, trade_id: tradeData.trades[0]._id }));
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

  // Auto-fill end date based on trade duration
  const handleTradeSelect = (tradeId: string) => {
    const selectedTrade = trades.find((t) => t._id === tradeId);
    let newEndDate = formData.end_date;

    if (selectedTrade && formData.start_date) {
      const start = new Date(formData.start_date);
      start.setDate(start.getDate() + (selectedTrade.duration_days || 45));
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
        return <Badge variant="info">In Training</Badge>;
      case 'Completed':
        return <Badge variant="success">Completed</Badge>;
      case 'Upcoming':
        return <Badge variant="warning">Upcoming</Badge>;
      case 'Archived':
      default:
        return <Badge variant="gray">Archived</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Training Batches & Academics
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-800 rounded-md">
              Skills Assessment
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Manage training batches, schedule candidate examinations, record Pass/Fail results, and issue training certificates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <a
            href={`/api/reports/exam-results?trade_id=${tradeFilter}&format=csv`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg shadow-xs transition-colors"
            title="Download all batch exam results as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>All Results CSV</span>
          </a>

          {canManage && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm transition-colors uppercase tracking-wider"
            >
              <Plus className="w-4 h-4" />
              Create New Batch
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Total Batches</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalBatches}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Active curriculum courses</p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-blue-200 bg-blue-50/20 shadow-xs">
          <span className="text-xs font-semibold text-blue-700 uppercase">In Training</span>
          <p className="text-2xl font-bold text-blue-700 mt-1">{inTrainingBatches}</p>
          <p className="text-[11px] text-blue-600 mt-0.5">Currently in workshop</p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
          <span className="text-xs font-semibold text-emerald-800 uppercase">Completed</span>
          <p className="text-2xl font-bold text-emerald-800 mt-1">{completedBatches}</p>
          <p className="text-[11px] text-emerald-600 mt-0.5">Finished training cycle</p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-purple-200 bg-purple-50/20 shadow-xs">
          <span className="text-xs font-semibold text-purple-800 uppercase">Enrolled Trainees</span>
          <p className="text-2xl font-bold text-purple-900 mt-1">{totalEnrolled}</p>
          <p className="text-[11px] text-purple-600 mt-0.5">Candidates in batches</p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs">
          <span className="text-xs font-semibold text-amber-800 uppercase">Certificates Issued</span>
          <p className="text-2xl font-bold text-amber-900 mt-1">{totalCertificates}</p>
          <p className="text-[11px] text-amber-600 mt-0.5">Verified certificates</p>
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
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3.5">Batch Name & Code</th>
                  <th className="px-4 py-3.5">Trade Curriculum</th>
                  <th className="px-4 py-3.5">Training Duration</th>
                  <th className="px-4 py-3.5">Exam Date</th>
                  <th className="px-4 py-3.5 text-center">Enrolled</th>
                  <th className="px-4 py-3.5 text-center">Exam Results</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((batch) => {
                  return (
                    <tr key={batch._id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Name & Code */}
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/batches/${batch._id}`}
                          className="font-bold text-slate-900 hover:text-blue-600 transition-colors block"
                        >
                          {batch.name}
                        </Link>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          <span className="font-mono bg-blue-50 text-blue-700 font-semibold px-1.5 py-0.2 rounded border border-blue-200 text-[11px]">
                            {batch.batch_code}
                          </span>
                          {batch.instructor && <span>• Trainer: {batch.instructor}</span>}
                        </div>
                      </td>

                      {/* Trade */}
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1 font-medium text-slate-800 text-xs">
                          {batch.trade_name}
                        </span>
                      </td>

                      {/* Training Dates */}
                      <td className="px-4 py-3.5 text-xs text-slate-700">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatDate(batch.start_date)}</span>
                          <span className="text-slate-400">→</span>
                          <span>{formatDate(batch.end_date)}</span>
                        </div>
                      </td>

                      {/* Exam Date */}
                      <td className="px-4 py-3.5 text-xs">
                        {batch.exam_date ? (
                          <span className="inline-flex items-center gap-1 text-slate-800 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            {formatDate(batch.exam_date)}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Not set</span>
                        )}
                      </td>

                      {/* Trainees Enrolled */}
                      <td className="px-4 py-3.5 text-center">
                        <span className="font-bold text-slate-800">
                          {batch.stats?.totalEnrolled || 0}
                        </span>
                        <span className="text-xs text-slate-400"> / {batch.capacity}</span>
                      </td>

                      {/* Assessment Stats */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="inline-flex items-center gap-2 text-xs">
                          <span className="inline-flex items-center gap-0.5 text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            {batch.stats?.passedCount || 0} Pass
                          </span>
                          {batch.stats?.failedCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-rose-700 font-semibold bg-rose-50 px-1.5 py-0.5 rounded">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              {batch.stats?.failedCount} Fail
                            </span>
                          )}
                          <span className="inline-flex items-center gap-0.5 text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.5 rounded">
                            <Award className="w-3 h-3 text-blue-600" />
                            {batch.stats?.certificatesCount || 0} Cert
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 text-center">
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
                    {trade.name} ({trade.duration_days} Days)
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
                Trainer / Instructor
              </label>
              <input
                type="text"
                value={formData.instructor}
                onChange={(e) => setFormData({ ...formData, instructor: e.target.value })}
                placeholder="e.g. Engr. Shafiqul Islam"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
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

