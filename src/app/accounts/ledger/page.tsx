import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccountsModuleNav } from '@/components/accounts/AccountsModuleNav';
import { GeneralLedgerView } from '@/components/accounts/GeneralLedgerView';

export const metadata = {
  title: 'General Ledger | Dreams ERP',
  description: 'Account-by-account General Ledger with running balance and exports',
};

export default function GeneralLedgerPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AccountsModuleNav />
        <GeneralLedgerView />
      </div>
    </DashboardLayout>
  );
}

