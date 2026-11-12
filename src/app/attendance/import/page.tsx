import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AttendanceModuleNav } from '@/components/attendance/AttendanceModuleNav';
import { AttendanceImportView } from '@/components/attendance/AttendanceImportView';

export const metadata = {
  title: 'Biometric & CSV Import | CodeZenX ERP',
  description: 'Import CSV attendance punches and configure ZKTeco push endpoint',
};

export default function AttendanceImportPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AttendanceModuleNav />
        <AttendanceImportView />
      </div>
    </DashboardLayout>
  );
}

