'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MoneyReceipt } from '@/components/receipt/MoneyReceipt';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function StandaloneReceiptClient({ receiptNo }: { receiptNo: string }) {
  const router = useRouter();
  const [receipt, setReceipt] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReceipt() {
      try {
        const res = await fetch(`/api/payments/${receiptNo}`);
        const data = await res.json();
        if (data.success) {
          setReceipt(data.receipt);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    if (receiptNo) {
      loadReceipt();
    }
  }, [receiptNo]);

  if (loading) {
    return <div className="p-12 text-center text-slate-500">Loading receipt voucher...</div>;
  }

  if (!receipt) {
    return (
      <div className="p-12 text-center">
        <p className="text-slate-600">Receipt #{receiptNo} not found.</p>
        <Link href="/students" className="text-blue-600 hover:underline mt-2 inline-block">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center">
      <div className="w-full max-w-3xl mb-4 print:hidden">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
      </div>

      <MoneyReceipt receipt={receipt} />
    </div>
  );
}

