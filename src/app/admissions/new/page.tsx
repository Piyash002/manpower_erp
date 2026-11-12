import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AdmissionForm } from '@/components/admissions/AdmissionForm';
import { AdmissionModuleNav } from '@/components/admissions/AdmissionModuleNav';

export const metadata = {
  title: 'New Student Admission | CodeZenX ERP',
  description: 'Register candidate, configure training & destination, issue receipt',
};

export default function NewAdmissionPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AdmissionModuleNav />
        <AdmissionForm />
      </div>
    </DashboardLayout>
  );
}
