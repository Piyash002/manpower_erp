'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock, Settings2, UploadCloud } from 'lucide-react';
import { useAuth } from '@/components/layout/DashboardLayout';

export function AttendanceModuleNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role || 'Viewer';

  const tabs = [
    {
      label: 'Attendance & Roster',
      href: '/attendance',
      icon: Clock,
      exact: true,
      allowed: ['Admin', 'Counselor', 'Accountant', 'Viewer'],
    },
    {
      label: 'Schedules & Holidays',
      href: '/attendance/settings',
      icon: Settings2,
      allowed: ['Admin'],
    },
    {
      label: 'Biometric / CSV Import',
      href: '/attendance/import',
      icon: UploadCloud,
      allowed: ['Admin'],
    },
  ].filter((t) => t.allowed.includes(role));

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200 mb-6">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.exact
          ? pathname === tab.href
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

