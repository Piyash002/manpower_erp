'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Download,
  Filter,
  ArrowRight,
  AlertCircle,
  X,
} from 'lucide-react';
import type { DateRangePreset } from '@/lib/dashboard-helpers';

export interface DashboardKpiItem {
  label: string;
  value: string | number;
  helper?: string;
  href?: string;
  icon?: React.ReactNode;
  accent?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'slate';
  tooltip?: string;
}

export interface DashboardQuickLink {
  label: string;
  href: string;
  icon?: React.ReactNode;
  description?: string;
}

interface DashboardShellProps {
  title: string;
  subtitle: string;
  dateRange: DateRangePreset;
  onDateRangeChange: (preset: DateRangePreset) => void;
  customStart?: string;
  customEnd?: string;
  onCustomDateChange?: (start: string, end: string) => void;
  onExport?: () => void;
  exportLabel?: string;
  filtersContent?: React.ReactNode;
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
  kpis: DashboardKpiItem[];
  extraStrip?: React.ReactNode;
  charts?: React.ReactNode;
  tables?: React.ReactNode;
  quickLinks?: DashboardQuickLink[];
  loading?: boolean;
  error?: string;
  headerRightExtra?: React.ReactNode;
}

const ACCENT_MAP: Record<NonNullable<DashboardKpiItem['accent']>, string> = {
  indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  amber: 'bg-amber-50 text-amber-600 border-amber-100',
  rose: 'bg-rose-50 text-rose-600 border-rose-100',
  sky: 'bg-sky-50 text-sky-600 border-sky-100',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function DashboardShell({
  title,
  subtitle,
  dateRange,
  onDateRangeChange,
  customStart = '',
  customEnd = '',
  onCustomDateChange,
  onExport,
  exportLabel = 'Export CSV',
  filtersContent,
  hasActiveFilters = false,
  onResetFilters,
  kpis,
  extraStrip,
  charts,
  tables,
  quickLinks,
  loading = false,
  error = '',
  headerRightExtra,
}: DashboardShellProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    }
    if (filtersOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filtersOpen]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-sans">
            {title}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Date Range Selector */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              aria-label="Date range"
              value={dateRange}
              onChange={(e) => onDateRangeChange(e.target.value as DateRangePreset)}
              className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {dateRange === 'custom' && onCustomDateChange && (
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-xs text-xs">
              <input
                type="date"
                aria-label="Start date"
                value={customStart}
                onChange={(e) => onCustomDateChange(e.target.value, customEnd)}
                className="text-xs text-slate-700 focus:outline-none"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                aria-label="End date"
                value={customEnd}
                onChange={(e) => onCustomDateChange(customStart, e.target.value)}
                className="text-xs text-slate-700 focus:outline-none"
              />
            </div>
          )}

          {/* Collapsed Filters Popover (Closed by Default) */}
          {filtersContent && (
            <div className="relative" ref={popoverRef}>
              <button
                type="button"
                onClick={() => setFiltersOpen((prev) => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border shadow-xs transition-colors ${
                  filtersOpen || hasActiveFilters
                    ? 'bg-sky-50 text-sky-700 border-sky-300'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Filters</span>
                {hasActiveFilters && (
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-600 inline-block" />
                )}
              </button>

              {filtersOpen && (
                <div className="absolute right-0 mt-1.5 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-3.5 z-40 space-y-3 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-semibold text-slate-800">Filters</span>
                    <div className="flex items-center gap-2">
                      {hasActiveFilters && onResetFilters && (
                        <button
                          type="button"
                          onClick={onResetFilters}
                          className="text-[11px] font-medium text-sky-600 hover:underline"
                        >
                          Reset
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setFiltersOpen(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {filtersContent}
                </div>
              )}
            </div>
          )}

          {headerRightExtra}

          {onExport && (
            <button
              type="button"
              onClick={onExport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 shadow-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>{exportLabel}</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Row 1: 4 KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse space-y-3"
            >
              <div className="h-3 w-24 bg-slate-200 rounded" />
              <div className="h-7 w-32 bg-slate-200 rounded" />
              <div className="h-3 w-28 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.slice(0, 4).map((kpi) => {
            const accentClass = ACCENT_MAP[kpi.accent || 'slate'];
            const cardInner = (
              <div
                title={kpi.tooltip}
                className={`bg-white border border-slate-200 rounded-xl p-4 shadow-xs transition-all h-full flex flex-col justify-between ${
                  kpi.href ? 'hover:border-slate-300 hover:shadow-sm' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500">{kpi.label}</span>
                  {kpi.icon && (
                    <div className={`p-1.5 rounded-lg border ${accentClass} shrink-0`}>
                      {kpi.icon}
                    </div>
                  )}
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold text-slate-900 tracking-tight">
                    {kpi.value}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500 truncate">
                      {kpi.helper || '\u00A0'}
                    </span>
                    {kpi.href && (
                      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-sky-600 shrink-0">
                        Open <ArrowRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );

            return kpi.href ? (
              <Link key={kpi.label} href={kpi.href} className="block">
                {cardInner}
              </Link>
            ) : (
              <div key={kpi.label}>{cardInner}</div>
            );
          })}
        </div>
      )}

      {/* Optional Status Strip / Secondary Cards */}
      {extraStrip}

      {/* Row 2: Up to 2 Charts Side by Side */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="bg-white border border-slate-200 rounded-xl p-5 h-64 animate-pulse space-y-4"
            >
              <div className="h-4 w-40 bg-slate-200 rounded" />
              <div className="h-44 bg-slate-100 rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        charts && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{charts}</div>
      )}

      {/* Row 3: Up to 2 Compact Tables Side by Side */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="bg-white border border-slate-200 rounded-xl p-5 h-60 animate-pulse space-y-3"
            >
              <div className="h-4 w-44 bg-slate-200 rounded" />
              <div className="h-8 bg-slate-100 rounded" />
              <div className="h-8 bg-slate-100 rounded" />
              <div className="h-8 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : (
        tables && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{tables}</div>
      )}

      {/* Bottom: Quick Links Row */}
      {quickLinks && quickLinks.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
            Quick Links
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {quickLinks.map((ql) => (
              <Link
                key={ql.href + ql.label}
                href={ql.href}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-slate-900 hover:text-white hover:border-slate-900 text-slate-700 text-xs font-semibold transition-colors group"
              >
                {ql.icon && (
                  <span className="text-slate-400 group-hover:text-white shrink-0">
                    {ql.icon}
                  </span>
                )}
                <span className="truncate">{ql.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DashboardCard({
  title,
  subtitle,
  actionHref,
  actionLabel = 'View all',
  children,
}: {
  title: string;
  subtitle?: string;
  actionHref?: string;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {actionHref && (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700 shrink-0"
          >
            {actionLabel} <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function HorizontalBarList({
  items,
  emptyText = 'No data available for the selected range.',
  barColor = 'bg-sky-500',
  formatValue,
}: {
  items: Array<{ label: string; value: number; sublabel?: string }>;
  emptyText?: string;
  barColor?: string;
  formatValue?: (val: number) => string;
}) {
  if (!items || items.length === 0) {
    return <div className="py-10 text-center text-xs text-slate-400">{emptyText}</div>;
  }

  const maxVal = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const pct = Math.max(4, Math.round((item.value / maxVal) * 100));
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 truncate pr-2">{item.label}</span>
              <span className="font-semibold text-slate-900 shrink-0">
                {formatValue ? formatValue(item.value) : item.value}
                {item.sublabel ? (
                  <span className="text-slate-400 font-normal ml-1">({item.sublabel})</span>
                ) : null}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function VerticalBarChart({
  items,
  emptyText = 'No trend data available.',
  primaryLabel = 'Value',
  secondaryLabel,
  formatValue,
}: {
  items: Array<{ label: string; primary: number; secondary?: number }>;
  emptyText?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  formatValue?: (val: number) => string;
}) {
  if (!items || items.length === 0) {
    return <div className="py-12 text-center text-xs text-slate-400">{emptyText}</div>;
  }

  const maxVal = Math.max(
    ...items.map((i) => Math.max(i.primary, i.secondary || 0)),
    1
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-sky-500 inline-block" />
          {primaryLabel}
        </span>
        {secondaryLabel && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-rose-400 inline-block" />
            {secondaryLabel}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-1.5 h-44 pt-4 border-b border-slate-100">
        {items.map((item) => {
          const pHeight = item.primary > 0 ? Math.max(8, Math.round((item.primary / maxVal) * 100)) : 2;
          const sHeight =
            item.secondary !== undefined && item.secondary > 0
              ? Math.max(8, Math.round((item.secondary / maxVal) * 100))
              : 0;
          const tooltip = secondaryLabel
            ? `${item.label}: ${primaryLabel} ${formatValue ? formatValue(item.primary) : item.primary} | ${secondaryLabel} ${formatValue ? formatValue(item.secondary || 0) : item.secondary || 0}`
            : `${item.label}: ${formatValue ? formatValue(item.primary) : item.primary}`;

          return (
            <div
              key={item.label}
              title={tooltip}
              className="flex-1 flex flex-col items-center justify-end h-full min-w-0 group"
            >
              <div className="w-full flex items-end justify-center gap-0.5 flex-1 px-0.5">
                <div
                  className="w-full max-w-[18px] bg-sky-500 group-hover:bg-sky-600 rounded-t transition-all"
                  style={{ height: `${pHeight}%` }}
                />
                {secondaryLabel && (
                  <div
                    className="w-full max-w-[18px] bg-rose-400 group-hover:bg-rose-500 rounded-t transition-all"
                    style={{ height: `${sHeight || 2}%` }}
                  />
                )}
              </div>
              <span className="text-[10px] text-slate-500 mt-1.5 truncate w-full text-center">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

