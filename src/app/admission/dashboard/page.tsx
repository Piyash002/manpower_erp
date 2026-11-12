import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AdmissionDashboardView } from '@/components/dashboard/AdmissionDashboardView';
import { requirePageRole } from '@/lib/page-auth';
import { ADMISSION_DASHBOARD_ROLES } from '@/lib/dashboard-helpers';

export const metadata = {
  title: 'Admission Dashboard | CodeZenX ERP',
  description: 'Candidate admissions, training batches, and trade distribution',
};

export default async function AdmissionDashboardPage() {
  await requirePageRole(ADMISSION_DASHBOARD_ROLES);

  return (
    <DashboardLayout>
      <AdmissionDashboardView />
    </DashboardLayout>
  );
}
