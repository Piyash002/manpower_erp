import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HrmModuleNav } from '@/components/layout/HrmModuleNav';
import { PayrollManager } from '@/components/hrm/PayrollManager';

export const metadata = {
  title: 'Payroll & Agent Commissions | Dreams ERP HRM',
  description: 'Monthly salary calculation, agent referral commissions, and disbursement',
};

export default function HrmPayrollPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <HrmModuleNav />
        <PayrollManager />
      </div>
    </DashboardLayout>
  );
}

