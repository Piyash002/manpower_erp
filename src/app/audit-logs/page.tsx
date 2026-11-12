import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AuditLogsView } from '@/components/audit/AuditLogsView';
import { HrmModuleNav } from '@/components/layout/HrmModuleNav';

export const metadata = {
  title: 'System Audit Logs | CodeZenX ERP',
  description: 'Review system events, candidate status changes, and transaction logs',
};

export default function AuditLogsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <HrmModuleNav />
        <AuditLogsView />
      </div>
    </DashboardLayout>
  );
}
