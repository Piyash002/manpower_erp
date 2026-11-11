import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccountsModuleNav } from '@/components/accounts/AccountsModuleNav';
import { StudentFeesView } from '@/components/accounts/StudentFeesView';

export const metadata = {
  title: 'Student Fees & Plans | Dreams ERP',
  description: 'Candidate fee plans, stages, and receivable balances',
};

export default function StudentFeesPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AccountsModuleNav />
        <StudentFeesView />
      </div>
    </DashboardLayout>
  );
}

