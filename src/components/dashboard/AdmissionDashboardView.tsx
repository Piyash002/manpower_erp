'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  UserPlus,
  GraduationCap,
  CalendarClock,
  Globe2,
  ClipboardCheck,
  Users2,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import {
  DashboardShell,
  DashboardCard,
  HorizontalBarList,
  VerticalBarChart,
} from '@/components/dashboard/DashboardShell';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/components/layout/DashboardLayout';
import { formatBDT, formatDateDMY } from '@/lib/formatters';
import { downloadExcel } from '@/lib/client-export';
import type { DateRangePreset } from '@/lib/dashboard-helpers';

interface AdmissionData {
  range: { preset: DateRangePreset; label: string; startIso: string; endIso: string };
  kpis: {
    totalCandidates: number;
    newAdmissions: number;
    activeBatches: number;
    upcomingStarts: number;
  };
  duesAtAGlance: { totalDueBDT: number };
  charts: {
    admissionsTrend: Array<{ label: string; primary: number }>;
    candidatesByTrade: Array<{ label: string; value: number }>;
  };
  tables: {
    recentAdmissions: Array<{
      _id: string;
      studentNo: string;
      name: string;
      tradeName: string;
      batch: string;
      destinationCountry: string;
      admissionDate: string;
      status: string;
    }>;
    batchesStartingSoon: Array<{
      _id: string;
      batchCode: string;
      name: string;
      tradeName: string;
      startDate: string;
      capacity: number;
      enrolled: number;
      status: string;
    }>;
  };
  optional: {
    byCountry: Array<{ country: string; count: number }>;
    assessments: Array<{ status: string; count: number }>;
  };
  filterOptions: {
    trades: string[];
    batches: Array<{ name: string; code: string; trade: string }>;
  };
}

export function AdmissionDashboardView() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const canAccessAccounts = isAdmin;

  const [dateRange, setDateRange] = useState<DateRangePreset>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [trade, setTrade] = useState('all');
  const [batch, setBatch] = useState('all');
  const [search, setSearch] = useState('');

  const [data, setData] = useState<AdmissionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ range: dateRange });
      if (dateRange === 'custom') {
        if (customStart) params.set('startDate', customStart);
        if (customEnd) params.set('endDate', customEnd);
      }
      if (trade !== 'all') params.set('trade', trade);
      if (batch !== 'all') params.set('batch', batch);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/dashboard/admission?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to load admission dashboard');
      }
      setData(json);
    } catch (err: any) {
      setError(err?.message || 'Unable to load admission dashboard');
    } finally {
      setLoading(false);
    }
  }, [dateRange, customStart, customEnd, trade, batch, search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 150);
    return () => clearTimeout(timer);
  }, [loadData]);

  const hasActiveFilters = trade !== 'all' || batch !== 'all' || search.trim().length > 0;

  const resetFilters = () => {
    setTrade('all');
    setBatch('all');
    setSearch('');
  };

  const handleExport = async () => {
    if (!data) return;
    await downloadExcel({
      filename: `admission-dashboard-${data.range.preset}`,
      sheetName: 'Recent Admissions',
      headers: ['Roll No', 'Candidate Name', 'Trade', 'Batch', 'Destination', 'Admission Date', 'Status'],
      rows: data.tables.recentAdmissions.map((r) => [
        r.studentNo,
        r.name,
        r.tradeName,
        r.batch,
        r.destinationCountry,
        formatDateDMY(r.admissionDate),
        r.status,
      ]),
    });
  };

  const quickLinks = [
    { label: 'New Admission', href: '/admissions/new', icon: <UserPlus className="w-4 h-4" /> },
    { label: 'Students Directory', href: '/students', icon: <Users2 className="w-4 h-4" /> },
    { label: 'Batches & Assessment', href: '/batches', icon: <GraduationCap className="w-4 h-4" /> },
    ...(isAdmin
      ? [{ label: 'Trades & Countries', href: '/trades', icon: <Globe2 className="w-4 h-4" /> }]
      : []),
  ];

  const kpis = [
    {
      label: 'Total Candidates',
      value: data?.kpis.totalCandidates ?? 0,
      helper: hasActiveFilters ? 'Matching active filters' : 'All registered candidates',
      href: '/students',
      icon: <Users className="w-4 h-4" />,
      accent: 'sky' as const,
    },
    {
      label: 'New Admissions',
      value: data?.kpis.newAdmissions ?? 0,
      helper: data?.range.label || 'Selected range',
      href: '/students',
      icon: <UserPlus className="w-4 h-4" />,
      accent: 'emerald' as const,
    },
    {
      label: 'Active Batches',
      value: data?.kpis.activeBatches ?? 0,
      helper: 'Upcoming & In Training',
      href: '/batches',
      icon: <GraduationCap className="w-4 h-4" />,
      accent: 'indigo' as const,
    },
    {
      label: 'Upcoming Batch Starts',
      value: data?.kpis.upcomingStarts ?? 0,
      helper: 'Starting in next 30 days',
      href: '/batches',
      icon: <CalendarClock className="w-4 h-4" />,
      accent: 'amber' as const,
    },
  ];

  const filtersContent = (
    <div className="space-y-2.5">
      <div>
        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Search</label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, roll, mobile, or passport"
          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
        />
      </div>
      <div>
        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Trade</label>
        <select
          value={trade}
          onChange={(e) => setTrade(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
        >
          <option value="all">All Trades</option>
          {(data?.filterOptions.trades || []).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Batch</label>
        <select
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
        >
          <option value="all">All Batches</option>
          {(data?.filterOptions.batches || []).map((b) => (
            <option key={b.code} value={b.name}>
              {b.name} ({b.code})
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  const extraStrip = data ? (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Dues at a glance */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-xs flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Dues at a Glance
          </div>
          <div className="text-base font-bold text-slate-900 mt-0.5">
            {formatBDT(data.duesAtAGlance.totalDueBDT)}
          </div>
          <div className="text-[11px] text-slate-500">Total outstanding candidate fees</div>
        </div>
        {canAccessAccounts && (
          <Link
            href="/accounts/dashboard"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 shrink-0"
          >
            Accounts <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>

      {/* Destination countries */}
      {data.optional.byCountry.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            <Globe2 className="w-3.5 h-3.5" />
            Top Destination Countries
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.optional.byCountry.slice(0, 4).map((c) => (
              <span
                key={c.country}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium"
              >
                {c.country}: <strong className="text-slate-900">{c.count}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Assessment status */}
      {data.optional.assessments.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            <ClipboardCheck className="w-3.5 h-3.5" />
            Batch Assessments
          </div>
          <div className="flex flex-wrap gap-2">
            {data.optional.assessments.map((a) => (
              <Badge
                key={a.status}
                variant={
                  a.status === 'Passed' ? 'success' : a.status === 'Failed' ? 'danger' : 'warning'
                }
              >
                {a.status}: {a.count}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <DashboardShell
      title="Admission Dashboard"
      subtitle="Candidate enrollments, trade distribution, and upcoming training batches"
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      customStart={customStart}
      customEnd={customEnd}
      onCustomDateChange={(s, e) => {
        setCustomStart(s);
        setCustomEnd(e);
      }}
      onExport={handleExport}
      filtersContent={filtersContent}
      hasActiveFilters={hasActiveFilters}
      onResetFilters={resetFilters}
      kpis={kpis}
      extraStrip={extraStrip}
      loading={loading}
      error={error}
      headerRightExtra={
        <button
          type="button"
          onClick={loadData}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          Refresh
        </button>
      }
      charts={
        <>
          <DashboardCard
            title="Admissions Trend"
            subtitle={`Monthly candidate intake (${new Date().getFullYear()})`}
          >
            <VerticalBarChart
              items={data?.charts.admissionsTrend || []}
              primaryLabel="Admissions"
              emptyText="No admissions recorded this year."
            />
          </DashboardCard>

          <DashboardCard
            title="Candidates by Trade"
            subtitle="Top trades with remaining grouped"
            actionHref="/students"
          >
            <HorizontalBarList
              items={data?.charts.candidatesByTrade || []}
              emptyText="No candidate trade records found."
              barColor="bg-sky-500"
            />
          </DashboardCard>
        </>
      }
      tables={
        <>
          <DashboardCard
            title="Recent Admissions"
            subtitle={`Latest 5 enrollments (${data?.range.label || 'This Month'})`}
            actionHref="/students"
          >
            {!data || data.tables.recentAdmissions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No admissions found in this date range.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-[11px] uppercase text-slate-400 border-b border-slate-100">
                    <tr>
                      <th className="py-2 pr-2">Candidate</th>
                      <th className="py-2 px-2">Roll</th>
                      <th className="py-2 px-2">Trade</th>
                      <th className="py-2 px-2">Batch</th>
                      <th className="py-2 pl-2 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.tables.recentAdmissions.map((r) => (
                      <tr key={r._id} className="hover:bg-slate-50/70">
                        <td className="py-2 pr-2 font-medium text-slate-900">
                          <Link href={`/students/${r._id}`} className="hover:text-sky-600">
                            {r.name}
                          </Link>
                        </td>
                        <td className="py-2 px-2 font-mono text-slate-600">{r.studentNo}</td>
                        <td className="py-2 px-2 text-slate-600">{r.tradeName}</td>
                        <td className="py-2 px-2 text-slate-600">{r.batch}</td>
                        <td className="py-2 pl-2 text-right text-slate-500 whitespace-nowrap">
                          {formatDateDMY(r.admissionDate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="Batches Starting Soon"
            subtitle="Next 30 days schedule and seat capacity"
            actionHref="/batches"
          >
            {!data || data.tables.batchesStartingSoon.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No batches scheduled to start in the next 30 days.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-[11px] uppercase text-slate-400 border-b border-slate-100">
                    <tr>
                      <th className="py-2 pr-2">Batch</th>
                      <th className="py-2 px-2">Trade</th>
                      <th className="py-2 px-2">Start Date</th>
                      <th className="py-2 pl-2 text-right">Seats Filled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.tables.batchesStartingSoon.map((b) => (
                      <tr key={b._id} className="hover:bg-slate-50/70">
                        <td className="py-2 pr-2 font-medium text-slate-900">
                          <Link href={`/batches/${b._id}`} className="hover:text-sky-600">
                            {b.name}
                          </Link>
                          <div className="text-[10px] font-mono text-slate-400">{b.batchCode}</div>
                        </td>
                        <td className="py-2 px-2 text-slate-600">{b.tradeName}</td>
                        <td className="py-2 px-2 text-slate-600 whitespace-nowrap">
                          {formatDateDMY(b.startDate)}
                        </td>
                        <td className="py-2 pl-2 text-right font-semibold text-slate-800">
                          {b.enrolled} / {b.capacity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DashboardCard>
        </>
      }
      quickLinks={quickLinks}
    />
  );
}

