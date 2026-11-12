import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccountsModuleNav } from '@/components/accounts/AccountsModuleNav';
import { FixedAssetsView } from '@/components/accounts/FixedAssetsView';

export const metadata = {
  title: 'Fixed Assets & Depreciation | CodeZenX ERP',
  description: 'Manage fixed assets, straight-line monthly depreciation, and disposals',
};

export default function FixedAssetsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AccountsModuleNav />
        <FixedAssetsView />
      </div>
    </DashboardLayout>
  );
}

