import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { TradeCountryManager } from '@/components/trades/TradeCountryManager';
import { AdmissionModuleNav } from '@/components/admissions/AdmissionModuleNav';

export const metadata = {
  title: 'Trades & Visa Costs | Manpower ERP',
  description: 'Manage training trades, countries, and visa cost breakdown',
};

export default function TradesPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AdmissionModuleNav />
        <TradeCountryManager />
      </div>
    </DashboardLayout>
  );
}
