'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FolderKanban,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  Banknote,
  RotateCcw,
  AlertTriangle,
  AlertCircle,
  Download,
  FileSpreadsheet,
  Users,
  Eye,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { formatBDT, formatDateDMY, EMPLOYEE_DEPARTMENTS } from '@/lib/formatters';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { TableToolbar } from '@/components/ui/TableToolbar';
import { downloadExcel, matchesSearch, printTableReport, sortTableItems, SortDir } from '@/lib/client-export';
import { useAuth } from '@/components/layout/DashboardLayout';
import { PayslipsDesk } from '@/components/payroll/PayslipsDesk';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STAFF_ROLES = ['Admin', 'HR', 'Accountant', 'Viewer'];
const RUN_STEPS = ['Draft', 'Verified', 'Confirmed', 'Paid'] as const;

function DeltaBadge({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) {
    return <span className="text-[11px] text-slate-400">No prior month run</span>;
  }
  const positive = pct >= 0;
  return (
    <span
      className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
        positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
      }`}
    >
      {positive ? '+' : ''}
      {pct}% vs last month
    </span>
  );
}

export function PayrollRunsView() {
  const { user } = useAuth();
  const role = user?.role || 'Viewer';
  const isStaff = STAFF_ROLES.includes(role);
  const canGenerateOrVerify = role === 'Admin' || role === 'HR';
  const canConfirmOrReverse = role === 'Admin';
  const canPay = role === 'Admin' || role === 'Accountant';

  const now = new Date();
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [activeRunData, setActiveRunData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Generate Run Dialog
  const [isGenOpen, setIsGenOpen] = useState(false);
  const [genForm, setGenForm] = useState({
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    branch: 'Main',
    department: 'all',
    include_no_attendance: false,
    name: '',
  });
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [genError, setGenError] = useState('');

  // Confirm / Reverse Modals
  const [confirmModalAction, setConfirmModalAction] = useState<'confirm' | 'reverse' | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [modalError, setModalError] = useState('');

  // Run Payslips Table Search / Filter / Sort
  const [slipSearch, setSlipSearch] = useState('');
  const [slipDeptFilter, setSlipDeptFilter] = useState('all');
  const [slipStatusFilter, setSlipStatusFilter] = useState('all');
  const [slipSortKey, setSlipSortKey] = useState('payslip_no');
  const [slipSortDir, setSlipSortDir] = useState<SortDir>('asc');

  const loadRuns = async (preferRunId?: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/payroll/batches');
      const json = await res.json();
      if (json.success) {
        const list = json.data || [];
        setRuns(list);
        const targetId = preferRunId || selectedRunId || list[0]?._id || '';
        if (targetId && list.some((r: any) => r._id === targetId)) {
          setSelectedRunId(targetId);
          await loadRunDetail(targetId);
        } else if (list[0]) {
          setSelectedRunId(list[0]._id);
          await loadRunDetail(list[0]._id);
        } else {
          setSelectedRunId('');
          setActiveRunData(null);
        }
      }
    } catch (err) {
      console.error('Failed to load payroll runs:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRunDetail = async (id: string) => {
    if (!id) return;
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/payroll/batches/${id}`);
      const json = await res.json();
      if (json.success) {
        setActiveRunData(json.data);
      }
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (isStaff) loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff]);

  // Live preview count inside Generate Dialog
  const fetchPreviewCount = async (formState = genForm) => {
    setPreviewLoading(true);
    setGenError('');
    try {
      const res = await fetch('/api/payroll/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formState, previewOnly: true }),
      });
      const json = await res.json();
      if (json.success) setPreviewData(json.data);
      else setPreviewData(null);
    } catch {
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (isGenOpen) {
      fetchPreviewCount(genForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isGenOpen,
    genForm.month,
    genForm.year,
    genForm.branch,
    genForm.department,
    genForm.include_no_attendance,
  ]);

  if (!isStaff) {
    return <PayslipsDesk />;
  }

  const handleGenerateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction(true);
    setGenError('');
    setBanner(null);
    try {
      const res = await fetch('/api/payroll/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...genForm, previewOnly: false }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to generate payroll run');
      }
      setIsGenOpen(false);
      setBanner({ type: 'ok', msg: json.message });
      await loadRuns(json.data?._id);
    } catch (err: any) {
      setGenError(err.message);
    } finally {
      setBusyAction(false);
    }
  };

  const executeRunAction = async (
    action: 'recalculate' | 'verify' | 'confirm' | 'pay' | 'reverse',
    extraPayload: Record<string, any> = {}
  ) => {
    if (!activeRunData?.batch?._id) return;
    setBusyAction(true);
    setModalError('');
    setBanner(null);
    try {
      const res = await fetch(`/api/payroll/batches/${activeRunData.batch._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extraPayload }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || `Action "${action}" failed`);
      }
      setConfirmModalAction(null);
      setReverseReason('');
      setBanner({ type: 'ok', msg: json.message });
      await loadRuns(activeRunData.batch._id);
    } catch (err: any) {
      if (confirmModalAction) setModalError(err.message);
      else setBanner({ type: 'err', msg: err.message });
    } finally {
      setBusyAction(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Paid':
        return <Badge variant="success">Paid</Badge>;
      case 'Confirmed':
        return <Badge variant="info">Confirmed</Badge>;
      case 'Verified':
        return <Badge variant="purple">Verified</Badge>;
      case 'Reversed':
      case 'Cancelled':
        return <Badge variant="danger">{status}</Badge>;
      default:
        return <Badge variant="warning">Draft</Badge>;
    }
  };

  const run = activeRunData?.batch || null;
  const runPayslips = activeRunData?.payslips || [];
  const deltas = activeRunData?.deltas || null;
  const warnings = run?.warnings || [];
  const skipped = run?.skipped_employees || [];
  const currentStepIdx = run ? RUN_STEPS.indexOf(run.status as any) : -1;

  const filteredRunPayslips = sortTableItems(
    runPayslips.filter((p: any) => {
      const dept = p.employee_id?.department || '';
      if (slipDeptFilter !== 'all' && dept !== slipDeptFilter) return false;
      if (slipStatusFilter !== 'all' && p.status !== slipStatusFilter) return false;
      return matchesSearch(slipSearch, [
        p.payslip_no,
        p.employee_id?.firstName,
        p.employee_id?.lastName,
        p.employee_id?.employee_id,
        dept,
        p.status,
      ]);
    }),
    slipSortKey,
    slipSortDir,
    {
      payslip_no: (p: any) => p.payslip_no || '',
      employee: (p: any) => `${p.employee_id?.firstName || ''} ${p.employee_id?.lastName || ''}`.trim(),
      department: (p: any) => p.employee_id?.department || '',
      gross: (p: any) => Number(p.gross_pay || 0),
      deductions: (p: any) => Number(p.total_deductions || 0),
      net: (p: any) => Number(p.net_pay || 0),
      status: (p: any) => p.status || '',
    }
  );

  const exportRunPayslipsExcel = () => {
    if (!run) return;
    downloadExcel({
      filename: `Payroll-Run-${run.batch_code || 'Payslips'}`,
      sheetName: run.batch_code || 'PayrollRun',
      headers: [
        'Payslip No',
        'Employee ID',
        'Employee Name',
        'Department',
        'Days',
        'OT Hours',
        'Gross Pay (BDT)',
        'Deductions (BDT)',
        'Net Pay (BDT)',
        'Status',
      ],
      rows: filteredRunPayslips.map((p: any) => [
        p.payslip_no || '',
        p.employee_id?.employee_id || '',
        `${p.employee_id?.firstName || ''} ${p.employee_id?.lastName || ''}`.trim(),
        p.employee_id?.department || '',
        `${p.prorated_days || p.days_in_month || 0}/${p.days_in_month || 0}`,
        Number(p.inputs_snapshot?.overtime_hours || 0),
        Number(p.gross_pay || 0),
        Number(p.total_deductions || 0),
        Number(p.net_pay || 0),
        p.status || '',
      ]),
    });
  };

  const printRunPayslipsReport = () => {
    if (!run) return;
    const totalGross = filteredRunPayslips.reduce((s: number, p: any) => s + Number(p.gross_pay || 0), 0);
    const totalDed = filteredRunPayslips.reduce((s: number, p: any) => s + Number(p.total_deductions || 0), 0);
    const totalNet = filteredRunPayslips.reduce((s: number, p: any) => s + Number(p.net_pay || 0), 0);
    printTableReport({
      title: `Payroll Run — ${run.batch_code} (${run.name})`,
      subtitle: `${MONTHS[(run.month || 1) - 1]} ${run.year} · Status: ${run.status}`,
      meta: `Rows: ${filteredRunPayslips.length} | Gross: ${formatBDT(totalGross)} | Net: ${formatBDT(totalNet)}`,
      headers: ['Payslip #', 'Emp ID', 'Employee', 'Department', 'Days / OT', 'Gross Pay', 'Deductions', 'Net Pay', 'Status'],
      rows: filteredRunPayslips.map((p: any) => [
        p.payslip_no || '',
        p.employee_id?.employee_id || '',
        `${p.employee_id?.firstName || ''} ${p.employee_id?.lastName || ''}`.trim(),
        p.employee_id?.department || '',
        `${p.prorated_days || p.days_in_month || 0}/${p.days_in_month || 0}d${p.inputs_snapshot?.overtime_hours > 0 ? ` (${p.inputs_snapshot.overtime_hours}h OT)` : ''}`,
        formatBDT(p.gross_pay || 0),
        formatBDT(p.total_deductions || 0),
        formatBDT(p.net_pay || 0),
        p.status || '',
      ]),
      rightAlignCols: [5, 6, 7],
      summaryRow: ['TOTAL', '', `${filteredRunPayslips.length} Payslips`, '', '', formatBDT(totalGross), formatBDT(totalDed), formatBDT(totalNet), ''],
      landscape: true,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Payroll Runs</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            One-click monthly batch payroll generation, anomaly checks, verification, confirmation, and disbursement.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canGenerateOrVerify && (
            <button
              type="button"
              onClick={() => {
                setGenError('');
                setIsGenOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
            >
              <Sparkles className="w-4 h-4" />
              <span>Generate Payroll Run</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => loadRuns(selectedRunId)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || detailLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
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

      {loading ? (
        <div className="space-y-4">
          <div className="h-24 bg-slate-100 rounded-xl animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
        </div>
      ) : runs.length === 0 ? (
        /* Empty State */
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-700">
            <FolderKanban className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">No Payroll Runs Yet</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Start a monthly Payroll Run to generate Draft payslips in one click for all active employees with contracts, attendance, and monthly inputs.
          </p>
          {canGenerateOrVerify && (
            <button
              type="button"
              onClick={() => setIsGenOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              <Sparkles className="w-4 h-4" />
              <span>Generate First Payroll Run</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Clean Full-Width Run Selector & Next-Step Bar */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0">
                Payroll Run ({runs.length}):
              </span>
              <select
                value={selectedRunId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedRunId(nextId);
                  loadRunDetail(nextId);
                }}
                className="min-w-[260px] max-w-md px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
              >
                {runs.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.batch_code} — {r.name} ({r.status} · {r.payslip_count} emp · {formatBDT(r.total_net_pay)})
                  </option>
                ))}
              </select>

              {runs.length > 1 && (
                <div className="hidden xl:flex items-center gap-1.5">
                  {runs.slice(0, 3).map((r) => {
                    const active = r._id === selectedRunId;
                    return (
                      <button
                        key={r._id}
                        type="button"
                        onClick={() => {
                          setSelectedRunId(r._id);
                          loadRunDetail(r._id);
                        }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                          active
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {r.batch_code}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {run && (
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 shrink-0">
                <span className="font-semibold text-slate-700">Next Step:</span>
                <span>
                  {run.status === 'Draft'
                    ? 'Review anomalies or Recalculate, then Verify Run.'
                    : run.status === 'Verified'
                      ? 'Admin confirms & locks run before payment.'
                      : run.status === 'Confirmed'
                        ? 'Download Bank Sheet & Mark as Paid.'
                        : run.status === 'Paid'
                          ? 'Disbursement completed.'
                          : 'Reversed audit record.'}
                </span>
              </div>
            )}
          </div>

          {/* Full-Width Active Run Workspace */}
          {run && (
            <div className="space-y-4">
              {/* Calm Header + Connected Progress Stepper */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {run.batch_code}
                      </span>
                      {getStatusBadge(run.status)}
                      <Link
                        href={`/payroll/settings?version=${run.settings_version || 1}`}
                        className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                        title="View exact Payroll Settings version snapshot used for this run"
                      >
                        Settings v{run.settings_version || 1} ↗
                      </Link>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 mt-1.5">{run.name}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Branch: {run.branch || 'Main'} · Days:{' '}
                      {run.days_basis === 'fixed_30' || run.days_basis === '30'
                        ? 'Fixed 30'
                        : run.days_basis === 'working_days'
                          ? `Working ${run.settings_snapshot?.working_days_per_month || 26}`
                          : 'Calendar'}{' '}
                      · OT {run.overtime_multiplier || 2}x
                    </p>
                  </div>

                  {/* Status-Driven Role Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {run.status === 'Draft' && canGenerateOrVerify && (
                      <>
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => executeRunAction('recalculate')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${busyAction ? 'animate-spin' : ''}`} />
                          Recalculate All
                        </button>
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => executeRunAction('verify')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-xs disabled:opacity-50"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Verify Run
                        </button>
                      </>
                    )}

                    {run.status === 'Verified' && canConfirmOrReverse && (
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => {
                          setModalError('');
                          setConfirmModalAction('confirm');
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Confirm Run (Lock)
                      </button>
                    )}

                    {(run.status === 'Confirmed' || run.status === 'Paid') && role !== 'Viewer' && (
                      <>
                        <a
                          href={`/api/payroll/batches/${run._id}?export=bank_csv`}
                          className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Bank CSV
                        </a>
                        <a
                          href={`/api/payroll/batches/${run._id}?export=bank_xlsx`}
                          className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          Bank Excel
                        </a>
                      </>
                    )}

                    {run.status === 'Confirmed' && (
                      <Link
                        href="/accounts/payroll"
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
                      >
                        <Banknote className="w-3.5 h-3.5" />
                        {canPay ? 'Disburse in Accounts →' : 'Awaiting Accounts Disbursement'}
                      </Link>
                    )}

                    {run.status === 'Confirmed' && canConfirmOrReverse && (
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => {
                          setModalError('');
                          setConfirmModalAction('reverse');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reverse
                      </button>
                    )}
                  </div>
                </div>

                {/* Clean Connected Progress Stepper */}
                {run.status === 'Reversed' || run.status === 'Cancelled' ? (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>
                      <strong>{run.is_reversal ? 'Reversal Record' : `Run ${run.status}`}:</strong>{' '}
                      {run.reversal_reason || 'This payroll run has been reversed with full audit history.'}{' '}
                      {run.reversed_at ? `(${formatDateDMY(run.reversed_at)} by ${run.reversed_by})` : ''}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 overflow-x-auto">
                    {RUN_STEPS.map((step, idx) => {
                      const done = currentStepIdx >= idx;
                      const current = currentStepIdx === idx;
                      return (
                        <React.Fragment key={step}>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center ${
                                current
                                  ? 'bg-slate-900 text-white'
                                  : done
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-100 text-slate-400 border border-slate-200'
                              }`}
                            >
                              {done && !current ? '✓' : idx + 1}
                            </span>
                            <span
                              className={`text-xs ${
                                current
                                  ? 'font-bold text-slate-900'
                                  : done
                                    ? 'font-semibold text-emerald-700'
                                    : 'text-slate-400'
                              }`}
                            >
                              {step}
                            </span>
                          </div>
                          {idx < RUN_STEPS.length - 1 && (
                            <div
                              className={`flex-1 h-0.5 min-w-[20px] rounded ${
                                currentStepIdx > idx ? 'bg-emerald-500' : 'bg-slate-200'
                              }`}
                            />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}

                {(run.status === 'Confirmed' || run.status === 'Paid') && (
                  <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      Payslips locked on {formatDateDMY(run.confirmed_at)} by {run.confirmed_by || 'Admin'}.
                    </span>
                    {run.status === 'Paid' && (
                      <span className="font-semibold text-emerald-700">
                        · Paid via {run.payment_method} on {formatDateDMY(run.payment_date)} (Ref: {run.payment_reference})
                      </span>
                    )}
                    {Array.isArray(activeRunData?.accountsVouchers) && activeRunData.accountsVouchers.length > 0 && (
                      <span className="inline-flex items-center gap-1 ml-1">
                        · Accounts Vouchers:
                        {activeRunData.accountsVouchers.map((je: any) => (
                          <span
                            key={je._id}
                            className="font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold"
                          >
                            {je.voucherNo}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Clean Summary KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Employees</span>
                  <p className="text-2xl font-bold text-slate-900">{run.payslip_count}</p>
                  {deltas?.countPct !== null && deltas?.countPct !== undefined && (
                    <DeltaBadge pct={deltas.countPct} />
                  )}
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Gross Total</span>
                  <p className="text-2xl font-bold text-slate-900 font-mono">{formatBDT(run.total_gross_pay)}</p>
                  {deltas?.grossPct !== null && deltas?.grossPct !== undefined && (
                    <DeltaBadge pct={deltas.grossPct} />
                  )}
                </div>
                <div className="bg-white p-4 rounded-xl border border-rose-200/80 shadow-2xs space-y-1">
                  <span className="text-[11px] font-semibold text-rose-700 uppercase">Total Deductions</span>
                  <p className="text-2xl font-bold text-rose-700 font-mono">{formatBDT(run.total_deductions)}</p>
                  {deltas?.deductionsPct !== null && deltas?.deductionsPct !== undefined && (
                    <DeltaBadge pct={deltas.deductionsPct} />
                  )}
                </div>
                <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-200 shadow-2xs space-y-1">
                  <span className="text-[11px] font-semibold text-emerald-800 uppercase">Net Payable</span>
                  <p className="text-2xl font-bold text-emerald-800 font-mono">{formatBDT(run.total_net_pay)}</p>
                  {deltas?.netPct !== null && deltas?.netPct !== undefined && (
                    <DeltaBadge pct={deltas.netPct} />
                  )}
                </div>
              </div>

              {/* Clean Health Strip when clean, or Expand Details only when Warnings/Skipped exist */}
              {warnings.length === 0 && skipped.length === 0 ? (
                <div className="px-4 py-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    All <strong>{run.payslip_count}</strong> eligible active employees included · <strong>0</strong> anomalies or warnings flagged.
                  </span>
                </div>
              ) : (
                <div
                  className={`grid grid-cols-1 ${
                    warnings.length > 0 && skipped.length > 0 ? 'xl:grid-cols-2' : ''
                  } gap-4`}
                >
                  {warnings.length > 0 && (
                    <div className="bg-white rounded-xl border border-amber-200 shadow-2xs overflow-hidden">
                      <div className="px-4 py-2.5 bg-amber-50/70 border-b border-amber-200 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <h3 className="text-xs font-bold text-amber-900 uppercase">
                          Warnings &amp; Anomaly Review ({warnings.length})
                        </h3>
                      </div>
                      <div className="p-3.5 max-h-56 overflow-y-auto space-y-2 text-xs">
                        {warnings.map((w: any, i: number) => (
                          <div
                            key={i}
                            className={`p-2.5 rounded-lg border ${
                              w.severity === 'critical'
                                ? 'bg-rose-50 border-rose-200 text-rose-800'
                                : 'bg-amber-50/60 border-amber-200 text-amber-900'
                            }`}
                          >
                            <div className="font-bold">
                              {w.name} ({w.employee_code})
                            </div>
                            <p className="text-[11px] mt-0.5">{w.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {skipped.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-slate-600" />
                          <h3 className="text-xs font-bold text-slate-700 uppercase">
                            Skipped Employees ({skipped.length})
                          </h3>
                        </div>
                        <a
                          href={`/api/payroll/batches/${run._id}?export=skipped_csv`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline"
                        >
                          <Download className="w-3 h-3" /> Download CSV
                        </a>
                      </div>
                      <div className="p-3.5 max-h-56 overflow-y-auto text-xs">
                        <ul className="divide-y divide-slate-100">
                          {skipped.map((sk: any, i: number) => (
                            <li key={i} className="py-2 flex items-center justify-between gap-3">
                              <div>
                                <span className="font-semibold text-slate-800">{sk.name}</span>{' '}
                                <span className="font-mono text-[11px] text-slate-400">
                                  ({sk.employee_code})
                                </span>
                              </div>
                              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                                {sk.reason}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Run Payslips Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    Payslips in {run.batch_code} ({runPayslips.length})
                  </h3>
                  <Link
                    href={`/payroll/payslips?month=${run.month}&year=${run.year}`}
                    className="text-xs font-semibold text-blue-700 hover:underline"
                  >
                    Open Full Payslips Desk →
                  </Link>
                </div>

                {runPayslips.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                    <p>No payslips are linked to this run yet.</p>
                    <Link
                      href="/payroll/payslips"
                      className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                    >
                      View all payslips in Payslips Desk →
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="p-3 border-b border-slate-100 bg-slate-50/40">
                      <TableToolbar
                        search={slipSearch}
                        onSearchChange={setSlipSearch}
                        searchPlaceholder="Search payslip #, employee name or ID..."
                        sortKey={slipSortKey}
                        sortDir={slipSortDir}
                        onSortChange={(k, d) => {
                          setSlipSortKey(k);
                          setSlipSortDir(d);
                        }}
                        sortOptions={[
                          { value: 'payslip_no', label: 'Payslip #' },
                          { value: 'employee', label: 'Employee Name' },
                          { value: 'department', label: 'Department' },
                          { value: 'gross', label: 'Gross Pay' },
                          { value: 'deductions', label: 'Deductions' },
                          { value: 'net', label: 'Net Pay' },
                          { value: 'status', label: 'Status' },
                        ]}
                        filters={
                          <>
                            <select
                              value={slipDeptFilter}
                              onChange={(e) => setSlipDeptFilter(e.target.value)}
                              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
                            >
                              <option value="all">All Departments</option>
                              {EMPLOYEE_DEPARTMENTS.map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                            <select
                              value={slipStatusFilter}
                              onChange={(e) => setSlipStatusFilter(e.target.value)}
                              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
                            >
                              <option value="all">All Status</option>
                              <option value="Draft">Draft</option>
                              <option value="Verified">Verified</option>
                              <option value="Confirmed">Confirmed</option>
                              <option value="Paid">Paid</option>
                              <option value="Reversed">Reversed</option>
                            </select>
                          </>
                        }
                        totalCount={runPayslips.length}
                        filteredCount={filteredRunPayslips.length}
                        hasActiveFilters={slipSearch !== '' || slipDeptFilter !== 'all' || slipStatusFilter !== 'all'}
                        onReset={() => {
                          setSlipSearch('');
                          setSlipDeptFilter('all');
                          setSlipStatusFilter('all');
                        }}
                        onExportExcel={exportRunPayslipsExcel}
                        onPrint={printRunPayslipsReport}
                      />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                          <tr>
                            <th className="px-4 py-2.5">Payslip</th>
                            <th className="px-4 py-2.5">Employee</th>
                            <th className="px-4 py-2.5">Days / OT</th>
                            <th className="px-4 py-2.5 text-right">Gross</th>
                            <th className="px-4 py-2.5 text-right">Deductions</th>
                            <th className="px-4 py-2.5 text-right">Net Pay</th>
                            <th className="px-4 py-2.5 text-center">Status</th>
                            <th className="px-4 py-2.5 text-right">View</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredRunPayslips.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="py-10 text-center text-xs text-slate-500">
                                No payslips match your search or filter criteria.
                              </td>
                            </tr>
                          ) : (
                            filteredRunPayslips.map((p: any) => (
                              <tr key={p._id} className="hover:bg-slate-50/70">
                                <td className="px-4 py-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                                  {p.payslip_no}
                                </td>
                                <td className="px-4 py-2.5 whitespace-nowrap">
                                  <span className="font-semibold text-slate-900 block">
                                    {p.employee_id?.firstName} {p.employee_id?.lastName}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    {p.employee_id?.employee_id} · {p.employee_id?.department}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">
                                  <span>
                                    {p.prorated_days || p.days_in_month}/{p.days_in_month}d
                                  </span>
                                  {p.inputs_snapshot?.overtime_hours > 0 && (
                                    <span className="ml-1.5 text-emerald-700 font-semibold">
                                      · {p.inputs_snapshot.overtime_hours}h OT
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono">{formatBDT(p.gross_pay)}</td>
                                <td className="px-4 py-2.5 text-right font-mono text-rose-700">
                                  {formatBDT(p.total_deductions)}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-800">
                                  {formatBDT(p.net_pay)}
                                </td>
                                <td className="px-4 py-2.5 text-center">{getStatusBadge(p.status)}</td>
                                <td className="px-4 py-2.5 text-right">
                                  <Link
                                    href={`/payroll/payslips/${p._id}`}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                                  >
                                    <Eye className="w-3 h-3" /> PDF
                                  </Link>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Generate Payroll Run Modal (with live preview count) */}
      <Modal
        isOpen={isGenOpen}
        onClose={() => setIsGenOpen(false)}
        title="Generate Monthly Payroll Run"
        description="Creates one Draft run per month, year, and branch for all eligible contracted employees."
        maxWidth="md"
      >
        <form onSubmit={handleGenerateRun} className="space-y-4">
          {genError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {genError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Month *</label>
              <select
                value={genForm.month}
                onChange={(e) => setGenForm({ ...genForm, month: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Year *</label>
              <select
                value={genForm.year}
                onChange={(e) => setGenForm({ ...genForm, year: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {[2025, 2026, 2027, 2028].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Branch *</label>
              <input
                type="text"
                required
                value={genForm.branch}
                onChange={(e) => setGenForm({ ...genForm, branch: e.target.value })}
                placeholder="Main"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
              <select
                value={genForm.department}
                onChange={(e) => setGenForm({ ...genForm, department: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="all">All Departments</option>
                {EMPLOYEE_DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={genForm.include_no_attendance}
              onChange={(e) =>
                setGenForm({ ...genForm, include_no_attendance: e.target.checked })
              }
              className="rounded border-slate-300 text-emerald-600"
            />
            <span>Include employees with no attendance records this month</span>
          </label>

          {/* Live Preview Count Box + Effective Settings Version */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
            {previewLoading ? (
              <span className="text-slate-500">Checking eligible employees &amp; effective rules...</span>
            ) : previewData ? (
              previewData.existingRun ? (
                <div className="text-rose-700 font-semibold">
                  Run {previewData.existingRun.batch_code} already exists for this month, year, and branch ({previewData.existingRun.status}).
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span>Preview Count:</span>
                    <span>
                      <span className="text-emerald-700">{previewData.eligibleCount} will be created</span>
                      {' · '}
                      <span className="text-amber-700">{previewData.skippedCount} skipped</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-200">
                    <span>
                      Rules: <strong>Settings v{previewData.settingsVersion || 1}</strong> ({previewData.absenceBasis} basis · {previewData.daysBasis} · {previewData.overtimeMultiplier}x OT)
                    </span>
                    <Link
                      href="/payroll/settings"
                      className="text-blue-700 font-semibold hover:underline"
                    >
                      Configure ↗
                    </Link>
                  </div>
                  {previewData.isDefaultSettings && (
                    <p className="text-[11px] text-amber-700 font-medium">
                      Default payroll settings are in use. Review them in Payroll Settings.
                    </p>
                  )}
                </>
              )
            ) : (
              <span className="text-slate-400">Preview unavailable.</span>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsGenOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                busyAction ||
                Boolean(previewData?.existingRun) ||
                (previewData && previewData.eligibleCount === 0)
              }
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {busyAction ? 'Generating...' : 'Create Draft Payroll Run'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm / Reverse Confirmation Modal */}
      <Modal
        isOpen={Boolean(confirmModalAction && run)}
        onClose={() => setConfirmModalAction(null)}
        title={
          confirmModalAction === 'confirm'
            ? 'Confirm Payroll Run'
            : 'Reverse Confirmed Payroll Run'
        }
        maxWidth="md"
      >
        {run && (
          <div className="space-y-4 text-xs">
            {modalError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium">
                {modalError}
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Run:</span>
                <span className="font-bold text-slate-900">{run.batch_code} — {run.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Employees:</span>
                <span className="font-semibold">{run.payslip_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Gross Total:</span>
                <span className="font-mono font-semibold">{formatBDT(run.total_gross_pay)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 mt-1">
                <span className="font-bold text-slate-800">Net Payable Total:</span>
                <span className="font-mono font-bold text-emerald-700 text-sm">
                  {formatBDT(run.total_net_pay)}
                </span>
              </div>
            </div>

            {confirmModalAction === 'confirm' && (
              <p className="text-slate-600">
                Confirming locks all {run.payslip_count} payslips and posts a Journal Voucher (Salary Expense 5210 Dr / Salary Payable 2110 Cr) in Accounts. Disbursement happens in Accounts → Salary Disbursement.
              </p>
            )}

            {confirmModalAction === 'reverse' && (
              <div className="space-y-2">
                <p className="text-rose-700 font-medium">
                  Reversal never deletes confirmed payslips. It marks the run Reversed, creates a mirror reversal record, and reverses the Accounts Salary Payable accrual voucher.
                </p>
                <label className="block font-semibold text-slate-700">Mandatory Reversal Reason *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain why this confirmed payroll run must be reversed..."
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setConfirmModalAction(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  busyAction || (confirmModalAction === 'reverse' && reverseReason.trim().length < 3)
                }
                onClick={() => {
                  if (confirmModalAction === 'confirm') executeRunAction('confirm');
                  else if (confirmModalAction === 'reverse')
                    executeRunAction('reverse', { reason: reverseReason.trim() });
                }}
                className={`px-4 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-50 ${
                  confirmModalAction === 'reverse'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {busyAction
                  ? 'Processing...'
                  : confirmModalAction === 'confirm'
                    ? 'Confirm & Post Accrual'
                    : 'Reverse Run'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

