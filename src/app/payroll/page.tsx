import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PayrollModuleNav } from '@/components/payroll/PayrollModuleNav';
import { PayslipsDesk } from '@/components/payroll/PayslipsDesk';

export const metadata = {
  title: 'Payroll & Payslips | Dreams ERP',
  description: 'Employee payslips generation, confirmation, and disbursement',
};

export default function PayrollPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PayrollModuleNav />
        <PayslipsDesk />
      </div>
    </DashboardLayout>
  );
}

