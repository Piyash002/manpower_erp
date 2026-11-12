import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HrmModuleNav } from '@/components/layout/HrmModuleNav';
import { EmployeeProfileView } from '@/components/hrm/EmployeeProfileView';

export const metadata = {
  title: 'Employee Profile | CodeZenX ERP',
  description: 'Complete employee overview, live attendance history, payslips, leaves, and documents',
};

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <HrmModuleNav />
        <EmployeeProfileView employeeId={id} />
      </div>
    </DashboardLayout>
  );
}

