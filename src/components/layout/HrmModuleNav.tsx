'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, FileText, UserCheck, CalendarCheck, Wallet } from 'lucide-react';
import { useAuth } from '@/components/layout/DashboardLayout';

export function HrmModuleNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role || 'Viewer';

  const tabs = [
    {
      label: 'Employees & Agents',
      href: '/hrm/employees',
      icon: UserCheck,
      allowed: ['Admin', 'Counselor', 'Accountant', 'Viewer'],
    },
    {
      label: 'Daily Attendance & Leaves',
      href: '/hrm/attendance',
      icon: CalendarCheck,
      allowed: ['Admin', 'Counselor', 'Accountant', 'Viewer'],
    },
    {
      label: 'Payroll & Commissions',
      href: '/hrm/payroll',
      icon: Wallet,
      allowed: ['Admin', 'Accountant', 'Viewer'],
    },
    {
      label: 'Users & Staff',
      href: '/users',
      icon: ShieldCheck,
      allowed: ['Admin'],
    },
    {
      label: 'System Audit Logs',
      href: '/audit-logs',
      icon: FileText,
      allowed: ['Admin', 'Counselor', 'Accountant', 'Viewer'],
    },
  ].filter((t) => t.allowed.includes(role));

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200 mb-6">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);

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
