import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AttendanceModuleNav } from '@/components/attendance/AttendanceModuleNav';
import { BiometricDevicesView } from '@/components/attendance/BiometricDevicesView';

export const metadata = {
  title: 'Biometric Devices & Punch Logs | Dreams ERP',
  description: 'Manage ZKTeco/Hikvision biometric devices, raw punch logs, unmatched IDs, and sync logs',
};

export default function AttendanceDevicesPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AttendanceModuleNav />
        <BiometricDevicesView />
      </div>
    </DashboardLayout>
  );
}

