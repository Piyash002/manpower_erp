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

export function PayrollModuleNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role || 'Viewer';
  const isPayrollStaff = STAFF_ROLES.includes(role);

  const tabs = [
    {
      label: 'Payroll Runs',
      href: '/payroll',
      icon: FolderKanban,
      exact: true,
      allowed: STAFF_ROLES,
    },
    {
      label: isPayrollStaff ? 'Payslips' : 'My Payslips',
      href: '/payroll/payslips',
      icon: Receipt,
      allowed: ['Admin', 'HR', 'Accountant', 'Viewer', 'Manager', 'Employee', 'Counselor'],
    },
    {
      label: 'Monthly Inputs',
      href: '/payroll/inputs',
      icon: SlidersHorizontal,
      allowed: STAFF_ROLES,
    },
    {
      label: 'Contracts',
      href: '/payroll/contracts',
      icon: FileSignature,
      allowed: STAFF_ROLES,
    },
    {
      label: 'Salary Structures',
      href: '/payroll/structures',
      icon: Layers,
      allowed: STAFF_ROLES,
    },
    {
      label: 'Reports',
      href: '/payroll/reports',
      icon: BarChart3,
      allowed: STAFF_ROLES,
    },
    {
      label: 'Payroll Settings',
      href: '/payroll/settings',
      icon: Settings,
      allowed: ['Admin', 'HR'],
    },
  ].filter((t) => t.allowed.includes(role));

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200 mb-6">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.exact
          ? pathname === tab.href || pathname === '/payroll/batches'
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              isActive
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-white border border-slate-200'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
