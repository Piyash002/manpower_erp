'use client';

import React from 'react';
import { formatBDT } from '@/lib/formatters';
import { Printer, Download, X } from 'lucide-react';

interface ReceiptData {
  receipt_no: string;
  payment_date: string | Date;
  amount: number;
  amount_in_words: string;
  method: string;
  reference?: string;
  note?: string;
  created_by: string;
  student: {
    student_no: string;
    name: string;
    father_name: string;
    mobile: string;
    passport_no: string;
    trade_name: string;
    batch: string;
    destination_country: string;
    fee_snapshot: {
      admission_fee: number;
      course_fee: number;
      visa_cost: number;
      govt_fee: number;
      discount: number;
      total_payable: number;
    };
    total_paid: number;
    total_due: number;
  };
}

interface MoneyReceiptProps {
  receipt: ReceiptData;
  onClose?: () => void;
}

export function MoneyReceipt({ receipt, onClose }: MoneyReceiptProps) {
  const handlePrint = () => {
    window.print();
  };

  const { student } = receipt;
  const formattedDate = new Date(receipt.payment_date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="flex flex-col items-center">
      {/* Control bar (hidden during print) */}
      <div className="flex items-center justify-between w-full max-w-3xl mb-4 print:hidden">
        <h4 className="text-sm font-semibold text-slate-700">Official Money Receipt Voucher</h4>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Print Receipt</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Printable Receipt Card */}
      <div
        id="printable-receipt"
        className="w-full max-w-3xl p-8 bg-white border border-slate-300 rounded-xl shadow-lg print:shadow-none print:border-none print:p-0 print:m-0 print:w-full text-slate-900"
      >
        {/* Header */}
        <div className="text-center pb-6 border-b-2 border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-100 border border-slate-300 rounded">
              Official Copy
            </span>
            <div className="text-right">
              <span className="text-xs text-slate-500">RL No: RL-1845 / Govt Approved</span>
            </div>
          </div>

          <h2 className="text-xl font-black uppercase tracking-tight text-slate-900 mt-2">
            BANGLADESH MANPOWER TRAINING & RECRUITMENT AGENCY
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Technical Trade Training Center & Overseas Employment Bureau
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Plot 14, Sector 7, Uttara Commercial Area, Dhaka-1230 | Tel: +880 2 8954120
          </p>

          <div className="mt-4 inline-block">
            <h3 className="px-5 py-1 text-sm font-black uppercase tracking-widest text-slate-900 bg-slate-100 border-2 border-slate-900 rounded-md">
              MONEY RECEIPT
            </h3>
          </div>
        </div>

        {/* Receipt Meta & Student Details */}
        <div className="grid grid-cols-2 gap-4 my-6 text-sm">
          <div className="space-y-1.5">
            <p>
              <span className="text-slate-500 font-medium">Receipt No: </span>
              <span className="font-bold font-mono text-base text-blue-700">{receipt.receipt_no}</span>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Student ID: </span>
              <span className="font-bold font-mono">{student.student_no}</span>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Student Name: </span>
              <span className="font-bold uppercase">{student.name}</span>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Father&apos;s Name: </span>
              <span>{student.father_name}</span>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Mobile: </span>
              <span className="font-mono">{student.mobile}</span>
            </p>
          </div>

          <div className="space-y-1.5 text-right sm:text-right">
            <p>
              <span className="text-slate-500 font-medium">Date: </span>
              <span className="font-semibold">{formattedDate}</span>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Passport No: </span>
              <span className="font-mono font-semibold">{student.passport_no}</span>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Trade: </span>
              <span className="font-semibold">{student.trade_name}</span>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Batch: </span>
              <span>{student.batch}</span>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Destination: </span>
              <span className="font-semibold">{student.destination_country}</span>
            </p>
          </div>
        </div>

        {/* Payment Summary Table */}
        <div className="border border-slate-300 rounded-lg overflow-hidden my-6">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 border-b border-slate-300 text-slate-700">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Payment Description</th>
                <th className="px-4 py-2.5 text-center font-semibold">Method & Ref</th>
                <th className="px-4 py-2.5 text-right font-semibold">Amount (BDT)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">Training & Recruitment Fees</p>
                  <p className="text-xs text-slate-500">{receipt.note || 'Scheduled installment / admission fee'}</p>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="font-medium">{receipt.method}</span>
                  {receipt.reference && (
                    <span className="block text-xs font-mono text-slate-500">Ref: {receipt.reference}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-bold text-slate-900 text-base">
                  {formatBDT(receipt.amount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Amount in words */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg my-4">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Amount in Words:</p>
          <p className="text-sm font-bold text-slate-800 capitalize mt-0.5">{receipt.amount_in_words}</p>
        </div>

        {/* Balance Status Card */}
        <div className="grid grid-cols-3 gap-3 my-6 p-3 bg-slate-50 border border-slate-200 rounded-lg text-center text-xs">
          <div>
            <p className="text-slate-500">Total Agreed Package</p>
            <p className="text-sm font-bold text-slate-800 mt-0.5">
              {formatBDT(student.fee_snapshot.total_payable)}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Total Paid (Cumulative)</p>
            <p className="text-sm font-bold text-emerald-700 mt-0.5">
              {formatBDT(student.total_paid)}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Outstanding Balance Due</p>
            <p className="text-sm font-bold text-rose-700 mt-0.5">
              {formatBDT(student.total_due)}
            </p>
          </div>
        </div>

        {/* Signatures */}
        <div className="pt-16 pb-4 grid grid-cols-3 gap-8 text-center text-xs text-slate-600">
          <div>
            <div className="border-t border-slate-400 pt-1.5 font-medium">Student / Payee</div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-1.5 font-medium">
              Received By: {receipt.created_by}
            </div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-800">
              Authorized Signatory
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="text-[10px] text-center text-slate-400 border-t border-slate-200 pt-3 mt-4">
          * This is a computer-generated money receipt from Manpower Training & Recruitment ERP. Fees once paid are non-refundable.
        </div>
      </div>
    </div>
  );
}

