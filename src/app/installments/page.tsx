import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { InstallmentCollection } from '@/components/installments/InstallmentCollection';
import { AdmissionModuleNav } from '@/components/admissions/AdmissionModuleNav';

export const metadata = {
  title: 'Installment Collection & Dues | Manpower ERP',
  description: 'Manage candidate installment collections, overdue dues, and money receipts',
};

export default function InstallmentsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AdmissionModuleNav />
        <InstallmentCollection />
      </div>
    </DashboardLayout>
  );
}
