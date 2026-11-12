import { Suspense } from 'react';
import StandaloneReceiptClient from './receipt-client';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Print Money Receipt | CodeZenX ERP',
  description: 'Official money receipt voucher for candidate payment',
};

export default async function StandaloneReceiptPage({
  params,
}: {
  params: Promise<{ receiptNo: string }>;
}) {
  const { receiptNo } = await params;

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 flex flex-col items-center">
      <Suspense fallback={<div className="p-12 text-center text-slate-500">Loading receipt...</div>}>
        <StandaloneReceiptClient receiptNo={receiptNo} />
      </Suspense>
    </div>
  );
}
