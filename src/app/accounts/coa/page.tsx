import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccountsModuleNav } from '@/components/accounts/AccountsModuleNav';
import { CoaTreeView } from '@/components/accounts/CoaTreeView';

export const metadata = {
  title: 'Chart of Accounts | CodeZenX ERP',
  description: 'CodeZenX ERP Chart of Accounts tree and live ledger balances',
};

export default function ChartOfAccountsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AccountsModuleNav />
        <CoaTreeView />
      </div>
    </DashboardLayout>
  );
}

