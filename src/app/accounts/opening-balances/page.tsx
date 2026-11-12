import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccountsModuleNav } from '@/components/accounts/AccountsModuleNav';
import { OpeningBalancesView } from '@/components/accounts/OpeningBalancesView';

export const metadata = {
  title: 'Opening Balances | CodeZenX ERP',
  description: 'Post initial cutover opening balances for Chart of Accounts',
};

export default function OpeningBalancesPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AccountsModuleNav />
        <OpeningBalancesView />
      </div>
    </DashboardLayout>
  );
}

