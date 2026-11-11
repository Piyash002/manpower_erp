'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Printer,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Banknote,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import { formatBDT, formatDateDMY, amountInWords } from '@/lib/formatters';
import { Download } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/components/layout/DashboardLayout';

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

export function PayslipDetailPrint({ payslipId }: { payslipId: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const [payslip, setPayslip] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadPayslip = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/payroll/payslips/${payslipId}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to load payslip');
      }
      setPayslip(json.data);
    } catch (err: any) {
      setError(err.message || 'Could not load payslip');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (payslipId) loadPayslip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payslipId]);

  const handleAction = async (payload: Record<string, any>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/payroll/payslips/${payslipId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.message || 'Action failed');
        return;
      }
      loadPayslip();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 gap-2">
        <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
        <span className="text-xs font-medium text-slate-600">Loading payslip...</span>
      </div>
    );
  }

  if (error || !payslip) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 max-w-md w-full text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
          <p className="text-sm font-semibold text-rose-700">{error || 'Payslip not found'}</p>
          <Link
            href="/payroll"
            className="inline-block px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg"
          >
            Back to Payroll
          </Link>
        </div>
      </div>
    );
  }

  const emp = payslip.employee_id || {};
  const contract = payslip.contract_id || {};
  const att = payslip.attendance_summary || {};
  const earningLines = (payslip.lines || []).filter(
    (l: any) => l.category === 'BASIC' || l.category === 'ALLOWANCE'
  );
  const deductionLines = (payslip.lines || []).filter((l: any) => l.category === 'DEDUCTION');

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4 print:bg-white print:p-0">
      {/* Action Toolbar (Hidden when printing) */}
      <div className="max-w-3xl mx-auto mb-5 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/payroll/payslips"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Payslips
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && payslip.status === 'Draft' && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleAction({ recompute: true })}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Recompute
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleAction({ status: 'Confirmed' })}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Confirm Payslip
              </button>
            </>
          )}

          {payslip.status === 'Confirmed' && (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg">
              <Banknote className="w-3.5 h-3.5" /> Awaiting Accounts Disbursement
            </span>
          )}

          <a
            href={`/api/payroll/payslips/${payslipId}?format=pdf`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
          >
            <Download className="w-3.5 h-3.5" /> Download PDF
          </a>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
          >
            <Printer className="w-3.5 h-3.5" /> Print / Save PDF
          </button>
        </div>
      </div>

      {/* Official A4 Printable Payslip */}
      <div className="max-w-3xl mx-auto bg-white border border-slate-300 rounded-xl p-6 sm:p-8 shadow-sm print:shadow-none print:border-slate-400 print:rounded-none">
        {/* Letterhead */}
        <div className="text-center border-b-2 border-slate-900 pb-4 mb-5">
          <p className="text-[10px] font-bold tracking-widest text-emerald-700 uppercase">
            Dreams ERP • Manpower Training &amp; Recruitment Academy
          </p>
          <h1 className="text-xl font-black text-slate-900 mt-0.5 uppercase tracking-tight">
            Employee Salary Payslip
          </h1>
          <p className="text-xs font-semibold text-slate-600 mt-1">
            Pay Period: {MONTHS[(payslip.month || 1) - 1]} {payslip.year} &bull; Slip No:{' '}
            <span className="font-mono text-slate-900">{payslip.payslip_no}</span>
          </p>
        </div>

        {/* Employee & Bank Summary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs mb-5">
          <div className="space-y-1">
            <p>
              <span className="text-slate-500">Employee Name:</span>{' '}
              <strong className="text-slate-900">
                {emp.firstName} {emp.lastName}
              </strong>
            </p>
            <p>
              <span className="text-slate-500">Employee ID:</span>{' '}
              <strong className="font-mono text-slate-900">{emp.employee_id}</strong>
            </p>
            <p>
              <span className="text-slate-500">Department / Role:</span>{' '}
              <strong className="text-slate-800">
                {emp.department} — {emp.designation}
              </strong>
            </p>
          </div>
          <div className="space-y-1 sm:text-right">
            <p>
              <span className="text-slate-500">Salary Structure:</span>{' '}
              <strong className="text-slate-900">{payslip.structure_id?.name || 'Regular'}</strong>
            </p>
            <p>
              <span className="text-slate-500">Payment Method:</span>{' '}
              <strong className="font-mono text-slate-800">
                {payslip.payment_method || emp.payment_method || 'Bank'}
                {(emp.bank_account_no || contract.bank_account_no)
                  ? ` (${emp.bank_name || contract.bank_name ? `${emp.bank_name || contract.bank_name} · ` : ''}${emp.bank_account_no || contract.bank_account_no})`
                  : ''}
              </strong>
            </p>
            <p className="flex items-center sm:justify-end gap-1.5">
              <span className="text-slate-500">Status:</span>
              <Badge
                variant={
                  payslip.status === 'Paid'
                    ? 'success'
                    : payslip.status === 'Confirmed'
                      ? 'info'
                      : payslip.status === 'Verified'
                        ? 'purple'
                        : payslip.status === 'Reversed'
                          ? 'danger'
                          : 'warning'
                }
              >
                {payslip.status}
              </Badge>
              {payslip.paid_at && (
                <span className="text-[11px] text-slate-500">
                  ({formatDateDMY(payslip.payment_date || payslip.paid_at)}
                  {payslip.payment_reference ? ` • Ref: ${payslip.payment_reference}` : ''})
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Attendance & Leave Strip */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-[11px] mb-6">
          <div className="p-2 bg-slate-50 border border-slate-200 rounded">
            <span className="text-slate-400 block">Present</span>
            <strong className="text-slate-900 font-mono">{att.presentDays || 0}d</strong>
          </div>
          <div className="p-2 bg-slate-50 border border-slate-200 rounded">
            <span className="text-slate-400 block">Late</span>
            <strong className="text-amber-700 font-mono">{att.lateDays || 0}d</strong>
          </div>
          <div className="p-2 bg-slate-50 border border-slate-200 rounded">
            <span className="text-slate-400 block">Half-Day</span>
            <strong className="text-blue-700 font-mono">{att.halfDays || 0}d</strong>
          </div>
          <div className="p-2 bg-slate-50 border border-slate-200 rounded">
            <span className="text-slate-400 block">Absent</span>
            <strong className="text-rose-700 font-mono">{att.absentDays || 0}d</strong>
          </div>
          <div className="p-2 bg-slate-50 border border-slate-200 rounded">
            <span className="text-slate-400 block">Paid Leave</span>
            <strong className="text-emerald-700 font-mono">{att.paidLeaveDays || 0}d</strong>
          </div>
          <div className="p-2 bg-slate-50 border border-slate-200 rounded">
            <span className="text-slate-400 block">Unpaid Leave</span>
            <strong className="text-rose-700 font-mono">{att.unpaidLeaveDays || 0}d</strong>
          </div>
        </div>

        {/* Earnings & Deductions Side-by-Side Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
          {/* Earnings */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-emerald-50 border-b border-emerald-200 px-3.5 py-2 text-xs font-bold text-emerald-900 uppercase">
              Earnings (Basic &amp; Allowances)
            </div>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-slate-100">
                {earningLines.map((line: any, i: number) => (
                  <tr key={line.code + i}>
                    <td className="px-3.5 py-2 text-slate-700">
                      <div>
                        {line.name}{' '}
                        <span className="text-[10px] font-mono text-slate-400">({line.code})</span>
                      </div>
                      {line.calculation_note && (
                        <div className="text-[10px] text-slate-400 mt-0.5">{line.calculation_note}</div>
                      )}
                    </td>
                    <td className="px-3.5 py-2 text-right font-mono font-semibold text-slate-900 align-top">
                      {formatBDT(line.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-xs">
                <tr>
                  <td className="px-3.5 py-2.5 text-slate-900">Gross Salary</td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-slate-900">
                    {formatBDT(payslip.gross_pay)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Deductions */}
          <div className="border border-slate-200 rounded-lg overflow-hidden flex flex-col justify-between">
            <div>
              <div className="bg-rose-50 border-b border-rose-200 px-3.5 py-2 text-xs font-bold text-rose-900 uppercase">
                Deductions
              </div>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  {deductionLines.map((line: any, i: number) => (
                    <tr key={line.code + i}>
                      <td className="px-3.5 py-2 text-slate-700">
                        <div>
                          {line.name}{' '}
                          <span className="text-[10px] font-mono text-slate-400">({line.code})</span>
                        </div>
                        {line.calculation_note && (
                          <div className="text-[10px] text-rose-700/80 mt-0.5">{line.calculation_note}</div>
                        )}
                      </td>
                      <td className="px-3.5 py-2 text-right font-mono font-semibold text-rose-700 align-top">
                        {formatBDT(line.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-slate-50 border-t border-slate-200 px-3.5 py-2.5 flex items-center justify-between font-bold text-xs">
              <span className="text-slate-900">Total Deductions</span>
              <span className="font-mono text-rose-700">{formatBDT(payslip.total_deductions)}</span>
            </div>
          </div>
        </div>

        {/* Net Pay Banner */}
        <div className="p-4 bg-emerald-50 border-2 border-emerald-600 rounded-xl flex flex-wrap items-center justify-between gap-3 mb-10">
          <div>
            <span className="text-xs font-bold text-emerald-900 uppercase block">
              Net Salary Payable
            </span>
            <span className="text-[11px] font-semibold text-emerald-800 block mt-0.5">
              In Words: {payslip.amount_in_words || amountInWords(payslip.net_pay || 0)}
            </span>
            <span className="text-[11px] text-emerald-700 block mt-0.5">
              Gross ({formatBDT(payslip.gross_pay)}) − Deductions ({formatBDT(payslip.total_deductions)})
            </span>
          </div>
          <span className="text-2xl font-black font-mono text-emerald-900">
            {formatBDT(payslip.net_pay)}
          </span>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-3 gap-6 pt-8 text-center text-[11px] text-slate-600">
          <div className="border-t border-slate-400 pt-2">Prepared By (HR / Accounts)</div>
          <div className="border-t border-slate-400 pt-2">Authorized Signatory</div>
          <div className="border-t border-slate-400 pt-2">Employee Signature</div>
        </div>
      </div>
    </div>
  );
}

