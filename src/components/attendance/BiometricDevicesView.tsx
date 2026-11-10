'use client';

import React, { useEffect, useState } from 'react';
import {
  Cpu,
  Plus,
  RefreshCw,
  Trash2,
  Copy,
  DownloadCloud,
  AlertTriangle,
  CheckCircle2,
  Link2,
  ListChecks,
  History,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { formatDate } from '@/lib/formatters';

function formatTime(val?: string | Date | null): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type SubTab = 'devices' | 'raw' | 'unmatched' | 'sync';

export function BiometricDevicesView() {
  const [subTab, setSubTab] = useState<SubTab>('devices');

  const [devices, setDevices] = useState<any[]>([]);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [rawLogs, setRawLogs] = useState<any[]>([]);
  const [unmatchedGroups, setUnmatchedGroups] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

  // Raw filter
  const [rawDate, setRawDate] = useState('');
  const [rawSource, setRawSource] = useState('all');
  const [rawMatched, setRawMatched] = useState('all');

  // Unmatched assignment map: biometric_id -> selected employee._id
  const [assignMap, setAssignMap] = useState<Record<string, string>>({});

  // Device Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deviceForm, setDeviceForm] = useState({
    _id: '',
    name: '',
    brand: 'ZKTeco',
    ip_address: '',
    port: '4370',
    serial_no: '',
    location: '',
    pull_url: '',
    status: 'Active',
  });

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const rawParams = new URLSearchParams();
      if (rawDate) rawParams.set('date', rawDate);
      if (rawSource !== 'all') rawParams.set('source', rawSource);
      if (rawMatched !== 'all') rawParams.set('matched', rawMatched);

      const [devRes, rawRes, unmRes, empRes] = await Promise.all([
        fetch('/api/attendance/devices'),
        fetch(`/api/attendance/raw-logs?${rawParams.toString()}`),
        fetch('/api/attendance/unmatched'),
        fetch('/api/hrm/employees'),
      ]);

      const [devJson, rawJson, unmJson, empJson] = await Promise.all([
        devRes.json(),
        rawRes.json(),
        unmRes.json(),
        empRes.json(),
      ]);

      if (devJson.success && devJson.data) {
        setDevices(devJson.data.devices || []);
        setSyncLogs(devJson.data.syncLogs || []);
      }
      if (rawJson.success) setRawLogs(rawJson.data || []);
      if (unmJson.success && unmJson.data) setUnmatchedGroups(unmJson.data.groups || []);
      if (empJson.success) setEmployees(empJson.data || []);
    } catch (err) {
      console.error('Failed loading biometric console:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawDate, rawSource, rawMatched]);

  const handleSaveDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);
    const method = deviceForm._id ? 'PUT' : 'POST';
    const res = await fetch('/api/attendance/devices', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...deviceForm,
        port: Number(deviceForm.port) || 4370,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setBanner({ type: 'err', msg: json.message || 'Failed to save device' });
      return;
    }
    setBanner({ type: 'ok', msg: json.message });
    setIsModalOpen(false);
    loadAll();
  };

  const handleDeleteDevice = async (id: string) => {
    if (!confirm('Delete this biometric device?')) return;
    const res = await fetch(`/api/attendance/devices?id=${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      setBanner({ type: 'ok', msg: json.message });
      loadAll();
    } else {
      setBanner({ type: 'err', msg: json.message || 'Delete failed' });
    }
  };

  const handlePullNow = async (deviceId: string) => {
    setBusyId(deviceId);
    setBanner(null);
    try {
      const res = await fetch('/api/attendance/devices/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId }),
      });
      const json = await res.json();
      setBanner({
        type: json.success ? 'ok' : 'err',
        msg: json.message || (json.success ? 'Device pull completed.' : 'Pull failed.'),
      });
      loadAll();
    } finally {
      setBusyId(null);
    }
  };

  const handleMapUnmatched = async (biometricId: string) => {
    const employeeId = assignMap[biometricId];
    if (!employeeId) {
      setBanner({ type: 'err', msg: `Choose an employee to map to "${biometricId}".` });
      return;
    }
    setBusyId(biometricId);
    setBanner(null);
    try {
      const res = await fetch('/api/attendance/unmatched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ biometric_id: biometricId, employee_id: employeeId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Mapping failed');
      setBanner({ type: 'ok', msg: json.message });
      loadAll();
    } catch (err: any) {
      setBanner({ type: 'err', msg: err.message });
    } finally {
      setBusyId(null);
    }
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setBanner({ type: 'ok', msg: `Copied ${label} to clipboard.` });
  };

  return (
    <div className="space-y-5">
      {/* Header & Sub-Tabs */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-emerald-600" />
            Biometric Devices &amp; Punch Logs
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Register ZKTeco / Hikvision hardware, inspect raw immutable punches, map unmatched IDs, and review device sync runs.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setDeviceForm({
              _id: '',
              name: '',
              brand: 'ZKTeco',
              ip_address: '',
              port: '4370',
              serial_no: '',
              location: '',
              pull_url: '',
              status: 'Active',
            });
            setIsModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
        >
          <Plus className="w-4 h-4" /> Register Device
        </button>
      </div>

      {/* Sub-navigation pills */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-semibold w-fit">
        <button
          type="button"
          onClick={() => setSubTab('devices')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md ${
            subTab === 'devices' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" /> Devices ({devices.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('raw')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md ${
            subTab === 'raw' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          <ListChecks className="w-3.5 h-3.5" /> Raw Punch Logs ({rawLogs.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('unmatched')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md ${
            subTab === 'unmatched' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" /> Unmatched IDs ({unmatchedGroups.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('sync')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md ${
            subTab === 'sync' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          <History className="w-3.5 h-3.5" /> Sync Logs ({syncLogs.length})
        </button>
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
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{banner.msg}</span>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center bg-white rounded-xl border border-slate-200">
          <RefreshCw className="w-7 h-7 animate-spin text-emerald-600 mx-auto" />
        </div>
      ) : (
        <>
          {/* TAB 1: DEVICES */}
          {subTab === 'devices' && (
            <div className="space-y-4">
              <div className="bg-slate-900 text-slate-200 p-4 rounded-xl text-xs flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-white">Push Endpoint:</span>{' '}
                  <code className="text-emerald-300 font-mono">POST /api/attendance/biometric</code>{' '}
                  — pass header{' '}
                  <code className="text-amber-300 font-mono">x-device-token: &lt;device_token&gt;</code>
                </div>
                <button
                  type="button"
                  onClick={() => copyText('/api/attendance/biometric', 'Push endpoint path')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px]"
                >
                  <Copy className="w-3 h-3" /> Copy Endpoint
                </button>
              </div>

              {devices.length === 0 ? (
                <div className="bg-white p-10 text-center rounded-xl border border-slate-200 text-xs text-slate-400">
                  No biometric devices registered yet. Click &ldquo;Register Device&rdquo; to add one.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {devices.map((dev) => (
                    <div
                      key={dev._id}
                      className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-900 text-sm">{dev.name}</h3>
                            <Badge variant={dev.status === 'Active' ? 'success' : 'default'}>
                              {dev.status}
                            </Badge>
                          </div>
                          <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                            {dev.brand} • SN: {dev.serial_no} • {dev.ip_address}:{dev.port}
                          </p>
                          {dev.location && (
                            <p className="text-[11px] text-slate-500">Location: {dev.location}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setDeviceForm({
                                _id: dev._id,
                                name: dev.name,
                                brand: dev.brand,
                                ip_address: dev.ip_address,
                                port: String(dev.port || 4370),
                                serial_no: dev.serial_no,
                                location: dev.location || '',
                                pull_url: dev.pull_url || '',
                                status: dev.status || 'Active',
                              });
                              setIsModalOpen(true);
                            }}
                            className="px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 rounded"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDevice(dev._id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="bg-slate-50 rounded-lg p-2.5 text-[11px] font-mono flex items-center justify-between gap-2 border border-slate-100">
                        <span className="truncate text-slate-700">
                          Token: {dev.device_token || 'N/A'}
                        </span>
                        {dev.device_token && (
                          <button
                            type="button"
                            onClick={() => copyText(dev.device_token, 'device token')}
                            className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700"
                          >
                            <Copy className="w-3 h-3" /> Copy
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                        <span>
                          Last Sync:{' '}
                          {dev.last_sync_at
                            ? `${formatDate(dev.last_sync_at)} ${formatTime(dev.last_sync_at)}`
                            : 'Never'}
                        </span>
                        <button
                          type="button"
                          disabled={busyId === dev._id}
                          onClick={() => handlePullNow(dev._id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50"
                        >
                          <DownloadCloud className="w-3.5 h-3.5" />
                          <span>{busyId === dev._id ? 'Pulling...' : 'Pull Now'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: RAW PUNCH LOGS */}
          {subTab === 'raw' && (
            <div className="space-y-3">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2 text-xs">
                <input
                  type="date"
                  value={rawDate}
                  onChange={(e) => setRawDate(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
                {rawDate && (
                  <button
                    type="button"
                    onClick={() => setRawDate('')}
                    className="px-2 py-1.5 text-[11px] bg-slate-100 rounded-lg"
                  >
                    Clear Date
                  </button>
                )}
                <select
                  value={rawSource}
                  onChange={(e) => setRawSource(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold"
                >
                  <option value="all">Source: All</option>
                  <option value="Manual">Manual</option>
                  <option value="Biometric">Biometric</option>
                  <option value="Import">Import</option>
                  <option value="Self Check-in">Self Check-in</option>
                </select>
                <select
                  value={rawMatched}
                  onChange={(e) => setRawMatched(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold"
                >
                  <option value="all">Match: All</option>
                  <option value="true">Matched Only</option>
                  <option value="false">Unmatched Only</option>
                </select>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-3">Punch Time</th>
                      <th className="px-4 py-3">Employee / PIN</th>
                      <th className="px-4 py-3 text-center">Type</th>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Device / Note</th>
                      <th className="px-4 py-3 text-center">Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rawLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-slate-400">
                          No raw punch logs found.
                        </td>
                      </tr>
                    ) : (
                      rawLogs.map((log) => (
                        <tr key={log._id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-2.5 whitespace-nowrap font-mono">
                            {formatDate(log.timestamp)} {formatTime(log.timestamp)}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {log.employee_id ? (
                              <div>
                                <span className="font-semibold text-slate-900">
                                  {log.employee_id.firstName} {log.employee_id.lastName}
                                </span>{' '}
                                <span className="text-slate-400 font-mono">
                                  ({log.employee_id.employee_id})
                                </span>
                              </div>
                            ) : (
                              <span className="font-mono text-amber-700 font-semibold">
                                PIN: {log.biometric_id || 'Unknown'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <Badge variant={log.punch_type === 'IN' ? 'success' : 'warning'}>
                              {log.punch_type}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-slate-700">
                            {log.source}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 max-w-xs truncate">
                            {log.device_id?.name || log.reason || log.location || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {log.matched === false ? (
                              <Badge variant="danger">Unmatched</Badge>
                            ) : (
                              <Badge variant="success">Matched</Badge>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: UNMATCHED BIOMETRIC IDs */}
          {subTab === 'unmatched' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Biometric PIN / ID</th>
                    <th className="px-4 py-3">Waiting Punches</th>
                    <th className="px-4 py-3">Latest Seen</th>
                    <th className="px-4 py-3">Source / Device</th>
                    <th className="px-4 py-3">Assign To Employee</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unmatchedGroups.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400">
                        All biometric punch logs are matched to employees!
                      </td>
                    </tr>
                  ) : (
                    unmatchedGroups.map((grp) => (
                      <tr key={grp.biometric_id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          {grp.biometric_id}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="warning">{grp.count} punch(es)</Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600">
                          {formatDate(grp.latestTimestamp)} {formatTime(grp.latestTimestamp)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{grp.deviceName}</td>
                        <td className="px-4 py-3">
                          <select
                            value={assignMap[grp.biometric_id] || ''}
                            onChange={(e) =>
                              setAssignMap((prev) => ({
                                ...prev,
                                [grp.biometric_id]: e.target.value,
                              }))
                            }
                            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-md w-60"
                          >
                            <option value="">-- Select Employee --</option>
                            {employees.map((e) => (
                              <option key={e._id} value={e._id}>
                                {e.employee_id} — {e.firstName} {e.lastName} ({e.department})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={busyId === grp.biometric_id}
                            onClick={() => handleMapUnmatched(grp.biometric_id)}
                            className="px-3 py-1.5 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                          >
                            {busyId === grp.biometric_id ? 'Mapping...' : 'Map & Reprocess'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: SYNC LOGS */}
          {subTab === 'sync' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Synced At</th>
                    <th className="px-4 py-3">Device / Channel</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Fetched / Matched / Unmatched</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3">Triggered By / Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {syncLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400">
                        No sync activity recorded yet.
                      </td>
                    </tr>
                  ) : (
                    syncLogs.map((s) => (
                      <tr key={s._id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3 whitespace-nowrap font-mono">
                          {formatDate(s.synced_at)} {formatTime(s.synced_at)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {s.device_name || 'Unknown'}
                        </td>
                        <td className="px-4 py-3 uppercase font-mono text-slate-600">
                          {s.sync_type}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {s.records_fetched} /{' '}
                          <span className="text-emerald-700 font-bold">{s.records_matched}</span> /{' '}
                          <span className="text-amber-700 font-bold">{s.unmatched_count}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            variant={
                              s.status === 'Success'
                                ? 'success'
                                : s.status === 'Partial'
                                ? 'warning'
                                : 'danger'
                            }
                          >
                            {s.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                          <div>{s.triggered_by || 'System'}</div>
                          {s.errors?.length > 0 && (
                            <div className="text-[10px] text-rose-600 truncate">
                              {s.errors[0]}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Device Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={deviceForm._id ? 'Edit Biometric Device' : 'Register Biometric Device'}
      >
        <form onSubmit={handleSaveDevice} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Device Name *</label>
              <input
                type="text"
                required
                placeholder="Main Lobby ZKTeco"
                value={deviceForm.name}
                onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Brand *</label>
              <select
                value={deviceForm.brand}
                onChange={(e) => setDeviceForm({ ...deviceForm, brand: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="ZKTeco">ZKTeco</option>
                <option value="Hikvision">Hikvision</option>
                <option value="Generic">Generic</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">IP Address *</label>
              <input
                type="text"
                required
                placeholder="192.168.1.201"
                value={deviceForm.ip_address}
                onChange={(e) => setDeviceForm({ ...deviceForm, ip_address: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Port</label>
              <input
                type="number"
                value={deviceForm.port}
                onChange={(e) => setDeviceForm({ ...deviceForm, port: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Serial No *</label>
              <input
                type="text"
                required
                disabled={Boolean(deviceForm._id)}
                placeholder="ZK88990011"
                value={deviceForm.serial_no}
                onChange={(e) => setDeviceForm({ ...deviceForm, serial_no: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={deviceForm.status}
                onChange={(e) => setDeviceForm({ ...deviceForm, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Location</label>
            <input
              type="text"
              placeholder="Dhaka HQ Reception"
              value={deviceForm.location}
              onChange={(e) => setDeviceForm({ ...deviceForm, location: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Optional HTTP Pull URL (for ZKTeco/Hikvision middleware bridge)
            </label>
            <input
              type="url"
              placeholder="http://192.168.1.50:8080/logs"
              value={deviceForm.pull_url}
              onChange={(e) => setDeviceForm({ ...deviceForm, pull_url: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              Save Device
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

