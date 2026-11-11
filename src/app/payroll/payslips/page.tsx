import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PayrollModuleNav } from '@/components/payroll/PayrollModuleNav';
import { PayslipsDesk } from '@/components/payroll/PayslipsDesk';

export const metadata = {
  title: 'Payslips | Dreams ERP Payroll',
  description: 'Search, review, bulk confirm/pay, and download employee payslips',
};

export default function PayrollPayslipsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PayrollModuleNav />
        <PayslipsDesk />
      </div>
    </DashboardLayout>
  );
}

