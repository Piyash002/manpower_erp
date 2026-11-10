import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { UserManagement } from '@/components/users/UserManagement';
import { HrmModuleNav } from '@/components/layout/HrmModuleNav';

export const metadata = {
  title: 'Users & Staff | Manpower ERP',
  description: 'Manage staff user access, security roles and credentials',
};

export default function UsersPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <HrmModuleNav />
        <UserManagement />
      </div>
    </DashboardLayout>
  );
}
