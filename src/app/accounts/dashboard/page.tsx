import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccountsModuleNav } from '@/components/accounts/AccountsModuleNav';
import { AccountsDashboardView } from '@/components/dashboard/AccountsDashboardView';
import { requirePageRole } from '@/lib/page-auth';
import { ACCOUNTS_DASHBOARD_ROLES } from '@/lib/dashboard-helpers';

export const metadata = {
  title: 'Accounts Dashboard | CodeZenX ERP',
  description: 'Cash & bank balances, collections, receivables, and pending approvals',
};

export default async function AccountsDashboardPage() {
  const user = await requirePageRole(ACCOUNTS_DASHBOARD_ROLES);

  return (
    <DashboardLayout initialUser={user}>
      <AccountsModuleNav />
      <AccountsDashboardView />
    </DashboardLayout>
  );
}
