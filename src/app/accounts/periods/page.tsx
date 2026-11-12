import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccountsModuleNav } from '@/components/accounts/AccountsModuleNav';
import { PeriodsLockView } from '@/components/accounts/PeriodsLockView';

export const metadata = {
  title: 'Period Lock & Fiscal Years | CodeZenX ERP',
  description: 'Manage fiscal years and lock or unlock accounting periods',
};

export default function PeriodsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AccountsModuleNav />
        <PeriodsLockView />
      </div>
    </DashboardLayout>
  );
}

