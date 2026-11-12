import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccountsModuleNav } from '@/components/accounts/AccountsModuleNav';
import { VouchersView } from '@/components/accounts/VouchersView';

export const metadata = {
  title: 'Journal Vouchers | CodeZenX ERP',
  description: 'Create, post, and reverse balanced double-entry journal vouchers',
};

export default function VouchersPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AccountsModuleNav />
        <VouchersView />
      </div>
    </DashboardLayout>
  );
}

