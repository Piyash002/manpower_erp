'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Settings,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  History,
  Calculator,
  Info,
  Lock,
} from 'lucide-react';
import { formatBDT, formatDateDMY } from '@/lib/formatters';
import { calculatePayslipPure } from '@/lib/payroll-calc';
import type { PayrollSettingsSnapshot } from '@/models/PayrollSettings';
import { Badge } from '@/components/ui/Badge';
import { TableToolbar } from '@/components/ui/TableToolbar';
import { downloadExcel, matchesSearch, printTableReport, sortTableItems, SortDir } from '@/lib/client-export';
import { useAuth } from '@/components/layout/DashboardLayout';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Emergency'] as const;

export function PayrollSettingsView() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const canView = user?.role === 'Admin' || user?.role === 'HR';

  const now = new Date();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDefaultInUse, setIsDefaultInUse] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [availableComponents, setAvailableComponents] = useState<
    Array<{ code: string; name: string; category: string }>
  >([]);
  const [inspectedVersionNum, setInspectedVersionNum] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [verSearch, setVerSearch] = useState('');
  const [verBasisFilter, setVerBasisFilter] = useState('all');
  const [verSortKey, setVerSortKey] = useState('version');
  const [verSortDir, setVerSortDir] = useState<SortDir>('desc');

  // Sample inputs for live Example calculator box
  const [sampleBasic, setSampleBasic] = useState<string>('20000');
  const [sampleGross, setSampleGross] = useState<string>('30000');

  // Form state
  const [form, setForm] = useState({
    effective_from_month: now.getMonth() + 1,
    effective_from_year: now.getFullYear(),
    absence_deduction_basis: 'gross' as 'gross' | 'basic' | 'selected_components',
    selected_component_codes: ['BASIC'] as string[],
    days_basis: 'fixed_30' as 'fixed_30' | 'calendar' | 'working_days',
    working_days_per_month: 26,
    half_day_hours_threshold: 4,
    grace_minutes: 10,
    late_rule_enabled: true,
    late_count_per_absent: 3,
    extra_late_fixed_fine: 0,
    sandwich_rule_enabled: false,
    paid_leave_types: ['Casual', 'Sick', 'Earned', 'Emergency'] as string[],
    overtime_basis: 'basic' as 'basic' | 'gross',
    overtime_multiplier: 2,
    overtime_hours_per_day: 8,
    prorate_mid_month: true,
    rounding_mode: 'nearest_taka' as 'nearest_taka' | 'exact_paisa',
    notes: '',
  });

  const applySnapshotToForm = (s: any) => {
    if (!s) return;
    setForm({
      effective_from_month: s.effective_from_month || now.getMonth() + 1,
      effective_from_year: s.effective_from_year || now.getFullYear(),
      absence_deduction_basis: s.absence_deduction_basis || 'gross',
      selected_component_codes: s.selected_component_codes?.length
        ? s.selected_component_codes
        : ['BASIC'],
      days_basis: s.days_basis === '30' ? 'fixed_30' : s.days_basis || 'fixed_30',
      working_days_per_month: s.working_days_per_month || 26,
      half_day_hours_threshold: s.half_day_hours_threshold ?? 4,
      grace_minutes: s.grace_minutes ?? 10,
      late_rule_enabled: s.late_rule_enabled !== false,
      late_count_per_absent: s.late_count_per_absent || 3,
      extra_late_fixed_fine: s.extra_late_fixed_fine || 0,
      sandwich_rule_enabled: Boolean(s.sandwich_rule_enabled),
      paid_leave_types: (s.paid_leave_types || ['Casual', 'Sick', 'Earned', 'Emergency']).filter(
        (t: string) => t !== 'Unpaid'
      ),
      overtime_basis: s.overtime_basis || 'basic',
      overtime_multiplier: s.overtime_multiplier || 2,
      overtime_hours_per_day: s.overtime_hours_per_day || 8,
      prorate_mid_month: s.prorate_mid_month !== false,
      rounding_mode: s.rounding_mode || 'nearest_taka',
      notes: '',
    });
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      const qs = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const vParam = qs?.get('version');
      const res = await fetch(`/api/payroll/settings${vParam ? `?version=${vParam}` : ''}`);
      const json = await res.json();
      if (json.success && json.data) {
        setIsDefaultInUse(Boolean(json.data.isDefaultInUse));
        setVersions(json.data.versions || []);
        setAvailableComponents(json.data.availableComponents || []);
        const target = json.data.inspectedVersion || json.data.activeSettings;
        if (json.data.inspectedVersion) {
          setInspectedVersionNum(json.data.inspectedVersion.version);
        }
        applySnapshotToForm(target);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  // Live Example Preview using our exact calculation engine
  const examplePreview = useMemo(() => {
    const basicVal = Math.max(0, Number(sampleBasic) || 0);
    const grossVal = Math.max(basicVal, Number(sampleGross) || 0);
    const allowanceRest = Math.max(0, grossVal - basicVal);

    const mockRules = [
      {
        name: 'Basic Salary',
        code: 'BASIC',
        category: 'BASIC' as const,
        type: 'fixed' as const,
        amount_or_percentage: basicVal,
        sequence: 10,
        active: true,
      },
      ...(allowanceRest > 0
        ? [
            {
              name: 'Allowances (HRA / Med / Conv)',
              code: 'HRA',
              category: 'ALLOWANCE' as const,
              type: 'fixed' as const,
              amount_or_percentage: allowanceRest,
              sequence: 20,
              active: true,
            },
          ]
        : []),
    ];

    const settingsSnap: PayrollSettingsSnapshot = {
      version: 999,
      effective_from_month: form.effective_from_month,
      effective_from_year: form.effective_from_year,
      absence_deduction_basis: form.absence_deduction_basis,
      selected_component_codes: form.selected_component_codes,
      days_basis: form.days_basis,
      working_days_per_month: form.working_days_per_month,
      half_day_hours_threshold: form.half_day_hours_threshold,
      grace_minutes: form.grace_minutes,
      late_rule_enabled: form.late_rule_enabled,
      late_count_per_absent: form.late_count_per_absent,
      extra_late_fixed_fine: form.extra_late_fixed_fine,
      sandwich_rule_enabled: form.sandwich_rule_enabled,
      paid_leave_types: form.paid_leave_types as any,
      overtime_basis: form.overtime_basis,
      overtime_multiplier: form.overtime_multiplier,
      overtime_hours_per_day: form.overtime_hours_per_day,
      prorate_mid_month: form.prorate_mid_month,
      rounding_mode: form.rounding_mode,
    };

    const m = form.effective_from_month || 11;
    const y = form.effective_from_year || 2026;
    const baseInput = {
      month: m,
      year: y,
      settings: settingsSnap,
      contractBasic: basicVal,
      rules: mockRules,
      contractStart: new Date(Date.UTC(y - 1, 0, 1)),
      monthlyInput: {},
    };

    const abs1 = calculatePayslipPure({
      ...baseInput,
      attendance: {
        presentDays: 25,
        absentDays: 1,
        lateDays: 0,
        halfDays: 0,
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
        attendanceOvertimeHours: 0,
      },
    });
    const half1 = calculatePayslipPure({
      ...baseInput,
      attendance: {
        presentDays: 25,
        absentDays: 0,
        lateDays: 0,
        halfDays: 1,
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
        attendanceOvertimeHours: 0,
      },
    });
    const late3 = calculatePayslipPure({
      ...baseInput,
      attendance: {
        presentDays: 23,
        absentDays: 0,
        lateDays: 3,
        halfDays: 0,
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
        attendanceOvertimeHours: 0,
      },
    });

    return {
      absentLine: abs1.lines.find((l) => l.code === 'ABSDED'),
      halfLine: half1.lines.find((l) => l.code === 'HALFDED'),
      lateLine: late3.lines.find((l) => l.code === 'LATEDED'),
      dailyRate: abs1.per_day_rate,
    };
  }, [form, sampleBasic, sampleGross]);

  if (!canView) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-600">
        Only Admin and HR can view Payroll Settings.
      </div>
    );
  }

  const toggleCode = (code: string) => {
    setForm((prev) => {
      const exists = prev.selected_component_codes.includes(code);
      return {
        ...prev,
        selected_component_codes: exists
          ? prev.selected_component_codes.filter((c) => c !== code)
          : [...prev.selected_component_codes, code],
      };
    });
  };

  const toggleLeaveType = (lt: string) => {
    setForm((prev) => {
      const exists = prev.paid_leave_types.includes(lt);
      return {
        ...prev,
        paid_leave_types: exists
          ? prev.paid_leave_types.filter((x) => x !== lt)
          : [...prev.paid_leave_types, lt],
      };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);

    if (form.absence_deduction_basis === 'selected_components' && form.selected_component_codes.length === 0) {
      setBanner({ type: 'err', msg: 'Select at least one salary component when using Selected Components basis.' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/payroll/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to save Payroll Settings');
      }
      setInspectedVersionNum(json.data.version);
      setBanner({ type: 'ok', msg: json.message });
      await loadSettings();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-slate-700" />
            <span>Payroll Calculation Settings</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Versioned deduction, proration, leave, sandwich &amp; overtime rules. Saving creates a new effective-dated version; Confirmed runs remain locked.
          </p>
        </div>

        <button
          type="button"
          onClick={loadSettings}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Notices */}
      {isDefaultInUse && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Default payroll settings are in use. Review them.</strong> Save a version below once confirmed with HR / management.
          </span>
        </div>
      )}

      {!isAdmin && (
        <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs flex items-center gap-2">
          <Lock className="w-4 h-4 text-slate-500 shrink-0" />
          <span>HR View-Only Mode: Only Admin can modify and publish new Payroll Settings versions.</span>
        </div>
      )}

      <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-blue-900 text-xs flex items-start gap-2">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <span>
          <strong>Compliance Note:</strong> All rules below (including the 2x overtime multiplier, grace minutes, and paid leave exemptions) are configurable defaults rather than fixed legal mandates. Confirm them with HR or a labour lawyer before confirming payroll runs.
        </span>
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
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{banner.msg}</span>
        </div>
      )}

      {/* Live Example Calculator Box */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold">Live Example Impact Preview</h2>
              <p className="text-[11px] text-slate-400">
                Test how your current form settings affect deductions before saving a new version.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5">
              <span className="text-slate-300">Sample Basic:</span>
              <input
                type="number"
                value={sampleBasic}
                onChange={(e) => setSampleBasic(e.target.value)}
                className="w-24 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-white font-mono text-right"
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-slate-300">Sample Gross:</span>
              <input
                type="number"
                value={sampleGross}
                onChange={(e) => setSampleGross(e.target.value)}
                className="w-24 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-white font-mono text-right"
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase">1 Absent Day Cut</span>
            <p className="text-xl font-bold font-mono text-rose-400 mt-1">
              {formatBDT(examplePreview.absentLine?.amount || 0)}
            </p>
            <p className="text-[11px] text-slate-300 mt-1">
              {examplePreview.absentLine?.calculation_note || 'No deduction'}
            </p>
          </div>

          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase">1 Half Day Cut</span>
            <p className="text-xl font-bold font-mono text-amber-400 mt-1">
              {formatBDT(examplePreview.halfLine?.amount || 0)}
            </p>
            <p className="text-[11px] text-slate-300 mt-1">
              {examplePreview.halfLine?.calculation_note || 'No deduction'}
            </p>
          </div>

          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase">3 Late Days Cut</span>
            <p className="text-xl font-bold font-mono text-purple-300 mt-1">
              {formatBDT(examplePreview.lateLine?.amount || 0)}
            </p>
            <p className="text-[11px] text-slate-300 mt-1">
              {examplePreview.lateLine?.calculation_note ||
                (form.late_rule_enabled
                  ? 'Below late penalty threshold'
                  : 'Late rule switched off')}
            </p>
          </div>
        </div>
      </div>

      {/* Settings Form */}
      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Card 1: Deduction & Days Basis */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              1. Daily Rate &amp; Deduction Basis
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Absence Deduction Basis
              </label>
              <select
                disabled={!isAdmin}
                value={form.absence_deduction_basis}
                onChange={(e) =>
                  setForm({ ...form, absence_deduction_basis: e.target.value as any })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
              >
                <option value="gross">Monthly Gross Salary (Default)</option>
                <option value="basic">Basic Salary Only</option>
                <option value="selected_components">Selected Salary Components</option>
              </select>
            </div>

            {form.absence_deduction_basis === 'selected_components' && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <span className="text-[11px] font-semibold text-slate-700 block">
                  Select Salary Structure Components *
                </span>
                <div className="flex flex-wrap gap-2">
                  {availableComponents.map((c) => (
                    <label
                      key={c.code}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-300 text-xs cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        disabled={!isAdmin}
                        checked={form.selected_component_codes.includes(c.code)}
                        onChange={() => toggleCode(c.code)}
                      />
                      <span className="font-mono font-bold">{c.code}</span>
                      <span className="text-slate-500">({c.name})</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Days Basis for Daily Rate
                </label>
                <select
                  disabled={!isAdmin}
                  value={form.days_basis}
                  onChange={(e) => setForm({ ...form, days_basis: e.target.value as any })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
                >
                  <option value="fixed_30">Fixed 30 Days (Default)</option>
                  <option value="calendar">Calendar Days (28–31)</option>
                  <option value="working_days">Custom Working Days</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Working Days / Month (20–31)
                </label>
                <input
                  type="number"
                  min={20}
                  max={31}
                  disabled={!isAdmin || form.days_basis !== 'working_days'}
                  value={form.working_days_per_month}
                  onChange={(e) =>
                    setForm({ ...form, working_days_per_month: Number(e.target.value) || 26 })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rounding Rule
                </label>
                <select
                  disabled={!isAdmin}
                  value={form.rounding_mode}
                  onChange={(e) => setForm({ ...form, rounding_mode: e.target.value as any })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
                >
                  <option value="nearest_taka">Nearest Taka (Default)</option>
                  <option value="exact_paisa">Exact 2-Decimal Paisa</option>
                </select>
              </div>
              <div className="flex items-end pb-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={form.prorate_mid_month}
                    onChange={(e) => setForm({ ...form, prorate_mid_month: e.target.checked })}
                  />
                  <span>Prorate mid-month joiner / leaver</span>
                </label>
              </div>
            </div>
          </div>

          {/* Card 2: Half-Day, Late & Sandwich */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              2. Half-Day, Late, Grace &amp; Sandwich Rules
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Half-Day Below Hours
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={0.5}
                  max={12}
                  disabled={!isAdmin}
                  value={form.half_day_hours_threshold}
                  onChange={(e) =>
                    setForm({ ...form, half_day_hours_threshold: Number(e.target.value) || 4 })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
                />
                <p className="text-[11px] text-slate-400 mt-0.5">Deducts 0.5 × daily rate</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Grace Period (Minutes)
                </label>
                <input
                  type="number"
                  min={0}
                  disabled={!isAdmin}
                  value={form.grace_minutes}
                  onChange={(e) =>
                    setForm({ ...form, grace_minutes: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={form.late_rule_enabled}
                  onChange={(e) => setForm({ ...form, late_rule_enabled: e.target.checked })}
                />
                <span>Enable Late-to-Absent Conversion Rule</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Late Days = 1 Absent
                  </label>
                  <input
                    type="number"
                    min={1}
                    disabled={!isAdmin || !form.late_rule_enabled}
                    value={form.late_count_per_absent}
                    onChange={(e) =>
                      setForm({ ...form, late_count_per_absent: Number(e.target.value) || 3 })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Fixed Fine / Extra Late (৳)
                  </label>
                  <input
                    type="number"
                    min={0}
                    disabled={!isAdmin || !form.late_rule_enabled}
                    value={form.extra_late_fixed_fine}
                    onChange={(e) =>
                      setForm({ ...form, extra_late_fixed_fine: Number(e.target.value) || 0 })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                  />
                </div>
              </div>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={form.sandwich_rule_enabled}
                onChange={(e) => setForm({ ...form, sandwich_rule_enabled: e.target.checked })}
                className="mt-0.5"
              />
              <span className="text-xs">
                <strong className="text-slate-800 block">Sandwich Rule</strong>
                <span className="text-slate-500">
                  Absence on both sides of a weekly off or holiday counts the intervening off day(s) as absent.
                </span>
              </span>
            </label>
          </div>

          {/* Card 3: Overtime & Paid Leaves */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              3. Paid Leaves &amp; Overtime Calculation
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Paid Leave Types (Never Deducted)
              </label>
              <div className="flex flex-wrap gap-2">
                {LEAVE_TYPES.map((lt) => (
                  <label
                    key={lt}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs cursor-pointer ${
                      form.paid_leave_types.includes(lt)
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={!isAdmin}
                      checked={form.paid_leave_types.includes(lt)}
                      onChange={() => toggleLeaveType(lt)}
                    />
                    <span>{lt}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Checked leave types carry 0 deduction. Unchecked types &amp; &quot;Unpaid&quot; leave are deducted like absence.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Overtime Basis
                </label>
                <select
                  disabled={!isAdmin}
                  value={form.overtime_basis}
                  onChange={(e) => setForm({ ...form, overtime_basis: e.target.value as any })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
                >
                  <option value="basic">Basic (Default)</option>
                  <option value="gross">Gross</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Multiplier
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={0.5}
                  disabled={!isAdmin}
                  value={form.overtime_multiplier}
                  onChange={(e) =>
                    setForm({ ...form, overtime_multiplier: Number(e.target.value) || 2 })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Hours / Day
                </label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  disabled={!isAdmin}
                  value={form.overtime_hours_per_day}
                  onChange={(e) =>
                    setForm({ ...form, overtime_hours_per_day: Number(e.target.value) || 8 })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Card 4: Versioning & Save */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                4. Effective From &amp; Version Publish
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Effective From Month *
                  </label>
                  <select
                    disabled={!isAdmin}
                    value={form.effective_from_month}
                    onChange={(e) =>
                      setForm({ ...form, effective_from_month: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
                  >
                    {MONTHS.map((m, idx) => (
                      <option key={m} value={idx + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Effective From Year *
                  </label>
                  <select
                    disabled={!isAdmin}
                    value={form.effective_from_year}
                    onChange={(e) =>
                      setForm({ ...form, effective_from_year: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
                  >
                    {[2025, 2026, 2027, 2028].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Change Note (Audit Log)
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  placeholder="e.g. Updated absence basis to Basic per Nov 2026 policy"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
                />
              </div>
            </div>

            {isAdmin && (
              <button
                type="submit"
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>
                  {saving ? 'Saving New Version...' : 'Save as New Settings Version'}
                </span>
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Version History Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-600" />
          <h3 className="text-xs font-bold text-slate-700 uppercase">
            Settings Version History ({versions.length})
          </h3>
        </div>
        {(() => {
          const filteredVersions = sortTableItems(
            versions.filter((v) => {
              if (verBasisFilter !== 'all' && v.days_basis !== verBasisFilter) return false;
              return matchesSearch(verSearch, [
                `v${v.version}`,
                MONTHS[(v.effective_from_month || 1) - 1],
                String(v.effective_from_year || ''),
                v.absence_deduction_basis,
                v.days_basis,
                v.overtime_basis,
                v.updated_by,
              ]);
            }),
            verSortKey,
            verSortDir,
            {
              version: (v) => Number(v.version || 0),
              effective: (v) => (v.effective_from_year || 0) * 100 + (v.effective_from_month || 0),
              updated_by: (v) => v.updated_by || '',
              created: (v) => (v.createdAt ? new Date(v.createdAt).getTime() : 0),
            }
          );
          return (
            <>
              <div className="p-3 border-b border-slate-100 bg-slate-50/40">
                <TableToolbar
                  search={verSearch}
                  onSearchChange={setVerSearch}
                  searchPlaceholder="Search version, month, rule basis or user..."
                  sortKey={verSortKey}
                  sortDir={verSortDir}
                  onSortChange={(k, d) => {
                    setVerSortKey(k);
                    setVerSortDir(d);
                  }}
                  sortOptions={[
                    { value: 'version', label: 'Version #' },
                    { value: 'effective', label: 'Effective From' },
                    { value: 'updated_by', label: 'Saved By' },
                    { value: 'created', label: 'Saved Date' },
                  ]}
                  filters={
                    <select
                      value={verBasisFilter}
                      onChange={(e) => setVerBasisFilter(e.target.value)}
                      className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
                    >
                      <option value="all">All Days Basis</option>
                      <option value="fixed_30">fixed_30</option>
                      <option value="calendar">calendar</option>
                      <option value="working_days">working_days</option>
                    </select>
                  }
                  totalCount={versions.length}
                  filteredCount={filteredVersions.length}
                  hasActiveFilters={verSearch !== '' || verBasisFilter !== 'all'}
                  onReset={() => {
                    setVerSearch('');
                    setVerBasisFilter('all');
                  }}
                  onExportExcel={() =>
                    downloadExcel({
                      filename: 'Payroll-Settings-Versions',
                      sheetName: 'SettingsVersions',
                      headers: ['Version', 'Effective From', 'Absence Basis', 'Days Basis', 'Late / Grace / Sandwich', 'Overtime', 'Saved By', 'Saved Date'],
                      rows: filteredVersions.map((v) => [
                        `v${v.version}`,
                        `${MONTHS[(v.effective_from_month || 1) - 1]} ${v.effective_from_year}`,
                        v.absence_deduction_basis || '',
                        v.days_basis || '',
                        `${v.late_rule_enabled ? `${v.late_count_per_absent}=1d` : 'Off'} / ${v.grace_minutes}m / ${v.sandwich_rule_enabled ? 'On' : 'Off'}`,
                        `${v.overtime_basis} x ${v.overtime_multiplier}x (${v.overtime_hours_per_day}h/d)`,
                        v.updated_by || '',
                        formatDateDMY(v.createdAt),
                      ]),
                    })
                  }
                  onPrint={() =>
                    printTableReport({
                      title: 'Payroll Settings Version History',
                      meta: `Versions: ${filteredVersions.length}`,
                      headers: ['Version', 'Effective From', 'Absence / Days', 'Late / Grace / Sandwich', 'Overtime', 'Saved By / Date'],
                      rows: filteredVersions.map((v) => [
                        `v${v.version}`,
                        `${MONTHS[(v.effective_from_month || 1) - 1]} ${v.effective_from_year}`,
                        `${v.absence_deduction_basis} / ${v.days_basis}`,
                        `${v.late_rule_enabled ? `${v.late_count_per_absent}=1d` : 'Off'} • ${v.grace_minutes}m • Sandwich ${v.sandwich_rule_enabled ? 'On' : 'Off'}`,
                        `${v.overtime_basis} x ${v.overtime_multiplier}x`,
                        `${v.updated_by} · ${formatDateDMY(v.createdAt)}`,
                      ]),
                      landscape: true,
                    })
                  }
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-2.5">Version</th>
                      <th className="px-4 py-2.5">Effective From</th>
                      <th className="px-4 py-2.5">Absence / Days</th>
                      <th className="px-4 py-2.5">Late / Grace / Sandwich</th>
                      <th className="px-4 py-2.5">Overtime</th>
                      <th className="px-4 py-2.5">Saved By / Date</th>
                      <th className="px-4 py-2.5 text-right">Load</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredVersions.map((v) => (
                      <tr
                        key={v._id}
                        className={
                          inspectedVersionNum === v.version ? 'bg-blue-50/60' : 'hover:bg-slate-50/70'
                        }
                      >
                        <td className="px-4 py-2.5 font-mono font-bold">
                          v{v.version}{' '}
                          {v.is_default_seeded && <Badge variant="warning">Default</Badge>}
                        </td>
                        <td className="px-4 py-2.5 font-semibold">
                          {MONTHS[(v.effective_from_month || 1) - 1]} {v.effective_from_year}
                        </td>
                        <td className="px-4 py-2.5">
                          {v.absence_deduction_basis} / {v.days_basis}
                          {v.days_basis === 'working_days' ? ` (${v.working_days_per_month})` : ''}
                        </td>
                        <td className="px-4 py-2.5">
                          {v.late_rule_enabled ? `${v.late_count_per_absent}=1d` : 'Off'} • Grace{' '}
                          {v.grace_minutes}m • Sandwich {v.sandwich_rule_enabled ? 'On' : 'Off'}
                        </td>
                        <td className="px-4 py-2.5">
                          {v.overtime_basis} × {v.overtime_multiplier}x ({v.overtime_hours_per_day}h/d)
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {v.updated_by} · {formatDateDMY(v.createdAt)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setInspectedVersionNum(v.version);
                              applySnapshotToForm(v);
                            }}
                            className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

