import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardOverview } from '@/components/dashboard/DashboardOverview';

export const metadata = {
  title: 'Dashboard | CodeZenX ERP',
  description: 'Operations, candidate registration, and financial management',
};

export default function HomePage() {
  return (
    <DashboardLayout>
      <DashboardOverview />
    </DashboardLayout>
  );
}
