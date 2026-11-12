'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  UserCheck,
  Plus,
  Search,
  RefreshCw,
  Edit3,
  Check,
  X,
  Trash2,
  LayoutGrid,
  List,
  Phone,
  Mail,
  Briefcase,
  AlertCircle,
  Link2,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Printer,
  ArrowUpDown,
} from 'lucide-react';
import { formatBDT, formatDate } from '@/lib/formatters';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/components/layout/DashboardLayout';
import { EmployeeAvatar } from './EmployeeAvatar';
import { downloadExcel, printTableReport, sortTableItems, type SortDir } from '@/lib/client-export';

interface EmployeeRecord {
  _id: string;
  employee_id: string;
  biometric_id?: string | null;
  shift?: string;
  photo_url?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  department: string;
  department_id?: { _id: string; name: string; code: string } | null;
  designation: string;
  designation_id?: { _id: string; name: string; code: string; grade_label?: string } | null;
  employee_type?: string;
  basic_salary: number;
  commission_rate: number;
  joining_date?: string;
  status: 'Active' | 'On Leave' | 'Inactive' | 'Resigned' | 'Terminated';
  payment_method?: string;
  userId?: {
    _id: string;
    name: string;
    username: string;
    role: string;
  } | null;
}

const STATUS_OPTIONS = ['Active', 'On Leave', 'Inactive', 'Resigned', 'Terminated'] as const;
const TYPE_OPTIONS = ['Permanent', 'Contract', 'Intern', 'Part-time'] as const;

export function EmployeeManagement() {
  const { user } = useAuth();
  const isAdminOrHR = user?.role === 'Admin' || user?.role === 'HR';

  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [departments, setDepartments] = useState<Array<{ _id: string; name: string }>>([]);
  const [designations, setDesignations] = useState<Array<{ _id: string; name: string }>>([]);
  const [metaInfo, setMetaInfo] = useState({ total: 0, page: 1, totalPages: 1 });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');

  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [desigFilter, setDesigFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortKey, setSortKey] = useState('employee_id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);

  // Selection & Bulk Actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<string>('Active');
  const [applyingBulk, setApplyingBulk] = useState(false);

  // Inline quick edit state
  const [inlineId, setInlineId] = useState<string | null>(null);
  const [inlineData, setInlineData] = useState({
    basic_salary: '0',
    commission_rate: '0',
    status: 'Active',
  });
  const [savingInline, setSavingInline] = useState(false);

  const loadData = async (targetPage = page) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (deptFilter !== 'all') params.set('department_id', deptFilter);
      if (desigFilter !== 'all') params.set('designation_id', desigFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('employee_type', typeFilter);
      if (search.trim()) params.set('search', search.trim());
      params.set('page', String(targetPage));
      params.set('limit', '15');

      const [empRes, metaRes] = await Promise.all([
        fetch(`/api/hrm/employees?${params.toString()}`),
        fetch('/api/hrm/meta'),
      ]);

      const [empJson, metaJson] = await Promise.all([empRes.json(), metaRes.json()]);

      if (!empRes.ok || !empJson.success) {
        throw new Error(empJson.message || 'Failed to load employees');
      }

      setEmployees(empJson.data || []);
      if (empJson.meta) {
        setMetaInfo({
          total: empJson.meta.total,
          page: empJson.meta.page,
          totalPages: empJson.meta.totalPages,
        });
      }
      if (metaJson.success && metaJson.data) {
        setDepartments(metaJson.data.departments || []);
        setDesignations(metaJson.data.designations || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load staff roster');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData(page);
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, deptFilter, desigFilter, statusFilter, typeFilter, page]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? employees.map((e) => e._id) : []);
  };

  const handleBulkStatusApply = async () => {
    if (selectedIds.length === 0) return;
    setApplyingBulk(true);
    setError('');
    try {
      const res = await fetch('/api/hrm/employees/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, status: bulkStatus }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Bulk update failed');
      setBanner(json.message);
      setSelectedIds([]);
      loadData(page);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bulk update error');
    } finally {
      setApplyingBulk(false);
    }
  };

  const handleExportCsv = () => {
    const rowsToExport =
      selectedIds.length > 0
        ? employees.filter((e) => selectedIds.includes(e._id))
        : employees;
    if (rowsToExport.length === 0) return;

    const header = [
      'Employee ID',
      'First Name',
      'Last Name',
      'Phone',
      'Email',
      'Department',
      'Designation',
      'Type',
      'Basic Salary',
      'Joining Date',
      'Status',
      'Biometric ID',
      'Shift',
    ];
    const csvRows = [
      header.join(','),
      ...rowsToExport.map((e) =>
        [
          e.employee_id,
          `"${e.firstName}"`,
          `"${e.lastName}"`,
          `"${e.phone}"`,
          `"${e.email || ''}"`,
          `"${e.department}"`,
          `"${e.designation}"`,
          e.employee_type || 'Permanent',
          e.basic_salary,
          e.joining_date ? String(e.joining_date).split('T')[0] : '',
          e.status,
          e.biometric_id || '',
          e.shift || 'Regular',
        ].join(',')
      ),
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employees_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startInlineEdit = (emp: EmployeeRecord) => {
    setInlineId(emp._id);
    setInlineData({
      basic_salary: String(emp.basic_salary),
      commission_rate: String(emp.commission_rate),
      status: emp.status,
    });
  };

  const saveInlineEdit = async (id: string) => {
    setSavingInline(true);
    try {
      const res = await fetch(`/api/hrm/employees/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          basic_salary: Number(inlineData.basic_salary),
          commission_rate: Number(inlineData.commission_rate),
          status: inlineData.status,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed inline save');
      }
      setInlineId(null);
      loadData(page);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Save error');
    } finally {
      setSavingInline(false);
    }
  };

  const handleArchive = async (emp: EmployeeRecord) => {
    if (
      !confirm(
        `Archive ${emp.firstName} ${emp.lastName} (${emp.employee_id})? Historical payroll & attendance records will be preserved.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/hrm/employees/${emp._id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      setBanner(json.message);
      loadData(page);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Could not archive employee');
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'Active') return <Badge variant="success">Active</Badge>;
    if (status === 'On Leave') return <Badge variant="warning">On Leave</Badge>;
    if (status === 'Resigned') return <Badge variant="purple">Resigned</Badge>;
    if (status === 'Terminated') return <Badge variant="danger">Terminated</Badge>;
    return <Badge variant="default">Inactive</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-emerald-600" />
            Employees Directory
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {metaInfo.total} employee(s) synced with Attendance, Payroll Contracts, and Referral tracking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const sorted = sortTableItems(employees, sortKey, sortDir, {
                employee_id: (e) => e.employee_id || '',
                name: (e) => `${e.firstName} ${e.lastName}`,
                dept: (e) => e.department || '',
                salary: (e) => Number(e.basic_salary || 0),
                joining: (e) => new Date(e.joining_date || 0),
                status: (e) => e.status || '',
              });
              downloadExcel({
                filename: 'employees-directory',
                sheetName: 'Employees',
                headers: ['Employee ID', 'Name', 'Department', 'Designation', 'Type', 'Phone', 'Email', 'Basic Salary (BDT)', 'Method', 'Status'],
                rows: sorted.map((e) => [
                  e.employee_id,
                  `${e.firstName} ${e.lastName}`.trim(),
                  e.department,
                  e.designation,
                  e.employee_type || 'Permanent',
                  e.phone,
                  e.email || '',
                  e.basic_salary || 0,
                  e.payment_method || 'Bank',
                  e.status,
                ]),
              });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </button>
          <button
            type="button"
            onClick={() => {
              const sorted = sortTableItems(employees, sortKey, sortDir, {
                employee_id: (e) => e.employee_id || '',
                name: (e) => `${e.firstName} ${e.lastName}`,
                dept: (e) => e.department || '',
                salary: (e) => Number(e.basic_salary || 0),
                joining: (e) => new Date(e.joining_date || 0),
                status: (e) => e.status || '',
              });
              printTableReport({
                title: 'Employees Directory',
                meta: `Page ${metaInfo.page} of ${metaInfo.totalPages} | Status: ${statusFilter}`,
                headers: ['Emp ID', 'Name', 'Department', 'Designation', 'Phone', 'Basic Salary', 'Status'],
                rows: sorted.map((e) => [
                  e.employee_id,
                  `${e.firstName} ${e.lastName}`.trim(),
                  e.department,
                  e.designation,
                  e.phone,
                  e.basic_salary || 0,
                  e.status,
                ]),
                rightAlignCols: [5],
                landscape: true,
              });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          {isAdminOrHR && (
            <>
              <Link
                href="/hrm/employees/import"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
              >
                <Upload className="w-3.5 h-3.5" />
                Bulk Import
              </Link>
              <Link
                href="/hrm/employees/new"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
              >
                <Plus className="w-4 h-4" />
                Add Employee
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Filters & View Toggle */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-[220px] flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search name, ID, phone, NID..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <select
            value={deptFilter}
            onChange={(e) => {
              setDeptFilter(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg"
          >
            <option value="all">Dept: All</option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            value={desigFilter}
            onChange={(e) => {
              setDesigFilter(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg"
          >
            <option value="all">Designation: All</option>
            {designations.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg"
          >
            <option value="all">Type: All</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg"
          >
            <option value="all">Status: All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
            <ArrowUpDown className="w-3 h-3 text-slate-400 ml-2" />
            <select
              value={`${sortKey}:${sortDir}`}
              onChange={(e) => {
                const [k, d] = e.target.value.split(':');
                setSortKey(k);
                setSortDir(d as SortDir);
              }}
              className="px-2 py-1.5 text-xs font-medium bg-slate-50 text-slate-700 focus:outline-none"
            >
              <option value="employee_id:asc">Sort: Emp ID (Asc)</option>
              <option value="name:asc">Sort: Name (A → Z)</option>
              <option value="dept:asc">Sort: Department</option>
              <option value="salary:desc">Sort: Highest Salary</option>
              <option value="salary:asc">Sort: Lowest Salary</option>
              <option value="joining:desc">Sort: Newest Joining</option>
              <option value="status:asc">Sort: Status</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-md ${
              viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
            }`}
            title="Table View"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md ${
              viewMode === 'grid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
            }`}
            title="Card View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {isAdminOrHR && selectedIds.length > 0 && (
        <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-semibold">{selectedIds.length} employee(s) selected</span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  Set Status: {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={applyingBulk}
              onClick={handleBulkStatusApply}
              className="px-3 py-1.5 font-semibold bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50"
            >
              {applyingBulk ? 'Updating...' : 'Apply Status'}
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-1.5 font-semibold bg-slate-700 hover:bg-slate-600 rounded-lg"
            >
              Export Selected
            </button>
          </div>
        </div>
      )}

      {banner && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium">
          {banner}
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Content */}
      {loading ? (
        <div className="py-16 text-center bg-white rounded-xl border border-slate-200">
          <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
        </div>
      ) : employees.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-slate-200 text-slate-400">
          <UserCheck className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">No employees found</p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                {isAdminOrHR && (
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={employees.length > 0 && employees.every((e) => selectedIds.includes(e._id))}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                  </th>
                )}
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Department &amp; Role</th>
                <th className="px-4 py-3">Contact &amp; Bio</th>
                <th className="px-4 py-3 text-right">Basic Salary</th>
                <th className="px-4 py-3 text-center">Status</th>
                {isAdminOrHR && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortTableItems(employees, sortKey, sortDir, {
                employee_id: (e) => e.employee_id || '',
                name: (e) => `${e.firstName} ${e.lastName}`,
                dept: (e) => e.department || '',
                salary: (e) => Number(e.basic_salary || 0),
                joining: (e) => new Date(e.joining_date || 0),
                status: (e) => e.status || '',
              }).map((emp) => {
                const isEditingInline = inlineId === emp._id;
                return (
                  <tr key={emp._id} className="hover:bg-slate-50/60">
                    {isAdminOrHR && (
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(emp._id)}
                          onChange={() => toggleSelect(emp._id)}
                          className="rounded border-slate-300"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <EmployeeAvatar
                          photoUrl={emp.photo_url}
                          firstName={emp.firstName}
                          lastName={emp.lastName}
                          size="md"
                        />
                        <div>
                          <Link
                            href={`/hrm/employees/${emp._id}`}
                            className="font-semibold text-slate-900 hover:text-emerald-700 hover:underline block"
                          >
                            {emp.firstName} {emp.lastName}
                          </Link>
                          <div className="text-[11px] font-mono text-slate-500">
                            {emp.employee_id} • {emp.employee_type || 'Permanent'}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <Badge variant="default">{emp.department}</Badge>
                      <div className="text-xs text-slate-600 mt-1">{emp.designation}</div>
                      {emp.userId && (
                        <div className="text-[11px] text-emerald-700 flex items-center gap-1 mt-0.5">
                          <Link2 className="w-3 h-3" />@{emp.userId.username}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{emp.phone}</span>
                      </div>
                      {emp.email && (
                        <div className="flex items-center gap-1.5 text-slate-400 mt-0.5">
                          <Mail className="w-3 h-3" />
                          <span>{emp.email}</span>
                        </div>
                      )}
                      <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        {emp.shift || 'Regular'}
                        {emp.biometric_id ? ` • Bio: ${emp.biometric_id}` : ''}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                      {isEditingInline ? (
                        <input
                          type="number"
                          value={inlineData.basic_salary}
                          onChange={(e) =>
                            setInlineData({ ...inlineData, basic_salary: e.target.value })
                          }
                          className="w-24 px-2 py-1 text-right text-xs border border-emerald-400 rounded"
                        />
                      ) : (
                        formatBDT(emp.basic_salary)
                      )}
                    </td>

                    <td className="px-4 py-3 text-center">
                      {isEditingInline ? (
                        <select
                          value={inlineData.status}
                          onChange={(e) => setInlineData({ ...inlineData, status: e.target.value })}
                          className="px-2 py-1 text-xs border border-emerald-400 rounded bg-white"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        getStatusBadge(emp.status)
                      )}
                    </td>

                    {isAdminOrHR && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {isEditingInline ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={savingInline}
                              onClick={() => saveInlineEdit(emp._id)}
                              className="p-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setInlineId(null)}
                              className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-md"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startInlineEdit(emp)}
                              title="Quick Inline Edit"
                              className="px-2 py-1 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md"
                            >
                              Quick
                            </button>
                            <Link
                              href={`/hrm/employees/${emp._id}/edit`}
                              title="Edit Full Profile"
                              className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-md"
                            >
                              <Edit3 className="w-4 h-4" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleArchive(emp)}
                              title="Archive Employee"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortTableItems(employees, sortKey, sortDir, {
            employee_id: (e) => e.employee_id || '',
            name: (e) => `${e.firstName} ${e.lastName}`,
            dept: (e) => e.department || '',
            salary: (e) => Number(e.basic_salary || 0),
            joining: (e) => new Date(e.joining_date || 0),
            status: (e) => e.status || '',
          }).map((emp) => (
            <div
              key={emp._id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <EmployeeAvatar
                    photoUrl={emp.photo_url}
                    firstName={emp.firstName}
                    lastName={emp.lastName}
                    size="lg"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-mono text-slate-400">
                        {emp.employee_id}
                      </span>
                      {getStatusBadge(emp.status)}
                    </div>
                    <Link
                      href={`/hrm/employees/${emp._id}`}
                      className="text-base font-bold text-slate-900 hover:text-emerald-700 hover:underline mt-0.5 block"
                    >
                      {emp.firstName} {emp.lastName}
                    </Link>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Briefcase className="w-3 h-3" /> {emp.designation} • {emp.department}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Basic Salary</span>
                  <span className="font-bold text-slate-900">{formatBDT(emp.basic_salary)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Joined</span>
                  <span className="font-semibold text-slate-700">
                    {emp.joining_date ? formatDate(emp.joining_date) : '—'}
                  </span>
                </div>
                <div className="col-span-2 text-slate-600 flex items-center gap-1.5 pt-1">
                  <Phone className="w-3 h-3 text-slate-400" /> {emp.phone}
                </div>
              </div>

              {isAdminOrHR && (
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                  <Link
                    href={`/hrm/employees/${emp._id}/edit`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleArchive(emp)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Archive
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {metaInfo.totalPages > 1 && (
        <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-slate-200 text-xs">
          <span className="text-slate-500">
            Page <strong>{metaInfo.page}</strong> of <strong>{metaInfo.totalPages}</strong> (
            {metaInfo.total} total)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <button
              type="button"
              disabled={page >= metaInfo.totalPages}
              onClick={() => setPage((p) => Math.min(metaInfo.totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
