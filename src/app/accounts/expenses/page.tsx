import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccountsModuleNav } from '@/components/accounts/AccountsModuleNav';
import { ExpensesView } from '@/components/accounts/ExpensesView';

export const metadata = {
  title: 'Operating Expenses | CodeZenX ERP',
  description: 'Record Paid, Unpaid, and Prepaid operating expenses with GL sync',
};

export default function ExpensesPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AccountsModuleNav />
        <ExpensesView />
      </div>
    </DashboardLayout>
  );
}

