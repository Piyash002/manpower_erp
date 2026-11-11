'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FolderKanban,
  Receipt,
  SlidersHorizontal,
  FileSignature,
  Layers,
  BarChart3,
  Settings,
} from 'lucide-react';
import { useAuth } from '@/components/layout/DashboardLayout';

const STAFF_ROLES = ['Admin', 'HR', 'Accountant', 'Viewer'];

interface TabItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  group: 'monthly' | 'setup';
  allowed: string[];
  hint: string;
}

export function PayrollModuleNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role || 'Viewer';
  const isPayrollStaff = STAFF_ROLES.includes(role);

  const allTabs: TabItem[] = [
    {
      label: 'Payroll Runs',
      href: '/payroll',
      icon: FolderKanban,
      exact: true,
      group: 'monthly',
      allowed: STAFF_ROLES,
      hint: 'Monthly cycle: Generate Draft run → Verify → Confirm & Lock → Mark as Paid.',
    },
    {
      label: isPayrollStaff ? 'Payslips' : 'My Payslips',
      href: '/payroll/payslips',
      icon: Receipt,
      group: 'monthly',
      allowed: ['Admin', 'HR', 'Accountant', 'Viewer', 'Manager', 'Employee', 'Counselor'],
      hint: isPayrollStaff
        ? 'Inspect line formulas, approve in bulk, and download printable PDF bundles.'
        : 'View and download your monthly salary payslips.',
    },
    {
      label: 'Monthly Inputs',
      href: '/payroll/inputs',
      icon: SlidersHorizontal,
      group: 'monthly',
      allowed: STAFF_ROLES,
      hint: 'Add overtime, bonuses, advances, or fines before generating/recalculating a Draft run.',
    },
    {
      label: 'Contracts',
      href: '/payroll/contracts',
      icon: FileSignature,
      group: 'setup',
      allowed: STAFF_ROLES,
      hint: 'Assign Salary Structures & Basic Salary to active employees.',
    },
    {
      label: 'Salary Structures',
      href: '/payroll/structures',
      icon: Layers,
      group: 'setup',
      allowed: STAFF_ROLES,
      hint: 'Configure salary rules (Basic, House Rent, Medical, Custom Deductions).',
    },
    {
      label: 'Reports',
      href: '/payroll/reports',
      icon: BarChart3,
      group: 'setup',
      allowed: STAFF_ROLES,
      hint: 'Export monthly registers, department summaries, and Bank transfer sheets.',
    },
    {
      label: 'Payroll Settings',
      href: '/payroll/settings',
      icon: Settings,
      group: 'setup',
      allowed: ['Admin', 'HR'],
      hint: 'Configure versioned absent, late, half-day, paid leave, and overtime rules.',
    },
  ];
  const tabs = allTabs.filter((t) => t.allowed.includes(role));

  const isTabActive = (tab: TabItem) =>
    tab.exact
      ? pathname === tab.href || pathname === '/payroll/batches'
      : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

  const monthlyTabs = tabs.filter((t) => t.group === 'monthly');
  const setupTabs = tabs.filter((t) => t.group === 'setup');
  const activeTab = tabs.find(isTabActive) || tabs[0];

  return (
    <div className="mb-5 space-y-2">
      <div className="bg-white border border-slate-200/90 rounded-xl p-1.5 shadow-2xs flex items-center gap-1 overflow-x-auto">
        <div className="flex items-center gap-1 shrink-0">
          {monthlyTabs.map((tab) => {
            const Icon = tab.icon;
            const active = isTabActive(tab);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
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

        {setupTabs.length > 0 && (
          <>
            <div className="h-5 w-px bg-slate-200 mx-1 shrink-0" />
            <div className="flex items-center gap-1 shrink-0">
              {setupTabs.map((tab) => {
                const Icon = tab.icon;
                const active = isTabActive(tab);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
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
          </>
        )}
      </div>

      {isPayrollStaff && activeTab && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-500">
          <span>{activeTab.hint}</span>
          <span className="hidden md:inline text-slate-400">
            Flow: Structures &amp; Contracts → Monthly Inputs → Generate Payroll Run → Payslips
          </span>
        </div>
      )}
    </div>
  );
}
