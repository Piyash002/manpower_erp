import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PayrollModuleNav } from '@/components/payroll/PayrollModuleNav';
import { PayrollReportsView } from '@/components/payroll/PayrollReportsView';

export const metadata = {
  title: 'Payroll Reports | CodeZenX ERP',
  description: 'Payroll register, department summary, TDS summary, and bank transfer CSV export',
};

export default function PayrollReportsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PayrollModuleNav />
        <PayrollReportsView />
      </div>
    </DashboardLayout>
  );
}

