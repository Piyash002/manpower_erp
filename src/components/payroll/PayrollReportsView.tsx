'use client';

import React, { useEffect, useState } from 'react';
import { BarChart3, Download, RefreshCw } from 'lucide-react';
import { formatBDT } from '@/lib/formatters';
import { Badge } from '@/components/ui/Badge';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

type ReportTab = 'register' | 'department_summary' | 'tax_summary' | 'bank_transfer';

export function PayrollReportsView() {
  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [reportType, setReportType] = useState<ReportTab>('register');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReport = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/payroll/reports?month=${month}&year=${year}&reportType=${reportType}`
      );
      const json = await res.json();
      if (json.success && json.data) {
        setRows(json.data.rows || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year, reportType]);

  const csvUrl = `/api/payroll/reports?month=${month}&year=${year}&reportType=${reportType}&format=csv`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Payroll Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Monthly Payroll Register, Department Summary, TDS Tax Report, and Bank-Transfer CSV Sheet.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
          >
            {MONTHS.map((m, idx) => (
              <option key={m} value={idx + 1}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg font-mono"
          >
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <a
            href={csvUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV / Excel</span>
          </a>
        </div>
      </div>

      {/* Report Selector Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-semibold w-fit">
        {(
          [
            { id: 'register', label: 'Monthly Payroll Register' },
            { id: 'department_summary', label: 'Department Summary' },
            { id: 'tax_summary', label: 'Tax (TDS) Summary' },
            { id: 'bank_transfer', label: 'Bank-Transfer Sheet' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setReportType(t.id)}
            className={`px-3 py-1.5 rounded-md transition-all ${
              reportType === t.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Report Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-7 h-7 animate-spin text-emerald-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500">Generating report...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <BarChart3 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">
              No active payslips found for {MONTHS[month - 1]} {year}
            </p>
          </div>
        ) : reportType === 'department_summary' ? (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3 text-center">Employees</th>
                <th className="px-4 py-3 text-right">Basic Pay</th>
                <th className="px-4 py-3 text-right">Allowances</th>
                <th className="px-4 py-3 text-right">Gross Pay</th>
                <th className="px-4 py-3 text-right">Deductions</th>
                <th className="px-4 py-3 text-right">Net Payable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.department}>
                  <td className="px-4 py-3 font-bold text-slate-900">{r.department}</td>
                  <td className="px-4 py-3 text-center font-mono">{r.employees}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatBDT(r.basic_pay)}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatBDT(r.total_allowances)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">
                    {formatBDT(r.gross_pay)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-rose-700">
                    {formatBDT(r.total_deductions)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-extrabold text-emerald-700">
                    {formatBDT(r.net_pay)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : reportType === 'tax_summary' ? (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Payslip #</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3 text-right">Gross Pay</th>
                <th className="px-4 py-3 text-right">Income Tax (TDS)</th>
                <th className="px-4 py-3 text-right">Provident Fund</th>
                <th className="px-4 py-3 text-right">Total Deductions</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.payslip_no}>
                  <td className="px-4 py-3 font-mono text-xs font-bold">{r.payslip_no}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {r.employee_name}{' '}
                    <span className="text-[11px] font-mono text-slate-400">({r.employee_id})</span>
                  </td>
                  <td className="px-4 py-3 text-xs">{r.department}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatBDT(r.gross_pay)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-rose-700">
                    {formatBDT(r.tds_amount)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{formatBDT(r.pf_amount)}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatBDT(r.total_deductions)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={r.status === 'Paid' ? 'success' : 'info'}>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : reportType === 'bank_transfer' ? (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Payslip #</th>
                <th className="px-4 py-3">Beneficiary Name</th>
                <th className="px-4 py-3">Bank Name</th>
                <th className="px-4 py-3">Account Number</th>
                <th className="px-4 py-3 text-right">Transfer Amount</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.payslip_no}>
                  <td className="px-4 py-3 font-mono text-xs font-bold">{r.payslip_no}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {r.beneficiary_name}{' '}
                    <span className="text-[11px] font-mono text-slate-400">({r.employee_id})</span>
                  </td>
                  <td className="px-4 py-3 text-xs font-medium">{r.bank_name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.bank_account_no}</td>
                  <td className="px-4 py-3 text-right font-mono font-extrabold text-emerald-700">
                    {formatBDT(r.net_pay)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={r.status === 'Paid' ? 'success' : 'info'}>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Payslip #</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3 text-right">Basic</th>
                <th className="px-4 py-3 text-right">Allowances</th>
                <th className="px-4 py-3 text-right">Gross</th>
                <th className="px-4 py-3 text-right">Deductions</th>
                <th className="px-4 py-3 text-right">Net Pay</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.payslip_no}>
                  <td className="px-4 py-3 font-mono text-xs font-bold">{r.payslip_no}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {r.employee_name}{' '}
                    <span className="text-[11px] font-mono text-slate-400">({r.employee_id})</span>
                  </td>
                  <td className="px-4 py-3 text-xs">{r.department}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatBDT(r.basic_pay)}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatBDT(r.total_allowances)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">
                    {formatBDT(r.gross_pay)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-rose-700">
                    {formatBDT(r.total_deductions)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-extrabold text-emerald-700">
                    {formatBDT(r.net_pay)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={r.status === 'Paid' ? 'success' : 'info'}>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

