import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StudentProfile } from '@/components/students/StudentProfile';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Candidate Profile | Manpower ERP',
  description: 'Detailed candidate record, installments, and documents checklist',
};

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <DashboardLayout>
      <StudentProfile studentId={id} />
    </DashboardLayout>
  );
}
