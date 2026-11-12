import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HrmDashboardView } from '@/components/dashboard/HrmDashboardView';
import { requirePageRole } from '@/lib/page-auth';
import { HRM_DASHBOARD_ROLES } from '@/lib/dashboard-helpers';

export const metadata = {
  title: 'HRM Dashboard | CodeZenX ERP',
  description: 'Workforce headcount, daily attendance, and payroll runs overview',
};

export default async function HrmDashboardPage() {
  const user = await requirePageRole(HRM_DASHBOARD_ROLES);

  return (
    <DashboardLayout initialUser={user}>
      <HrmDashboardView />
    </DashboardLayout>
  );
}
