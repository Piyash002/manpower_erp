import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HrmModuleNav } from '@/components/layout/HrmModuleNav';
import { EmployeeImportView } from '@/components/hrm/EmployeeImportView';

export const metadata = {
  title: 'Import Employees | Dreams ERP HRM',
  description: 'Bulk import employees from Excel/CSV with preview and row-wise error validation',
};

export default function EmployeeImportPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <HrmModuleNav />
        <EmployeeImportView />
      </div>
    </DashboardLayout>
  );
}

