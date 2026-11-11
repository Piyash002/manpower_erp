import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccountsModuleNav } from '@/components/accounts/AccountsModuleNav';
import { SalaryDisbursementView } from '@/components/accounts/SalaryDisbursementView';

export const metadata = {
  title: 'Salary Disbursement | Dreams ERP',
  description: 'Confirmed HRM payroll runs awaiting Accounts disbursement',
};

export default function AccountsPayrollPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AccountsModuleNav />
        <SalaryDisbursementView />
      </div>
    </DashboardLayout>
  );
}

