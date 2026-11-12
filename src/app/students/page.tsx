import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StudentList } from '@/components/students/StudentList';
import { AdmissionModuleNav } from '@/components/admissions/AdmissionModuleNav';

export const metadata = {
  title: 'Students Directory | CodeZenX ERP',
  description: 'Search, filter, and review candidate profiles',
};

export default function StudentsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AdmissionModuleNav />
        <StudentList />
      </div>
    </DashboardLayout>
  );
}
