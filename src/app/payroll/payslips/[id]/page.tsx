import { PayslipDetailPrint } from '@/components/payroll/PayslipDetailPrint';

export const metadata = {
  title: 'Payslip Details | CodeZenX ERP',
  description: 'Printable employee payslip breakdown',
};

export default async function PayslipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PayslipDetailPrint payslipId={id} />;
}

