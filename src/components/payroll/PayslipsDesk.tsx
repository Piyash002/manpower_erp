'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Receipt,
  Plus,
  RefreshCw,
  Eye,
  CheckCircle2,
  Banknote,
  Trash2,
  AlertCircle,
  Search,
  Download,
  FileArchive,
  FileSpreadsheet,
  ShieldCheck,
  X,
  Lock,
  ChevronLeft,
  ChevronRight,
  Printer,
  ArrowUpDown,
  RotateCcw,
} from 'lucide-react';
import { formatBDT, formatDateDMY, EMPLOYEE_DEPARTMENTS } from '@/lib/formatters';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { printTableReport, sortTableItems, SortDir } from '@/lib/client-export';
import { useAuth } from '@/components/layout/DashboardLayout';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STAFF_ROLES = ['Admin', 'HR', 'Accountant', 'Viewer'];

function SourceTag({ source }: { source?: string }) {
  const styles: Record<string, string> = {
    contract: 'bg-blue-50 text-blue-700 border-blue-200',
    attendance: 'bg-amber-50 text-amber-800 border-amber-200',
    leave: 'bg-purple-50 text-purple-700 border-purple-200',
    monthly_input: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    formula: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  const labels: Record<string, string> = {
    contract: 'Contract',
    attendance: 'Attendance',
    leave: 'Leave',
    monthly_input: 'Monthly Input',
    formula: 'Formula',
  };
  const key = source || 'formula';
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${styles[key] || styles.formula}`}>
      {labels[key] || key}
    </span>
  );
}

export function PayslipsDesk() {
  const { user } = useAuth();
  const role = user?.role || 'Viewer';
  const isStaff = STAFF_ROLES.includes(role);
  const canVerifyOrEdit = role === 'Admin' || role === 'HR';
  const canConfirm = role === 'Admin';
  const canPay = role === 'Admin' || role === 'Accountant';

  const now = new Date();
  const [month, setMonth] = useState<string>('all');
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [department, setDepartment] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortKey, setSortKey] = useState<string>('payslip_no');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState<number>(1);

  const [payslips, setPayslips] = useState<any[]>([]);
  const [allSummary, setAllSummary] = useState({ count: 0, gross: 0, deductions: 0, net: 0 });
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [employees, setEmployees] = useState<any[]>([]);
  const [myEmployee, setMyEmployee] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Selection for Bulk Actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Detail Drawer
  const [drawerPayslip, setDrawerPayslip] = useState<any | null>(null);
  const [draftEdit, setDraftEdit] = useState({ bonus_adjustment: '0', fine_adjustment: '0', notes: '' });

  // Secondary Exception Single Generate Modal
  const [isGenModalOpen, setIsGenModalOpen] = useState(false);
  const [genForm, setGenForm] = useState({
    employee_id: '',
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
    notes: '',
  });
  const [genError, setGenError] = useState('');

  const buildFilterParams = (extra?: Record<string, string>) => {
    const params = new URLSearchParams();
    if (month !== 'all') params.append('month', month);
    if (year !== 'all') params.append('year', year);
    if (department !== 'all') params.append('department', department);
    if (statusFilter !== 'all') params.append('status', statusFilter);
    if (searchQuery) params.append('search', searchQuery);
    params.append('page', String(page));
    params.append('limit', '20');
    if (extra) {
      for (const [k, v] of Object.entries(extra)) params.set(k, v);
    }
    return params.toString();
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const qs = buildFilterParams();
      const reqs: Promise<Response>[] = [fetch(`/api/payroll/payslips?${qs}`)];
      if (canVerifyOrEdit && employees.length === 0) {
        reqs.push(fetch('/api/hrm/employees?status=Active'));
      }

      const [slipRes, empRes] = await Promise.all(reqs);
      const slipJson = await slipRes.json();
      if (slipJson.success && slipJson.data) {
        setPayslips(slipJson.data.payslips || []);
        setAllSummary(slipJson.data.allSummary || { count: 0, gross: 0, deductions: 0, net: 0 });
        setPagination(slipJson.data.pagination || { total: 0, page: 1, limit: 20, totalPages: 1 });
        setMyEmployee(slipJson.data.myEmployee || null);
        setSelectedIds([]);
      }

      if (empRes && empRes.ok) {
        const empJson = await empRes.json();
        if (empJson.success) setEmployees(empJson.data || []);
      }
    } catch (err) {
      console.error('Failed to load payslips:', err);
    } finally {
      setLoading(false);
    }
  };

  const [hydratedFilters, setHydratedFilters] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const qs = new URLSearchParams(window.location.search);
      const qm = qs.get('month');
      const qy = qs.get('year');
      if (qm) setMonth(qm);
      if (qy) setYear(qy);
    }
    setHydratedFilters(true);
  }, []);

  useEffect(() => {
    if (!hydratedFilters) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydratedFilters, month, year, department, statusFilter, searchQuery, page, role]);

  const handleBulkAction = async (
    action: 'verify' | 'confirm' | 'pay',
    extra: Record<string, any> = {}
  ) => {
    if (selectedIds.length === 0) return;
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/payroll/payslips', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Bulk action failed');
      setBanner({ type: 'ok', msg: json.message });
      loadData();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateException = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenError('');
    setBusy(true);
    try {
      const res = await fetch('/api/payroll/payslips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: genForm.employee_id,
          month: Number(genForm.month),
          year: Number(genForm.year),
          notes: genForm.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Generation failed');
      setIsGenModalOpen(false);
      setBanner({ type: 'ok', msg: json.message });
      loadData();
    } catch (err: any) {
      setGenError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDrawerUpdate = async (payload: Record<string, any>) => {
    if (!drawerPayslip) return;
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/payroll/payslips/${drawerPayslip._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Update failed');
      setDrawerPayslip(json.data);
      setBanner({ type: 'ok', msg: json.message });
      loadData();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDraft = async (id: string, payslipNo: string) => {
    if (!confirm(`Delete Draft payslip ${payslipNo}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/payroll/payslips/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Delete failed');
      if (drawerPayslip?._id === id) setDrawerPayslip(null);
      setBanner({ type: 'ok', msg: json.message });
      loadData();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setBusy(false);
    }
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? payslips.map((p) => p._id) : []);
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const openDrawer = (p: any) => {
    setDrawerPayslip(p);
    setDraftEdit({
      bonus_adjustment: '0',
      fine_adjustment: '0',
      notes: p.notes || '',
    });
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

  const exportQueryIds =
    selectedIds.length > 0 ? `ids=${selectedIds.join(',')}` : buildFilterParams();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isStaff ? 'Payslips' : 'My Payslips'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isStaff
              ? 'Search, inspect line-by-line calculation sources, bulk approve, and download payslip bundles.'
              : myEmployee
                ? `Viewing payslips for ${myEmployee.firstName} ${myEmployee.lastName} (${myEmployee.employee_id})`
                : 'View and download your personal monthly payslips.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {canVerifyOrEdit && (
            <button
              type="button"
              onClick={() => {
                setGenError('');
                setGenForm({
                  employee_id: employees[0]?._id || '',
                  month: month === 'all' ? String(now.getMonth() + 1) : month,
                  year: year === 'all' ? String(now.getFullYear()) : year,
                  notes: '',
                });
                setIsGenModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
              <span>Single payslip (exceptions)</span>
            </button>
          )}
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
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

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Matching Payslips</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">{allSummary.count}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Gross Total</span>
          <p className="text-2xl font-bold text-slate-900 font-mono mt-1">{formatBDT(allSummary.gross)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs">
          <span className="text-xs font-semibold text-rose-700 uppercase">Total Deductions</span>
          <p className="text-2xl font-bold text-rose-700 font-mono mt-1">
            {formatBDT(allSummary.deductions)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
          <span className="text-xs font-semibold text-emerald-800 uppercase">Net Payable</span>
          <p className="text-2xl font-bold text-emerald-800 font-mono mt-1">{formatBDT(allSummary.net)}</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSearchQuery(searchInput.trim());
            }}
            className="relative flex-1 min-w-[200px] max-w-xs"
          >
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search name, ID or payslip no..."
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                if (e.target.value === '') {
                  setPage(1);
                  setSearchQuery('');
                }
              }}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </form>

          <select
            value={month}
            onChange={(e) => {
              setPage(1);
              setMonth(e.target.value);
            }}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
          >
            <option value="all">Month: All</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={year}
            onChange={(e) => {
              setPage(1);
              setYear(e.target.value);
            }}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
          >
            <option value="all">Year: All</option>
            {[2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          {isStaff && (
            <select
              value={department}
              onChange={(e) => {
                setPage(1);
                setDepartment(e.target.value);
              }}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
            >
              <option value="all">Dept: All</option>
              {EMPLOYEE_DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}

          <select
            value={statusFilter}
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value);
            }}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg"
          >
            <option value="all">Status: All</option>
            <option value="Draft">Draft</option>
            <option value="Verified">Verified</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Paid">Paid</option>
            <option value="Reversed">Reversed</option>
          </select>

          <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              className="text-xs font-semibold bg-transparent focus:outline-none text-slate-700"
            >
              <option value="payslip_no">Sort: Payslip #</option>
              <option value="employee">Sort: Employee</option>
              <option value="period">Sort: Period</option>
              <option value="gross">Sort: Gross Pay</option>
              <option value="deductions">Sort: Deductions</option>
              <option value="net">Sort: Net Pay</option>
              <option value="status">Sort: Status</option>
            </select>
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              className="px-1.5 py-0.5 text-[11px] font-mono bg-white border border-slate-200 rounded hover:bg-slate-100"
              title="Toggle sort direction"
            >
              {sortDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>

          {(searchQuery !== '' || month !== 'all' || year !== String(now.getFullYear()) || department !== 'all' || statusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setSearchQuery('');
                setMonth('all');
                setYear(String(now.getFullYear()));
                setDepartment('all');
                setStatusFilter('all');
                setPage(1);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 rounded-lg"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>

        {/* Export filtered/selected */}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/payroll/payslips?${exportQueryIds}&export=zip`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
          >
            <FileArchive className="w-3.5 h-3.5" />
            Download PDFs (.zip)
          </a>
          <a
            href={`/api/payroll/payslips?${exportQueryIds}&export=xlsx`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export Excel
          </a>
          <a
            href={`/api/payroll/payslips?${exportQueryIds}&export=csv`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </a>
          <button
            type="button"
            onClick={() => {
              const sorted = sortTableItems(payslips, sortKey, sortDir, {
                payslip_no: (p) => p.payslip_no || '',
                employee: (p) => `${p.employee_id?.firstName || ''} ${p.employee_id?.lastName || ''}`.trim(),
                period: (p) => (p.year || 0) * 100 + (p.month || 0),
                gross: (p) => Number(p.gross_pay || 0),
                deductions: (p) => Number(p.total_deductions || 0),
                net: (p) => Number(p.net_pay || 0),
                status: (p) => p.status || '',
              });
              const totalGross = sorted.reduce((s, p) => s + Number(p.gross_pay || 0), 0);
              const totalDed = sorted.reduce((s, p) => s + Number(p.total_deductions || 0), 0);
              const totalNet = sorted.reduce((s, p) => s + Number(p.net_pay || 0), 0);
              printTableReport({
                title: 'Payslips Register',
                subtitle: `Month: ${month === 'all' ? 'All' : MONTHS[Number(month) - 1]} | Year: ${year} | Dept: ${department} | Status: ${statusFilter}`,
                meta: `Page Rows: ${sorted.length} (Total Matching: ${allSummary.count})`,
                headers: ['Payslip No', 'Emp ID', 'Employee', 'Department', 'Period', 'Gross Pay', 'Deductions', 'Net Pay', 'Status'],
                rows: sorted.map((p) => [
                  p.payslip_no || '',
                  p.employee_id?.employee_id || '',
                  `${p.employee_id?.firstName || ''} ${p.employee_id?.lastName || ''}`.trim(),
                  p.employee_id?.department || '',
                  `${MONTHS[(p.month || 1) - 1]} ${p.year}`,
                  formatBDT(p.gross_pay || 0),
                  formatBDT(p.total_deductions || 0),
                  formatBDT(p.net_pay || 0),
                  p.status || '',
                ]),
                rightAlignCols: [5, 6, 7],
                summaryRow: ['PAGE TOTAL', '', `${sorted.length} Payslips`, '', '', formatBDT(totalGross), formatBDT(totalDed), formatBDT(totalNet), ''],
                landscape: true,
              });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>
        </div>
      </div>

      {/* Bulk Action Strip */}
      {isStaff && selectedIds.length > 0 && (
        <div className="p-3 rounded-xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-semibold">{selectedIds.length} payslip(s) selected</span>
          <div className="flex flex-wrap items-center gap-2">
            {canVerifyOrEdit && (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleBulkAction('verify')}
                className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold bg-purple-600 hover:bg-purple-700 rounded-lg"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Verify Selected
              </button>
            )}
            {canConfirm && (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleBulkAction('confirm')}
                className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Confirm Selected
              </button>
            )}
            {canPay && (
              <Link
                href="/accounts/payroll"
                className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                <Banknote className="w-3.5 h-3.5" /> Disburse in Accounts →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Payslips Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                {isStaff && (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={payslips.length > 0 && selectedIds.length === payslips.length}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600"
                    />
                  </th>
                )}
                <th className="px-4 py-3">Payslip No</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Period / Run</th>
                <th className="px-4 py-3 text-right">Gross</th>
                <th className="px-4 py-3 text-right">Deductions</th>
                <th className="px-4 py-3 text-right">Net Pay</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                [1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td colSpan={9} className="px-4 py-3">
                      <div className="h-8 bg-slate-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : payslips.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-14 text-center space-y-2">
                    <Receipt className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-slate-600 font-semibold">No payslips match the current filters</p>
                    <p className="text-slate-400">
                      Generate a monthly Payroll Run in the Payroll Runs tab, or adjust your filters.
                    </p>
                  </td>
                </tr>
              ) : (
                sortTableItems(payslips, sortKey, sortDir, {
                  payslip_no: (p) => p.payslip_no || '',
                  employee: (p) => `${p.employee_id?.firstName || ''} ${p.employee_id?.lastName || ''}`.trim(),
                  period: (p) => (p.year || 0) * 100 + (p.month || 0),
                  gross: (p) => Number(p.gross_pay || 0),
                  deductions: (p) => Number(p.total_deductions || 0),
                  net: (p) => Number(p.net_pay || 0),
                  status: (p) => p.status || '',
                }).map((p) => (
                  <tr
                    key={p._id}
                    onClick={() => openDrawer(p)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    {isStaff && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(p._id)}
                          onChange={() => toggleRow(p._id)}
                          className="rounded border-slate-300 text-emerald-600"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 whitespace-nowrap font-mono font-bold text-slate-900">
                      {p.payslip_no}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-semibold text-slate-900 block">
                        {p.employee_id?.firstName} {p.employee_id?.lastName}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {p.employee_id?.employee_id} • {p.employee_id?.department}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-semibold text-slate-800 block">
                        {MONTHS[(p.month || 1) - 1]} {p.year}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {p.batch_id?.batch_code || 'Unassigned'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{formatBDT(p.gross_pay)}</td>
                    <td className="px-4 py-3 text-right font-mono text-rose-700">
                      {formatBDT(p.total_deductions)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-800">
                      {formatBDT(p.net_pay)}
                    </td>
                    <td className="px-4 py-3 text-center">{getStatusBadge(p.status)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openDrawer(p)}
                          className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                        >
                          Inspect
                        </button>
                        <Link
                          href={`/payroll/payslips/${p._id}`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
                        >
                          <Eye className="w-3 h-3" /> PDF
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <span>
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
            </span>
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded border border-slate-300 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded border border-slate-300 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Payslip Detail Drawer */}
      {drawerPayslip && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl overflow-y-auto flex flex-col">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between sticky top-0 z-10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">{drawerPayslip.payslip_no}</span>
                  {getStatusBadge(drawerPayslip.status)}
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  {drawerPayslip.employee_id?.firstName} {drawerPayslip.employee_id?.lastName} (
                  {drawerPayslip.employee_id?.employee_id}) •{' '}
                  {MONTHS[(drawerPayslip.month || 1) - 1]} {drawerPayslip.year}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerPayslip(null)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs flex-1">
              {/* Attendance & Proration Sources Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Days Worked</span>
                  <span className="font-bold text-slate-900">
                    {drawerPayslip.prorated_days || drawerPayslip.days_in_month}/
                    {drawerPayslip.days_in_month}d
                  </span>
                  <div className="mt-1">
                    <SourceTag source="contract" />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Absent / Late</span>
                  <span className="font-bold text-rose-700">
                    {drawerPayslip.attendance_summary?.absentDays || 0}A /{' '}
                    {drawerPayslip.attendance_summary?.lateDays || 0}L
                  </span>
                  <div className="mt-1">
                    <SourceTag source="attendance" />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Leave (Paid/Unpaid)</span>
                  <span className="font-bold text-purple-700">
                    {drawerPayslip.attendance_summary?.paidLeaveDays || 0}P /{' '}
                    {drawerPayslip.attendance_summary?.unpaidLeaveDays || 0}U
                  </span>
                  <div className="mt-1">
                    <SourceTag source="leave" />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Overtime Hours</span>
                  <span className="font-bold text-emerald-700">
                    {drawerPayslip.inputs_snapshot?.overtime_hours || 0}h (
                    {drawerPayslip.overtime_multiplier || 2}x)
                  </span>
                  <div className="mt-1">
                    <SourceTag source="monthly_input" />
                  </div>
                </div>
              </div>

              {/* Earnings Lines */}
              <div className="space-y-2">
                <h4 className="font-bold text-emerald-800 uppercase tracking-wider">Earnings</h4>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {(drawerPayslip.lines || [])
                    .filter((l: any) => l.category === 'BASIC' || l.category === 'ALLOWANCE')
                    .map((l: any, idx: number) => (
                      <div key={idx} className="p-3 flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{l.name}</span>
                            <SourceTag source={l.source} />
                          </div>
                          {l.calculation_note && (
                            <p className="text-[11px] text-slate-500 mt-0.5">{l.calculation_note}</p>
                          )}
                        </div>
                        <span className="font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {formatBDT(l.amount)}
                        </span>
                      </div>
                    ))}
                  <div className="p-3 bg-emerald-50/40 flex justify-between font-bold text-emerald-900">
                    <span>Gross Earnings</span>
                    <span className="font-mono">{formatBDT(drawerPayslip.gross_pay)}</span>
                  </div>
                </div>
              </div>

              {/* Deductions Lines */}
              <div className="space-y-2">
                <h4 className="font-bold text-rose-800 uppercase tracking-wider">Deductions</h4>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {(drawerPayslip.lines || []).filter((l: any) => l.category === 'DEDUCTION').length ===
                  0 ? (
                    <div className="p-3 text-slate-400 italic">No deductions this month.</div>
                  ) : (
                    (drawerPayslip.lines || [])
                      .filter((l: any) => l.category === 'DEDUCTION')
                      .map((l: any, idx: number) => (
                        <div key={idx} className="p-3 flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">{l.name}</span>
                              <SourceTag source={l.source} />
                            </div>
                            {l.calculation_note && (
                              <p className="text-[11px] text-slate-500 mt-0.5">{l.calculation_note}</p>
                            )}
                          </div>
                          <span className="font-mono font-semibold text-rose-700 whitespace-nowrap">
                            -{formatBDT(l.amount)}
                          </span>
                        </div>
                      ))
                  )}
                  <div className="p-3 bg-rose-50/40 flex justify-between font-bold text-rose-900">
                    <span>Total Deductions</span>
                    <span className="font-mono">-{formatBDT(drawerPayslip.total_deductions)}</span>
                  </div>
                </div>
              </div>

              {/* Net Total */}
              <div className="p-4 rounded-xl bg-slate-900 text-white space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-semibold text-slate-300">Net Payable</span>
                  <span className="text-xl font-bold font-mono text-emerald-400">
                    {formatBDT(drawerPayslip.net_pay)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300">
                  {drawerPayslip.amount_in_words || ''}
                </p>
                {drawerPayslip.payment_date && (
                  <p className="text-[11px] text-emerald-300 pt-1">
                    Disbursed via {drawerPayslip.payment_method} on{' '}
                    {formatDateDMY(drawerPayslip.payment_date)} (Ref: {drawerPayslip.payment_reference})
                  </p>
                )}
              </div>

              {/* Draft Editing & Audit Section */}
              {drawerPayslip.status === 'Draft' && canVerifyOrEdit ? (
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                  <h4 className="font-bold text-slate-800 uppercase">Edit Draft Payslip (Audited)</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Bonus Adjustment (৳)
                      </label>
                      <input
                        type="number"
                        value={draftEdit.bonus_adjustment}
                        onChange={(e) =>
                          setDraftEdit({ ...draftEdit, bonus_adjustment: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Deduction Adjustment (৳)
                      </label>
                      <input
                        type="number"
                        value={draftEdit.fine_adjustment}
                        onChange={(e) =>
                          setDraftEdit({ ...draftEdit, fine_adjustment: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Notes</label>
                    <input
                      type="text"
                      value={draftEdit.notes}
                      onChange={(e) => setDraftEdit({ ...draftEdit, notes: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        handleDrawerUpdate({
                          bonus_adjustment: Number(draftEdit.bonus_adjustment) || 0,
                          fine_adjustment: Number(draftEdit.fine_adjustment) || 0,
                          notes: draftEdit.notes,
                        })
                      }
                      className="px-3 py-1.5 font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                    >
                      Save Draft Adjustments
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDrawerUpdate({ recompute: true })}
                      className="px-3 py-1.5 font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
                    >
                      Recalculate from Live Data
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        handleDeleteDraft(drawerPayslip._id, drawerPayslip.payslip_no)
                      }
                      className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Draft
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-slate-400" />
                  <span>
                    Payslip status is <strong>{drawerPayslip.status}</strong> and locked from manual edits.
                  </span>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <a
                href={`/api/payroll/payslips/${drawerPayslip._id}?format=pdf`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
              >
                <Download className="w-3.5 h-3.5" /> Download PDF
              </a>
              <Link
                href={`/payroll/payslips/${drawerPayslip._id}`}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                <Eye className="w-3.5 h-3.5" /> Open Print View
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Secondary Modal: Single payslip (exceptions) */}
      <Modal
        isOpen={isGenModalOpen}
        onClose={() => setIsGenModalOpen(false)}
        title="Single Payslip (Exceptions)"
        description="For mid-month joiners, single recalculations, or final settlements. Automatically attaches to the month's Payroll Run."
        maxWidth="md"
      >
        <form onSubmit={handleGenerateException} className="space-y-4">
          {genError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {genError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Employee *</label>
            <select
              required
              value={genForm.employee_id}
              onChange={(e) => setGenForm({ ...genForm, employee_id: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            >
              <option value="">Select Employee...</option>
              {employees.map((emp) => (
                <option key={emp._id} value={emp._id}>
                  {emp.firstName} {emp.lastName} ({emp.employee_id} • {emp.department})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Month *</label>
              <select
                value={genForm.month}
                onChange={(e) => setGenForm({ ...genForm, month: e.target.value })}
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
                onChange={(e) => setGenForm({ ...genForm, year: e.target.value })}
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

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Exception Reason</label>
            <input
              type="text"
              placeholder="e.g. Mid-month joiner / Final settlement"
              value={genForm.notes}
              onChange={(e) => setGenForm({ ...genForm, notes: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsGenModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !genForm.employee_id}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {busy ? 'Attaching...' : 'Attach Draft Payslip to Run'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
