import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccountsModuleNav } from '@/components/accounts/AccountsModuleNav';
import { MoneyReceiptsView } from '@/components/accounts/MoneyReceiptsView';

export const metadata = {
  title: 'Money Receipts | CodeZenX ERP',
  description: 'Collect student fees and post Receipt Vouchers in Accounts',
};

export default function MoneyReceiptsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AccountsModuleNav />
        <MoneyReceiptsView />
      </div>
    </DashboardLayout>
  );
}

