'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  KeyRound,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  History,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { formatDate } from '@/lib/formatters';
import { useAuth } from '@/components/layout/DashboardLayout';
import { TableToolbar } from '@/components/ui/TableToolbar';
import { downloadExcel, matchesSearch, printTableReport, sortTableItems, SortDir } from '@/lib/client-export';

export function UserManagement() {
  const { user: currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Search / Filter / Sort for Users & Audit Tabs
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userSortKey, setUserSortKey] = useState('name');
  const [userSortDir, setUserSortDir] = useState<SortDir>('asc');

  const [auditSearch, setAuditSearch] = useState('');
  const [auditEntityFilter, setAuditEntityFilter] = useState('all');
  const [auditSortKey, setAuditSortKey] = useState('timestamp');
  const [auditSortDir, setAuditSortDir] = useState<SortDir>('desc');

  // Add User Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    username: '',
    password: '',
    role: 'Counselor',
  });

  // Reset Password Modal State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [selectedUserForReset, setSelectedUserForReset] = useState<any | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  // Edit User Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editUserForm, setEditUserForm] = useState({
    _id: '',
    name: '',
    username: '',
    role: 'Counselor',
    active: true,
  });

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/audit-logs?limit=50');
      const data = await res.json();
      if (data.success) {
        setAuditLogs(data.logs || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    Promise.all([fetchUsers(), fetchAuditLogs()]).finally(() => setLoading(false));
  }, []);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // Handle Add User
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (newUserForm.password.length < 10) {
      setErrorMsg('Password must be at least 10 characters long as per ERP security guidelines.');
      return;
    }

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUserForm),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to create user');
      }

      setIsAddModalOpen(false);
      setNewUserForm({
        name: '',
        username: '',
        password: '',
        role: 'Counselor',
      });
      showSuccess('User account created successfully');
      fetchUsers();
      fetchAuditLogs();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Handle Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (resetPassword.length < 10) {
      setErrorMsg('Password must be at least 10 characters long.');
      return;
    }

    try {
      const res = await fetch(`/api/users/${selectedUserForReset._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: resetPassword }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to reset password');
      }

      setIsResetModalOpen(false);
      setResetPassword('');
      showSuccess(`Password updated for user ${selectedUserForReset.username}`);
      fetchAuditLogs();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Handle Edit User (Update name, role, active)
  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    try {
      const res = await fetch(`/api/users/${editUserForm._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editUserForm.name,
          role: editUserForm.role,
          active: editUserForm.active,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update user');
      }

      setIsEditModalOpen(false);
      showSuccess(`User @${editUserForm.username} updated successfully`);
      fetchUsers();
      fetchAuditLogs();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Handle Delete User (PRD: Admin cannot delete themselves)
  const handleDeleteUser = async (userId: string, username: string) => {
    if (currentUser?.userId === userId) {
      alert('Security policy: An Administrator cannot delete their own account.');
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete user "${username}"?`)) return;

    setErrorMsg('');
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to delete user');
      }
      showSuccess(data.message);
      fetchUsers();
      fetchAuditLogs();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const roleDisplayNames: Record<string, string> = {
    Admin: 'Administrator',
    Counselor: 'Admission (Counselor)',
    HR: 'HRM (HR Officer)',
    Accountant: 'Accounts (Accountant)',
    Viewer: 'Viewer (Read-Only)',
  };

  const roleBadgeVariants: Record<string, 'purple' | 'info' | 'warning' | 'gray'> = {
    Admin: 'purple',
    Counselor: 'info',
    HR: 'info',
    Accountant: 'warning',
    Viewer: 'gray',
  };

  const filteredUsers = useMemo(() => {
    const list = users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && !u.active) return false;
      if (statusFilter === 'inactive' && u.active) return false;
      return matchesSearch(userSearch, [u.name, u.username, u.role]);
    });
    return sortTableItems(list, userSortKey, userSortDir, {
      name: (u) => u.name || '',
      username: (u) => u.username || '',
      role: (u) => u.role || '',
      status: (u) => (u.active ? 'Active' : 'Deactivated'),
      lastLogin: (u) => (u.lastLogin ? new Date(u.lastLogin).getTime() : 0),
    });
  }, [users, userSearch, roleFilter, statusFilter, userSortKey, userSortDir]);

  const filteredAuditLogs = useMemo(() => {
    const list = auditLogs.filter((log) => {
      if (auditEntityFilter !== 'all' && log.entity !== auditEntityFilter) return false;
      return matchesSearch(auditSearch, [
        log.userName,
        log.userRole,
        log.action,
        log.entity,
        log.newValues ? JSON.stringify(log.newValues) : '',
      ]);
    });
    return sortTableItems(list, auditSortKey, auditSortDir, {
      timestamp: (l) => (l.timestamp ? new Date(l.timestamp).getTime() : 0),
      user: (l) => l.userName || '',
      action: (l) => l.action || '',
      entity: (l) => l.entity || '',
    });
  }, [auditLogs, auditSearch, auditEntityFilter, auditSortKey, auditSortDir]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            User Accounts & Security Logs
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Admin console to manage system users, assign role-based access, and audit critical actions.
          </p>
        </div>

        <button
          onClick={() => {
            setErrorMsg('');
            setIsAddModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add System User</span>
        </button>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-800">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-rose-900">Security Warning</h4>
            <p className="text-sm mt-0.5">{errorMsg}</p>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'users'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>System Users ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'audit'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Recent Activity & Audit Trail</span>
        </button>
      </div>

      {/* TAB 1: USERS LIST */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <TableToolbar
            search={userSearch}
            onSearchChange={setUserSearch}
            searchPlaceholder="Search full name, username or role..."
            sortKey={userSortKey}
            sortDir={userSortDir}
            onSortChange={(k, d) => {
              setUserSortKey(k);
              setUserSortDir(d);
            }}
            sortOptions={[
              { value: 'name', label: 'Full Name' },
              { value: 'username', label: 'Username' },
              { value: 'role', label: 'Role' },
              { value: 'status', label: 'Status' },
              { value: 'lastLogin', label: 'Last Login' },
            ]}
            filters={
              <>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
                >
                  <option value="all">All Roles</option>
                  <option value="Admin">Administrator (Full Access)</option>
                  <option value="Counselor">Admission (Counselor)</option>
                  <option value="HR">HRM (HR Officer)</option>
                  <option value="Accountant">Accounts (Accountant)</option>
                  <option value="Viewer">Viewer (Read-Only)</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Deactivated</option>
                </select>
              </>
            }
            totalCount={users.length}
            filteredCount={filteredUsers.length}
            hasActiveFilters={userSearch !== '' || roleFilter !== 'all' || statusFilter !== 'all'}
            onReset={() => {
              setUserSearch('');
              setRoleFilter('all');
              setStatusFilter('all');
            }}
            onExportExcel={() =>
              downloadExcel({
                filename: 'System-Users',
                sheetName: 'Users',
                headers: ['Full Name', 'Username', 'Role', 'Status', 'Last Login'],
                rows: filteredUsers.map((u) => [
                  u.name || '',
                  `@${u.username}`,
                  u.role || '',
                  u.active ? 'Active' : 'Deactivated',
                  formatDate(u.lastLogin),
                ]),
              })
            }
            onPrint={() =>
              printTableReport({
                title: 'System Users Directory',
                meta: `Users: ${filteredUsers.length}`,
                headers: ['Full Name', 'Username', 'Assigned Role', 'Account Status', 'Last Login'],
                rows: filteredUsers.map((u) => [
                  u.name || '',
                  `@${u.username}`,
                  u.role || '',
                  u.active ? 'Active' : 'Deactivated',
                  formatDate(u.lastLogin),
                ]),
              })
            }
          />
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[650px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                <tr>
                  <th className="px-5 py-3">Full Name</th>
                  <th className="px-5 py-3">Username</th>
                  <th className="px-5 py-3">Assigned Role</th>
                  <th className="px-5 py-3">Account Status</th>
                  <th className="px-5 py-3">Last Login</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  const isCurrent = currentUser?.userId === u._id;
                  return (
                    <tr key={u._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-slate-900">
                        {u.name}
                        {isCurrent && (
                          <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded">
                            You
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-slate-600">@{u.username}</td>
                      <td className="px-5 py-3.5">
                        <Badge variant={roleBadgeVariants[u.role] || 'gray'} size="sm">
                          {roleDisplayNames[u.role] || u.role}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        {u.active ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-rose-700 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Deactivated
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-500">
                        {formatDate(u.lastLogin)}
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-1.5">
                        <button
                          onClick={() => {
                            setEditUserForm({
                              _id: u._id,
                              name: u.name,
                              username: u.username,
                              role: u.role,
                              active: u.active ?? true,
                            });
                            setIsEditModalOpen(true);
                          }}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit User Role & Permissions"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            setSelectedUserForReset(u);
                            setResetPassword('');
                            setIsResetModalOpen(true);
                          }}
                          className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Reset Password"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>

                        {!isCurrent && (
                          <button
                            onClick={() => handleDeleteUser(u._id, u.username)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete User"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      {/* TAB 2: AUDIT LOG */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <TableToolbar
            search={auditSearch}
            onSearchChange={setAuditSearch}
            searchPlaceholder="Search user, action, entity or details..."
            sortKey={auditSortKey}
            sortDir={auditSortDir}
            onSortChange={(k, d) => {
              setAuditSortKey(k);
              setAuditSortDir(d);
            }}
            sortOptions={[
              { value: 'timestamp', label: 'Timestamp' },
              { value: 'user', label: 'User' },
              { value: 'action', label: 'Action' },
              { value: 'entity', label: 'Entity' },
            ]}
            filters={
              <select
                value={auditEntityFilter}
                onChange={(e) => setAuditEntityFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
              >
                <option value="all">All Entities</option>
                {Array.from(new Set(auditLogs.map((l) => l.entity).filter(Boolean))).map((ent) => (
                  <option key={String(ent)} value={String(ent)}>
                    {String(ent)}
                  </option>
                ))}
              </select>
            }
            totalCount={auditLogs.length}
            filteredCount={filteredAuditLogs.length}
            hasActiveFilters={auditSearch !== '' || auditEntityFilter !== 'all'}
            onReset={() => {
              setAuditSearch('');
              setAuditEntityFilter('all');
            }}
            onExportExcel={() =>
              downloadExcel({
                filename: 'Recent-Audit-Trail',
                sheetName: 'AuditTrail',
                headers: ['Timestamp', 'User', 'Role', 'Action', 'Entity', 'Details'],
                rows: filteredAuditLogs.map((log) => [
                  new Date(log.timestamp).toLocaleString('en-GB'),
                  log.userName || 'System',
                  log.userRole || '',
                  log.action || '',
                  log.entity || '',
                  log.newValues ? JSON.stringify(log.newValues) : '-',
                ]),
              })
            }
            onPrint={() =>
              printTableReport({
                title: 'Recent Activity & Audit Trail',
                meta: `Events: ${filteredAuditLogs.length}`,
                headers: ['Timestamp', 'User', 'Role', 'Action', 'Entity', 'Details'],
                rows: filteredAuditLogs.map((log) => [
                  new Date(log.timestamp).toLocaleString('en-GB'),
                  log.userName || 'System',
                  log.userRole || '',
                  log.action || '',
                  log.entity || '',
                  log.newValues ? JSON.stringify(log.newValues).slice(0, 120) : '-',
                ]),
                landscape: true,
              })
            }
          />
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Showing latest system audit trail entries (PRD Section 3.4)</span>
            <span className="font-mono">Total {filteredAuditLogs.length} events shown</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Timestamp</th>
                  <th className="px-4 py-2.5">User</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Entity</th>
                  <th className="px-4 py-2.5">Event Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredAuditLogs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap font-sans">
                      {new Date(log.timestamp).toLocaleString('en-GB')}
                    </td>
                    <td className="px-4 py-2.5 font-sans font-medium text-slate-800">
                      {log.userName}
                      <span className="text-[10px] text-slate-400 block">({log.userRole})</span>
                    </td>
                    <td className="px-4 py-2.5 font-bold text-blue-700 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{log.entity}</td>
                    <td className="px-4 py-2.5 text-slate-700 max-w-md truncate font-sans">
                      {log.newValues ? JSON.stringify(log.newValues) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      {/* ADD USER MODAL */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add System User"
        description="Create staff credentials with role-based permissions."
        maxWidth="md"
      >
        <form onSubmit={handleAddUser} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={newUserForm.name}
              onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
              placeholder="e.g. Faruk Hossain"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              Username (Lowercase, Unique) *
            </label>
            <input
              type="text"
              required
              value={newUserForm.username}
              onChange={(e) =>
                setNewUserForm({ ...newUserForm, username: e.target.value.toLowerCase() })
              }
              placeholder="e.g. faruk"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              Initial Password (Min 10 chars) *
            </label>
            <input
              type="password"
              required
              minLength={10}
              value={newUserForm.password}
              onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
              placeholder="Minimum 10 characters"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              Assigned Role (Module Access) *
            </label>
            <select
              value={newUserForm.role}
              onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-semibold"
            >
              <optgroup label="Section-Specific Roles">
                <option value="Counselor">🎓 Admission Officer (Admission Section Access)</option>
                <option value="HR">👥 HRM Officer (HRM Section Access)</option>
                <option value="Accountant">💰 Accounts Officer (Accounts Section Access)</option>
              </optgroup>
              <optgroup label="System Roles">
                <option value="Admin">🛡️ System Administrator (Full Access to All 3 Sections)</option>
                <option value="Viewer">👁️ Viewer (Read-only Access)</option>
              </optgroup>
            </select>
          </div>

          <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm"
            >
              Create Account
            </button>
          </div>
        </form>
      </Modal>

      {/* RESET PASSWORD MODAL */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Set New Password"
        description={`Set a new login password for @${selectedUserForReset?.username}`}
        maxWidth="sm"
      >
        <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              New Password (Min 10 characters) *
            </label>
            <input
              type="password"
              required
              minLength={10}
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="Minimum 10 characters"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
            />
          </div>

          <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsResetModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm"
            >
              Update Password
            </button>
          </div>
        </form>
      </Modal>

      {/* EDIT USER MODAL */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit System User"
        description={`Update module role assignment or active status for @${editUserForm.username}`}
        maxWidth="md"
      >
        <form onSubmit={handleEditUser} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={editUserForm.name}
              onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              Username
            </label>
            <input
              type="text"
              disabled
              value={`@${editUserForm.username}`}
              className="w-full px-3 py-2 border border-slate-200 bg-slate-100 rounded-lg text-sm text-slate-600 font-mono cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              Assigned Role (Module Access) *
            </label>
            <select
              value={editUserForm.role}
              onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-semibold"
            >
              <optgroup label="Section-Specific Roles">
                <option value="Counselor">🎓 Admission Officer (Admission Section Access)</option>
                <option value="HR">👥 HRM Officer (HRM Section Access)</option>
                <option value="Accountant">💰 Accounts Officer (Accounts Section Access)</option>
              </optgroup>
              <optgroup label="System Roles">
                <option value="Admin">🛡️ System Administrator (Full Access to All 3 Sections)</option>
                <option value="Viewer">👁️ Viewer (Read-only Access)</option>
              </optgroup>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              Account Status *
            </label>
            <select
              value={editUserForm.active ? 'active' : 'inactive'}
              onChange={(e) =>
                setEditUserForm({ ...editUserForm, active: e.target.value === 'active' })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-semibold"
            >
              <option value="active">Active (Access Allowed)</option>
              <option value="inactive">Deactivated (Access Blocked)</option>
            </select>
          </div>

          <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm"
            >
              Save Changes
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

