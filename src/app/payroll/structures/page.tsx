import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PayrollModuleNav } from '@/components/payroll/PayrollModuleNav';
import { SalaryStructuresView } from '@/components/payroll/SalaryStructuresView';

export const metadata = {
  title: 'Salary Structures & Rules | CodeZenX ERP',
  description: 'Configure salary structures and calculation rules',
};

export default function SalaryStructuresPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PayrollModuleNav />
        <SalaryStructuresView />
      </div>
    </DashboardLayout>
  );
}

