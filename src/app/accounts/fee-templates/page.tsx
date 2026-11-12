import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccountsModuleNav } from '@/components/accounts/AccountsModuleNav';
import { FeeTemplatesView } from '@/components/accounts/FeeTemplatesView';

export const metadata = {
  title: 'Fee Templates | CodeZenX ERP',
  description: 'Stage-wise course and visa fee packages owned by Accounts',
};

export default function FeeTemplatesPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AccountsModuleNav />
        <FeeTemplatesView />
      </div>
    </DashboardLayout>
  );
}

