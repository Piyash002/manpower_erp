import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BatchList } from '@/components/batches/BatchList';
import { AdmissionModuleNav } from '@/components/admissions/AdmissionModuleNav';

export const metadata = {
  title: 'Training Batches & Assessments | CodeZenX ERP',
  description: 'Manage training batches, exam schedules, marks and certificates',
};

export default function BatchesPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AdmissionModuleNav />
        <BatchList />
      </div>
    </DashboardLayout>
  );
}
