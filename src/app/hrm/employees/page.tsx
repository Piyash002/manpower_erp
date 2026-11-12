import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HrmModuleNav } from '@/components/layout/HrmModuleNav';
import { EmployeeManagement } from '@/components/hrm/EmployeeManagement';

export const metadata = {
  title: 'Employees & Agents | CodeZenX ERP',
  description: 'Manage staff roster, batch trainers, and referral agents',
};

export default function HrmEmployeesPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <HrmModuleNav />
        <EmployeeManagement />
      </div>
    </DashboardLayout>
  );
}

