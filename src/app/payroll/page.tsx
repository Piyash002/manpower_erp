import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PayrollModuleNav } from '@/components/payroll/PayrollModuleNav';
import { PayrollRunsView } from '@/components/payroll/PayrollRunsView';

export const metadata = {
  title: 'Payroll Runs | CodeZenX ERP',
  description: 'Batch-first monthly payroll generation, verification, confirmation, and disbursement',
};

export default function PayrollPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PayrollModuleNav />
        <PayrollRunsView />
      </div>
    </DashboardLayout>
  );
}
