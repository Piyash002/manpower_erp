'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  RefreshCw,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/formatters';
import { TableToolbar } from '@/components/ui/TableToolbar';
import { downloadExcel, matchesSearch, printTableReport, sortTableItems, SortDir } from '@/lib/client-export';

export function AuditLogsView() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [entityFilter, setEntityFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const fetchLogs = async (pageNum = 1, entity = entityFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: '20',
      });
      if (entity) params.append('entity', entity);

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setPage(data.page || 1);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1, entityFilter);
  }, [entityFilter]);

  const filteredLogs = useMemo(() => {
    const filtered = logs.filter((log) =>
      matchesSearch(searchTerm, [
        log.action,
        log.userName,
        log.userRole,
        log.entity,
        log.entityId,
        typeof log.newValues === 'string' ? log.newValues : JSON.stringify(log.newValues || ''),
      ])
    );
    return sortTableItems(filtered, sortKey, sortDir, {
      timestamp: (l) => (l.timestamp ? new Date(l.timestamp).getTime() : 0),
      user: (l) => l.userName || '',
      action: (l) => l.action || '',
      entity: (l) => l.entity || '',
    });
  }, [logs, searchTerm, sortKey, sortDir]);

  const exportExcel = () => {
    downloadExcel({
      filename: `Audit-Logs-Page-${page}`,
      sheetName: 'AuditLogs',
      headers: ['Timestamp', 'User', 'Role', 'Action', 'Entity', 'Entity ID', 'New Values', 'Old Values'],
      rows: filteredLogs.map((log) => [
        formatDate(log.timestamp),
        log.userName || 'System',
        log.userRole || 'Auto',
        log.action || '',
        log.entity || '',
        log.entityId || '',
        typeof log.newValues === 'string' ? log.newValues : JSON.stringify(log.newValues || ''),
        typeof log.oldValues === 'string' ? log.oldValues : JSON.stringify(log.oldValues || ''),
      ]),
    });
  };

  const printLogs = () => {
    printTableReport({
      title: 'System Audit Logs',
      subtitle: entityFilter ? `Entity: ${entityFilter}` : 'All Entities',
      meta: `Page ${page}/${totalPages} | Showing ${filteredLogs.length} of ${total} records`,
      headers: ['Timestamp', 'User', 'Role', 'Action', 'Entity', 'Entity ID'],
      rows: filteredLogs.map((log) => [
        formatDate(log.timestamp),
        log.userName || 'System',
        log.userRole || 'Auto',
        log.action || '',
        log.entity || '',
        log.entityId || '',
      ]),
      landscape: true,
    });
  };

  const getEntityBadge = (entity: string) => {
    switch (entity?.toLowerCase()) {
      case 'student':
        return <Badge variant="info">Student</Badge>;
      case 'installment':
      case 'payment':
        return <Badge variant="success">Payment</Badge>;
      case 'user':
        return <Badge variant="purple">User Auth</Badge>;
      case 'batch':
        return <Badge variant="warning">Batch</Badge>;
      case 'trade':
        return <Badge variant="gray">Trade</Badge>;
      default:
        return <Badge variant="gray">{entity || 'System'}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">System Audit Logs</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Immutable log trail of all admissions, payment receipts, batch grades, and system alterations.
          </p>
        </div>

        <button
          onClick={() => fetchLogs(page, entityFilter)}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-xs transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Filter, Search, Sort, Excel & Print Bar */}
      <TableToolbar
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search action, user, entity, or ID..."
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(k, d) => {
          setSortKey(k);
          setSortDir(d);
        }}
        sortOptions={[
          { value: 'timestamp', label: 'Timestamp' },
          { value: 'user', label: 'User' },
          { value: 'action', label: 'Action' },
          { value: 'entity', label: 'Entity' },
        ]}
        filters={
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium"
          >
            <option value="">All Entities</option>
            <option value="Student">Candidates (Student)</option>
            <option value="Installment">Installments & Payments</option>
            <option value="Batch">Batches & Assessments</option>
            <option value="Trade">Trades & Countries</option>
            <option value="User">Users & Authentication</option>
            <option value="Payroll">Payroll & HRM</option>
            <option value="Account">Accounts & Vouchers</option>
          </select>
        }
        totalCount={logs.length}
        filteredCount={filteredLogs.length}
        hasActiveFilters={searchTerm !== '' || entityFilter !== ''}
        onReset={() => {
          setSearchTerm('');
          setEntityFilter('');
        }}
        onExportExcel={exportExcel}
        onPrint={printLogs}
      />

      {/* Audit Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Details / Changes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 font-medium">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
                    Fetching audit entries...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 font-medium">
                    No audit log records match your filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log._id || log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{formatDate(log.timestamp)}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                          {log.userName ? log.userName.charAt(0).toUpperCase() : 'S'}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-800">{log.userName || 'System'}</div>
                          <div className="text-[10px] text-slate-400">{log.userRole || 'Auto'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-900">{log.action}</span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getEntityBadge(log.entity)}
                      {log.entityId && (
                        <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                          ID: {log.entityId}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-md">
                      {log.newValues || log.oldValues ? (
                        <div className="font-mono text-[11px] bg-slate-50 p-2 rounded border border-slate-200/80 text-slate-700 max-h-24 overflow-y-auto">
                          {log.newValues && (
                            <div>
                              <span className="text-emerald-700 font-semibold font-sans">New: </span>
                              {typeof log.newValues === 'string'
                                ? log.newValues
                                : JSON.stringify(log.newValues)}
                            </div>
                          )}
                          {log.oldValues && (
                            <div className="mt-1 text-slate-500">
                              <span className="text-amber-700 font-semibold font-sans">Previous: </span>
                              {typeof log.oldValues === 'string'
                                ? log.oldValues
                                : JSON.stringify(log.oldValues)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">No alteration diff</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-700">{filteredLogs.length}</span> of{' '}
            <span className="font-semibold text-slate-700">{total}</span> total records
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fetchLogs(page - 1, entityFilter)}
              disabled={page <= 1 || loading}
              className="p-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none text-slate-600"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-medium text-slate-700">
              Page {page} of {totalPages || 1}
            </span>
            <button
              onClick={() => fetchLogs(page + 1, entityFilter)}
              disabled={page >= totalPages || loading}
              className="p-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none text-slate-600"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

