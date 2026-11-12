import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AttendanceModuleNav } from '@/components/attendance/AttendanceModuleNav';
import { AttendanceDashboardView } from '@/components/attendance/AttendanceDashboardView';

export const metadata = {
  title: 'Attendance & Daily Roster | CodeZenX ERP',
  description: 'Employee check-in/out, calendar, live roster, and corrections',
};

export default function AttendancePage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AttendanceModuleNav />
        <AttendanceDashboardView />
      </div>
    </DashboardLayout>
  );
}

