import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PayrollModuleNav } from '@/components/payroll/PayrollModuleNav';
import { PayrollSettingsView } from '@/components/payroll/PayrollSettingsView';

export const metadata = {
  title: 'Payroll Settings | Dreams ERP Payroll',
  description: 'Versioned deduction rules, days basis, late grace period, sandwich rule, and overtime settings',
};

export default function PayrollSettingsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PayrollModuleNav />
        <PayrollSettingsView />
      </div>
    </DashboardLayout>
  );
}

