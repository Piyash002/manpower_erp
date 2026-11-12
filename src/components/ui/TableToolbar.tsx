'use client';

import React, { useState } from 'react';
import { Search, X, ArrowUpDown, ArrowUp, ArrowDown, FileSpreadsheet, Printer, RotateCcw } from 'lucide-react';
import type { SortDir } from '@/lib/client-export';

export interface SortOption {
  value: string;
  label: string;
}

interface TableToolbarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  sortKey?: string;
  sortDir?: SortDir;
  sortOptions?: SortOption[];
  onSortChange?: (key: string, dir: SortDir) => void;
  totalCount?: number;
  filteredCount?: number;
  onReset?: () => void;
  hasActiveFilters?: boolean;
  onExportExcel?: () => void | Promise<void>;
  onPrint?: () => void;
  extraActions?: React.ReactNode;
  className?: string;
}

export function TableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters,
  sortKey,
  sortDir = 'asc',
  sortOptions,
  onSortChange,
  totalCount,
  filteredCount,
  onReset,
  hasActiveFilters,
  onExportExcel,
  onPrint,
  extraActions,
  className = '',
}: TableToolbarProps) {
  const [exporting, setExporting] = useState(false);

  const handleExcel = async () => {
    if (!onExportExcel || exporting) return;
    setExporting(true);
    try {
      await onExportExcel();
    } finally {
      setExporting(false);
    }
  };

  const showReset =
    Boolean(onReset) &&
    (hasActiveFilters || Boolean(search && search.trim().length > 0));

  return (
    <div
      className={`bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-2.5 text-xs ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
        {onSearchChange && (
          <div className="relative flex-1 min-w-[190px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-8 pr-7 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                title="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {filters}

        {sortOptions && sortOptions.length > 0 && onSortChange && sortKey !== undefined && (
          <div className="inline-flex items-center border border-slate-300 rounded-lg overflow-hidden bg-slate-50">
            <span className="px-2 text-[11px] font-medium text-slate-500 flex items-center gap-1 border-r border-slate-200">
              <ArrowUpDown className="w-3 h-3" /> Sort
            </span>
            <select
              value={sortKey}
              onChange={(e) => onSortChange(e.target.value, sortDir)}
              className="px-2 py-1.5 text-xs bg-white text-slate-700 font-medium focus:outline-none"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onSortChange(sortKey, sortDir === 'asc' ? 'desc' : 'asc')}
              title={sortDir === 'asc' ? 'Ascending (click for Descending)' : 'Descending (click for Ascending)'}
              className="px-2 py-1.5 bg-white border-l border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center gap-1"
            >
              {sortDir === 'asc' ? (
                <ArrowUp className="w-3 h-3 text-emerald-700" />
              ) : (
                <ArrowDown className="w-3 h-3 text-emerald-700" />
              )}
              <span className="text-[10px] font-semibold uppercase">{sortDir}</span>
            </button>
          </div>
        )}

        {showReset && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {typeof totalCount === 'number' && (
          <span className="text-[11px] text-slate-500 font-medium px-1">
            {typeof filteredCount === 'number' && filteredCount !== totalCount
              ? `${filteredCount} of ${totalCount}`
              : `${totalCount} item${totalCount === 1 ? '' : 's'}`}
          </span>
        )}

        {extraActions}

        {onExportExcel && (
          <button
            type="button"
            onClick={handleExcel}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg disabled:opacity-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{exporting ? 'Exporting...' : 'Excel (.xlsx)'}</span>
          </button>
        )}

        {onPrint && (
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>
        )}
      </div>
    </div>
  );
}
