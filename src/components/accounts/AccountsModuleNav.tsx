'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  BookOpen,
  FileSpreadsheet,
  BookMarked,
  Scale,
  Lock,
  Layers,
  Users2,
  Banknote,
  Clock,
  Wallet,
  Building2,
  ReceiptText,
  CreditCard,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '@/components/layout/DashboardLayout';

const ACCOUNTS_ROLES = ['Admin', 'Accountant', 'Viewer'];

interface AccountsTab {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  group: 'ops' | 'ledger';
  hint: string;
}

export function AccountsModuleNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role || 'Viewer';

  if (!ACCOUNTS_ROLES.includes(role)) {
    return null;
  }

  const tabs: AccountsTab[] = [
    {
      label: 'Dashboard',
      href: '/accounts/dashboard',
      icon: LayoutDashboard,
      group: 'ops',
      hint: 'Accounts KPIs, cash & bank balances, trends, and pending actions.',
    },
    {
      label: 'Fee Templates',
      href: '/accounts/fee-templates',
      icon: Layers,
      group: 'ops',
      hint: 'Stage-wise fee packages per Trade & Country (owned by Accounts).',
    },
    {
      label: 'Student Fees',
      href: '/accounts/student-fees',
      icon: Users2,
      group: 'ops',
      hint: 'Candidate fee plans, billed stages, paid totals, and receivable balances.',
    },
    {
      label: 'Money Receipts',
      href: '/accounts/receipts',
      icon: Banknote,
      group: 'ops',
      hint: 'Collect candidate fees via Cash, Bank, bKash, Nagad, or Card (auto-posts RV).',
    },
    {
      label: 'Due & Aging',
      href: '/accounts/dues',
      icon: Clock,
      group: 'ops',
      hint: 'Outstanding student installments with 30/60/90-day aging buckets.',
    },
    {
      label: 'Salary Disbursement',
      href: '/accounts/payroll',
      icon: Wallet,
      group: 'ops',
      hint: 'View Confirmed payroll runs for disbursement in Accounts.',
    },
    {
      label: 'Fixed Assets',
      href: '/accounts/assets',
      icon: Building2,
      group: 'ops',
      hint: 'Register fixed assets, run monthly depreciation, and process disposals.',
    },
    {
      label: 'Expenses',
      href: '/accounts/expenses',
      icon: ReceiptText,
      group: 'ops',
      hint: 'Record Paid, Unpaid, and Prepaid operating expenses by category.',
    },
    {
      label: 'Payables & Loans',
      href: '/accounts/liabilities',
      icon: CreditCard,
      group: 'ops',
      hint: 'Manage vendor bills, bill payments, aging, and loans.',
    },
    {
      label: 'Balance Sheet',
      href: '/accounts/balance-sheet',
      icon: BarChart3,
      group: 'ledger',
      hint: 'Balance Sheet, Fixed Asset Register, and Expense Summary reports.',
    },
    {
      label: 'COA',
      href: '/accounts/coa',
      icon: BookOpen,
      group: 'ledger',
      hint: 'Manage Assets, Liabilities, Equity, Income & Expense accounts.',
    },
    {
      label: 'Vouchers',
      href: '/accounts/vouchers',
      icon: FileSpreadsheet,
      group: 'ledger',
      hint: 'Create balanced double-entry vouchers (JV, RV, PV, CV), post, or reverse.',
    },
    {
      label: 'Ledger',
      href: '/accounts/ledger',
      icon: BookMarked,
      group: 'ledger',
      hint: 'Inspect account transactions with running balances and Excel/CSV export.',
    },
    {
      label: 'Opening',
      href: '/accounts/opening-balances',
      icon: Scale,
      group: 'ledger',
      hint: 'Set initial account balances as of a cutover date.',
    },
    {
      label: 'Periods',
      href: '/accounts/periods',
      icon: Lock,
      group: 'ledger',
      hint: 'Manage Fiscal Years and lock/unlock monthly accounting periods.',
    },
  ];

  const isTabActive = (t: AccountsTab) => pathname === t.href || pathname.startsWith(`${t.href}/`);
  const activeTab = tabs.find(isTabActive) || tabs[0];
  const opsTabs = tabs.filter((t) => t.group === 'ops');
  const ledgerTabs = tabs.filter((t) => t.group === 'ledger');

  return (
    <div className="mb-5 space-y-2">
      <div className="bg-white border border-slate-200/90 rounded-xl p-1.5 shadow-2xs flex items-center gap-1 overflow-x-auto">
        <div className="flex items-center gap-1 shrink-0">
          {opsTabs.map((tab) => {
            const Icon = tab.icon;
            const active = isTabActive(tab);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-emerald-300' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="h-5 w-px bg-slate-200 mx-1 shrink-0" />

        <div className="flex items-center gap-1 shrink-0">
          {ledgerTabs.map((tab) => {
            const Icon = tab.icon;
            const active = isTabActive(tab);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-emerald-300' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between px-1 text-[11px] text-slate-500">
        <span>{activeTab.hint}</span>
        <span className="hidden md:inline text-slate-400">
          Accounts Owned · Double-Entry Ledger
        </span>
      </div>
    </div>
  );
}
