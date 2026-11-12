import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccountsModuleNav } from '@/components/accounts/AccountsModuleNav';
import { LiabilitiesView } from '@/components/accounts/LiabilitiesView';

export const metadata = {
  title: 'Liabilities, Vendor Bills & Loans | CodeZenX ERP',
  description: 'Manage vendor bills, bill payments, payables aging, and loans',
};

export default function LiabilitiesPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AccountsModuleNav />
        <LiabilitiesView />
      </div>
    </DashboardLayout>
  );
}

