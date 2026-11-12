import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HrmModuleNav } from '@/components/layout/HrmModuleNav';
import { EmployeeFormView } from '@/components/hrm/EmployeeFormView';

export const metadata = {
  title: 'Edit Employee | CodeZenX ERP',
  description: 'Update employee details, schedule, banking, and uploaded documents',
};

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <HrmModuleNav />
        <EmployeeFormView employeeId={id} />
      </div>
    </DashboardLayout>
  );
}

