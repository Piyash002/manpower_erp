import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PayrollModuleNav } from '@/components/payroll/PayrollModuleNav';
import { ContractsView } from '@/components/payroll/ContractsView';

export const metadata = {
  title: 'Employee Contracts | CodeZenX ERP',
  description: 'Assign salary structures and basic pay contracts to employees',
};

export default function PayrollContractsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PayrollModuleNav />
        <ContractsView />
      </div>
    </DashboardLayout>
  );
}

