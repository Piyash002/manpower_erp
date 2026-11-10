import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AttendanceModuleNav } from '@/components/attendance/AttendanceModuleNav';
import { BulkManualAttendanceView } from '@/components/attendance/BulkManualAttendanceView';

export const metadata = {
  title: 'Bulk Manual Attendance | Dreams ERP',
  description: 'Multi-employee manual attendance marking, prefilled by working schedules',
};

export default function BulkAttendancePage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AttendanceModuleNav />
        <BulkManualAttendanceView />
      </div>
    </DashboardLayout>
  );
}

