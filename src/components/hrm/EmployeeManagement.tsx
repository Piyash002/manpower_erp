'use client';

import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { formatBDT, formatDate } from '@/lib/formatters';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/components/layout/DashboardLayout';

interface EmployeeRecord {
  _id: string;
  employee_id: string;
  biometric_id?: string | null;
  shift?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  department: 'Visa' | 'Training' | 'Accounts' | 'Agent' | 'Counseling' | 'Administration' | 'Other';
  designation: string;
  basic_salary: number;
  commission_rate: number;
  joining_date?: string;
  status: 'Active' | 'On Leave' | 'Inactive' | 'Terminated';
  userId?: {
    _id: string;
    name: string;
    username: string;
    role: string;
  } | null;
}

const DEPARTMENTS = [
  'Visa',
  'Training',
  'Accounts',
  'Agent',
  'Counseling',
  'Administration',
  'Other',
] as const;

const STATUS_OPTIONS = ['Active', 'On Leave', 'Inactive', 'Terminated'] as const;

export function EmployeeManagement() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [erpUsers, setErpUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Inline quick edit state
  const [inlineId, setInlineId] = useState<string | null>(null);
  const [inlineData, setInlineData] = useState({
    basic_salary: '0',
    commission_rate: '0',
    status: 'Active',
  });
  const [savingInline, setSavingInline] = useState(false);

  // Modal Create / Edit state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<EmployeeRecord | null>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    department: 'Counseling',
    designation: '',
    basic_salary: '15000',
    commission_rate: '0',
    joining_date: new Date().toISOString().split('T')[0],
    status: 'Active',
    userId: '',
    biometric_id: '',
    shift: 'Regular',
  });
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (deptFilter !== 'all') params.append('department', deptFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (search.trim()) params.append('search', search.trim());

      const requests: Promise<Response>[] = [fetch(`/api/hrm/employees?${params.toString()}`)];
      if (isAdmin) {
        requests.push(fetch('/api/users'));
      }

      const [empRes, userRes] = await Promise.all(requests);
      const empJson = await empRes.json();
      if (!empRes.ok || !empJson.success) {
        throw new Error(empJson.message || 'Failed to load employees');
      }
      setEmployees(empJson.data || []);

      if (userRes && userRes.ok) {
        const userJson = await userRes.json();
        if (userJson.success) {
          setErpUsers(userJson.users || []);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Could not load employees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      loadData();
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptFilter, statusFilter, search, isAdmin]);

  const openCreateModal = () => {
    setEditingEmp(null);
    setFormData({
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      department: 'Counseling',
      designation: '',
      basic_salary: '15000',
      commission_rate: '0',
      joining_date: new Date().toISOString().split('T')[0],
      status: 'Active',
      userId: '',
      biometric_id: '',
      shift: 'Regular',
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const openEditModal = (emp: EmployeeRecord) => {
    setEditingEmp(emp);
    setFormData({
      firstName: emp.firstName,
      lastName: emp.lastName,
      phone: emp.phone,
      email: emp.email || '',
      department: emp.department,
      designation: emp.designation,
      basic_salary: String(emp.basic_salary || 0),
      commission_rate: String(emp.commission_rate || 0),
      joining_date: emp.joining_date ? emp.joining_date.split('T')[0] : '',
      status: emp.status,
      userId: emp.userId?._id || '',
      biometric_id: emp.biometric_id || '',
      shift: emp.shift || 'Regular',
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setSubmitting(true);

    try {
      const payload = {
        ...formData,
        basic_salary: Math.round(Number(formData.basic_salary) || 0),
        commission_rate: Number(formData.commission_rate) || 0,
        userId: formData.userId || null,
      };

      const url = editingEmp ? `/api/hrm/employees/${editingEmp._id}` : '/api/hrm/employees';
      const method = editingEmp ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Operation failed');
      }

      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const startInlineEdit = (emp: EmployeeRecord) => {
    setInlineId(emp._id);
    setInlineData({
      basic_salary: String(emp.basic_salary || 0),
      commission_rate: String(emp.commission_rate || 0),
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
          basic_salary: Math.round(Number(inlineData.basic_salary) || 0),
          commission_rate: Number(inlineData.commission_rate) || 0,
          status: inlineData.status,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.message || 'Failed to save');
        return;
      }
      setInlineId(null);
      loadData();
    } finally {
      setSavingInline(false);
    }
  };

  const handleDelete = async (emp: EmployeeRecord) => {
    if (!confirm(`Remove employee ${emp.employee_id} (${emp.firstName} ${emp.lastName})?`)) return;
    const res = await fetch(`/api/hrm/employees/${emp._id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok || !json.success) {
      alert(json.message || 'Cannot delete employee');
      return;
    }
    loadData();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Active':
        return <Badge variant="success">Active</Badge>;
      case 'On Leave':
        return <Badge variant="warning">On Leave</Badge>;
      case 'Inactive':
        return <Badge variant="gray">Inactive</Badge>;
      default:
        return <Badge variant="danger">{status}</Badge>;
    }
  };

  const getDeptColor = (dept: string) => {
    switch (dept) {
      case 'Agent':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Training':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Visa':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Accounts':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const activeCount = employees.filter((e) => e.status === 'Active').length;
  const agentsCount = employees.filter((e) => e.department === 'Agent').length;
  const totalBasicPayroll = employees
    .filter((e) => e.status === 'Active' || e.status === 'On Leave')
    .reduce((sum, e) => sum + (e.basic_salary || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Employees &amp; Recruitment Agents
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage trainers, visa officers, accountants, and commission-earning recruitment agents.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {isAdmin && (
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Employee / Agent</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Total Staff Roster</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {employees.length}{' '}
            <span className="text-xs font-medium text-emerald-700">({activeCount} Active)</span>
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-purple-700 uppercase">Recruitment Agents</span>
          <p className="text-2xl font-bold text-purple-800 mt-1">{agentsCount}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Monthly Base Payroll</span>
          <p className="text-2xl font-bold text-slate-900 font-mono mt-1">
            {formatBDT(totalBasicPayroll)}
          </p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700"
          >
            <option value="all">Department: All</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700"
          >
            <option value="all">Status: All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search name, ID, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
          <RefreshCw className="w-7 h-7 animate-spin text-emerald-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-medium">Loading employee roster...</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-rose-200 py-10 text-center text-rose-600 text-sm">
          <AlertCircle className="w-6 h-6 mx-auto mb-2" />
          {error}
        </div>
      ) : employees.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-slate-500">
          <UserCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="font-semibold text-slate-700">No employees or agents added yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Add staff members, batch trainers, or referral agents to enable attendance &amp; payroll.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map((emp) => (
            <div
              key={emp._id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center font-bold text-emerald-700">
                      {emp.firstName.charAt(0)}
                      {emp.lastName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">
                        {emp.firstName} {emp.lastName}
                      </h3>
                      <span className="font-mono text-[11px] text-slate-500">{emp.employee_id}</span>
                    </div>
                  </div>
                  {getStatusBadge(emp.status)}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border ${getDeptColor(
                      emp.department
                    )}`}
                  >
                    {emp.department}
                  </span>
                  <span className="text-xs text-slate-600 font-medium">{emp.designation}</span>
                </div>

                <div className="mt-3 space-y-1 text-xs text-slate-600">
                  <p className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-mono">{emp.phone}</span>
                  </p>
                  {emp.email && (
                    <p className="flex items-center gap-1.5 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>{emp.email}</span>
                    </p>
                  )}
                  {emp.userId && (
                    <p className="flex items-center gap-1.5 text-blue-700">
                      <Link2 className="w-3.5 h-3.5" />
                      <span>ERP User: @{emp.userId.username}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">Basic / Comm</span>
                  <span className="font-bold text-sm text-slate-900 font-mono">
                    {formatBDT(emp.basic_salary)}
                  </span>
                  {emp.commission_rate > 0 && (
                    <span className="text-[11px] font-semibold text-purple-700 ml-1.5">
                      +{emp.commission_rate}%
                    </span>
                  )}
                </div>

                {isAdmin && (
                  <button
                    onClick={() => openEditModal(emp)}
                    className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Employee / Agent</th>
                <th className="px-4 py-3">Dept &amp; Role</th>
                <th className="px-4 py-3">Contact &amp; ERP Link</th>
                <th className="px-4 py-3 text-right">Basic Salary</th>
                <th className="px-4 py-3 text-center">Comm %</th>
                <th className="px-4 py-3 text-center">Status</th>
                {isAdmin && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((emp) => {
                const isInline = inlineId === emp._id;
                return (
                  <tr key={emp._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {emp.employee_id}
                        {emp.biometric_id ? ` • Bio: ${emp.biometric_id}` : ''}
                      </div>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded-md border ${getDeptColor(
                          emp.department
                        )}`}
                      >
                        {emp.department}
                      </span>
                      <div className="text-xs text-slate-600 mt-0.5">{emp.designation}</div>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      <div className="font-mono text-slate-700">{emp.phone}</div>
                      {emp.userId ? (
                        <span className="text-[11px] text-blue-700 font-medium">
                          @{emp.userId.username} ({emp.userId.role})
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">No ERP login linked</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap font-mono">
                      {isInline ? (
                        <input
                          type="number"
                          min="0"
                          value={inlineData.basic_salary}
                          onChange={(e) =>
                            setInlineData({ ...inlineData, basic_salary: e.target.value })
                          }
                          className="w-24 px-2 py-1 text-xs border border-emerald-400 rounded text-right font-bold"
                        />
                      ) : (
                        <span className="font-bold text-slate-900">
                          {formatBDT(emp.basic_salary)}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-center whitespace-nowrap font-mono text-xs">
                      {isInline ? (
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={inlineData.commission_rate}
                          onChange={(e) =>
                            setInlineData({ ...inlineData, commission_rate: e.target.value })
                          }
                          className="w-16 px-2 py-1 text-xs border border-emerald-400 rounded text-center font-bold"
                        />
                      ) : emp.commission_rate > 0 ? (
                        <span className="font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                          {emp.commission_rate}%
                        </span>
                      ) : (
                        <span className="text-slate-400">0%</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {isInline ? (
                        <select
                          value={inlineData.status}
                          onChange={(e) => setInlineData({ ...inlineData, status: e.target.value })}
                          className="px-2 py-1 text-xs border border-emerald-400 rounded"
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

                    {isAdmin && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {isInline ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={savingInline}
                              onClick={() => saveInlineEdit(emp._id)}
                              className="p-1.5 text-white bg-emerald-600 hover:bg-emerald-700 rounded-md"
                              title="Save"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setInlineId(null)}
                              className="p-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startInlineEdit(emp)}
                              className="px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md"
                              title="Quick Inline Edit Salary/Status"
                            >
                              Quick Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(emp)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-md"
                              title="Full Edit"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(emp)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                              title="Delete Employee"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
      )}

      {/* CREATE / EDIT MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingEmp ? `Edit ${editingEmp.employee_id}` : 'Add New Employee / Agent'}
        description="Configure department, salary, commission percentage, and optional ERP user link."
        maxWidth="lg"
      >
        <form onSubmit={handleModalSubmit} className="space-y-4">
          {modalError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">First Name *</label>
              <input
                type="text"
                required
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name *</label>
              <input
                type="text"
                required
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Phone *</label>
              <input
                type="text"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="017XXXXXXXX"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department *</label>
              <select
                value={formData.department}
                onChange={(e) => {
                  const dept = e.target.value;
                  setFormData({
                    ...formData,
                    department: dept,
                    commission_rate:
                      dept === 'Agent' && Number(formData.commission_rate) === 0
                        ? '5'
                        : formData.commission_rate,
                  });
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Designation *</label>
              <input
                type="text"
                required
                value={formData.designation}
                onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                placeholder="e.g. Field Agent / Senior Welder Trainer"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Basic Salary (BDT) *
              </label>
              <input
                type="number"
                min="0"
                required
                value={formData.basic_salary}
                onChange={(e) => setFormData({ ...formData, basic_salary: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Commission Rate (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={formData.commission_rate}
                onChange={(e) => setFormData({ ...formData, commission_rate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
              <span className="text-[10px] text-slate-400">
                Applied to monthly payments of candidates referred by this employee.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Joining Date</label>
              <input
                type="date"
                value={formData.joining_date}
                onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Biometric Device User ID
              </label>
              <input
                type="text"
                value={(formData as any).biometric_id || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    biometric_id: e.target.value.toUpperCase(),
                  } as any)
                }
                placeholder="e.g. 1001 or BIO-01"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Shift</label>
              <select
                value={(formData as any).shift || 'Regular'}
                onChange={(e) => setFormData({ ...formData, shift: e.target.value } as any)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="Regular">Regular</option>
                <option value="Morning">Morning</option>
                <option value="Evening">Evening</option>
                <option value="Night">Night</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Link ERP Login User (Optional — enables self Attendance Check-In)
              </label>
              <select
                value={formData.userId}
                onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">No ERP User Linked (e.g. External Field Agent)</option>
                {erpUsers.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} (@{u.username} • {u.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Saving...' : editingEmp ? 'Update Employee' : 'Create Employee'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

