import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AttendanceModuleNav } from '@/components/attendance/AttendanceModuleNav';
import { AttendanceSettingsView } from '@/components/attendance/AttendanceSettingsView';

export const metadata = {
  title: 'Attendance Settings | Dreams ERP',
  description: 'Working schedules, grace periods, overtime/late rules, and holidays',
};

export default function AttendanceSettingsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AttendanceModuleNav />
        <AttendanceSettingsView />
      </div>
    </DashboardLayout>
  );
}

