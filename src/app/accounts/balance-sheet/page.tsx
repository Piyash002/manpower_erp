import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccountsModuleNav } from '@/components/accounts/AccountsModuleNav';
import { BalanceSheetView } from '@/components/accounts/BalanceSheetView';

export const metadata = {
  title: 'Balance Sheet & Financial Reports | CodeZenX ERP',
  description: 'GL-derived Balance Sheet, Fixed Asset Register, and Expense Summary',
};

export default function BalanceSheetPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AccountsModuleNav />
        <BalanceSheetView />
      </div>
    </DashboardLayout>
  );
}

