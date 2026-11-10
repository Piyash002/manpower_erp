import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BatchDetail } from '@/components/batches/BatchDetail';

export const metadata = {
  title: 'Batch Trainees & Examination | Manpower ERP',
  description: 'Evaluate candidate exam scores, result status, and upload certificates',
};

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <DashboardLayout>
      <BatchDetail batchId={id} />
    </DashboardLayout>
  );
}

