import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PayrollModuleNav } from '@/components/payroll/PayrollModuleNav';
import { MonthlyInputsView } from '@/components/payroll/MonthlyInputsView';

export const metadata = {
  title: 'Monthly Payroll Inputs | CodeZenX ERP',
  description: 'Manage monthly bonuses, overtime, loan recoveries, and deductions',
};

export default function PayrollInputsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PayrollModuleNav />
        <MonthlyInputsView />
      </div>
    </DashboardLayout>
  );
}

