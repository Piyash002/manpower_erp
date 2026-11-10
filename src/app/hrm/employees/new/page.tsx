import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HrmModuleNav } from '@/components/layout/HrmModuleNav';
import { EmployeeFormView } from '@/components/hrm/EmployeeFormView';

export const metadata = {
  title: 'Add Employee | Dreams ERP HRM',
  description: 'Create full employee profile synced with Attendance and Payroll',
};

export default function AddEmployeePage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <HrmModuleNav />
        <EmployeeFormView />
      </div>
    </DashboardLayout>
  );
}

