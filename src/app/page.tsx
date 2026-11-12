import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { OverviewDashboard } from '@/components/dashboard/OverviewDashboard';
import { verifyToken } from '@/lib/jwt';
import { getAllowedDashboards, getDefaultDashboardHref } from '@/lib/dashboard-helpers';

export const metadata = {
  title: 'Overview | CodeZenX ERP',
  description: 'Role-aware overview across Admission, HRM, and Accounts dashboards',
};

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) {
    redirect('/login');
  }

  const user = verifyToken(token);
  if (!user) {
    redirect('/login');
  }

  const allowed = getAllowedDashboards(user.role);
  if (allowed.length <= 1) {
    redirect(getDefaultDashboardHref(user.role));
  }

  return (
    <DashboardLayout initialUser={user}>
      <OverviewDashboard />
    </DashboardLayout>
  );
}
