'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  GraduationCap,
  UserCheck,
  Landmark,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { formatBDT } from '@/lib/formatters';

interface OverviewMetric {
  label: string;
  value?: string | number;
  valueBDT?: number;
}

interface OverviewSection {
  href: string;
  metrics: OverviewMetric[];
}

export function OverviewDashboard() {
  const [sections, setSections] = useState<Record<string, OverviewSection>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/dashboard/overview');
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to load overview');
      }
      setSections(json.sections || {});
    } catch (err: any) {
      setError(err?.message || 'Unable to load overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const cards = [
    {
      key: 'admission',
      title: 'Admission',
      subtitle: 'Candidates, batches & trade intake',
      icon: <GraduationCap className="w-5 h-5 text-sky-600" />,
      accent: 'bg-sky-50 border-sky-100',
    },
    {
      key: 'hrm',
      title: 'HRM',
      subtitle: 'Employees, attendance & payroll runs',
      icon: <UserCheck className="w-5 h-5 text-indigo-600" />,
      accent: 'bg-indigo-50 border-indigo-100',
    },
    {
      key: 'accounts',
      title: 'Accounts',
      subtitle: 'Cash, collections, dues & general ledger',
      icon: <Landmark className="w-5 h-5 text-emerald-600" />,
      accent: 'bg-emerald-50 border-emerald-100',
    },
  ].filter((c) => Boolean(sections[c.key]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-sans">
            Operations Overview
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Select a module dashboard to view detailed metrics and daily operations
          </p>
        </div>
        <button
          type="button"
          onClick={loadOverview}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white border border-slate-200 rounded-xl p-5 h-56 animate-pulse space-y-4"
            >
              <div className="h-5 w-32 bg-slate-200 rounded" />
              <div className="h-8 bg-slate-100 rounded" />
              <div className="h-8 bg-slate-100 rounded" />
              <div className="h-9 bg-slate-200 rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {cards.map((card) => {
            const sec = sections[card.key];
            return (
              <div
                key={card.key}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-5"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">{card.title}</h2>
                      <p className="text-xs text-slate-500 mt-0.5">{card.subtitle}</p>
                    </div>
                    <div className={`p-2 rounded-xl border ${card.accent}`}>{card.icon}</div>
                  </div>

                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                    {sec.metrics.map((m) => (
                      <div key={m.label} className="py-2.5 flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-medium">{m.label}</span>
                        <span className="font-bold text-slate-900">
                          {m.valueBDT !== undefined ? formatBDT(m.valueBDT) : m.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <Link
                  href={sec.href}
                  className="inline-flex items-center justify-center gap-1.5 w-full px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
                >
                  Open dashboard <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

