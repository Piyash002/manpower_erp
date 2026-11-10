import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HrmModuleNav } from '@/components/layout/HrmModuleNav';
import { AttendanceTracker } from '@/components/hrm/AttendanceTracker';

export const metadata = {
  title: 'Daily Attendance & Leaves | Dreams ERP HRM',
  description: 'Daily employee check-in/out roster and leave management',
};

export default function HrmAttendancePage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <HrmModuleNav />
        <AttendanceTracker />
      </div>
    </DashboardLayout>
  );
}

