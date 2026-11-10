import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PayrollModuleNav } from '@/components/payroll/PayrollModuleNav';
import { PayslipBatchesView } from '@/components/payroll/PayslipBatchesView';

export const metadata = {
  title: 'Payslip Batches | Dreams ERP Payroll',
  description: 'Bulk payroll runs by month and department',
};

export default function PayrollBatchesPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PayrollModuleNav />
        <PayslipBatchesView />
      </div>
    </DashboardLayout>
  );
}

