import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccountsModuleNav } from '@/components/accounts/AccountsModuleNav';
import { DueAgingView } from '@/components/accounts/DueAgingView';

export const metadata = {
  title: 'Due & Receivable Aging | CodeZenX ERP',
  description: 'Student receivable due list and 30/60/90 aging buckets',
};

export default function DueAgingPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AccountsModuleNav />
        <DueAgingView />
      </div>
    </DashboardLayout>
  );
}

