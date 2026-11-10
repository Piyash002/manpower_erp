'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  UserPlus,
  Users2,
  Banknote,
  GraduationCap,
  Globe2,
} from 'lucide-react';

export function AdmissionModuleNav() {
  const pathname = usePathname();

  const tabs = [
    { label: 'New Admission', href: '/admissions/new', icon: UserPlus },
    { label: 'Students Directory', href: '/students', icon: Users2 },
    { label: 'Installment Collection', href: '/installments', icon: Banknote },
    { label: 'Batches & Assessment', href: '/batches', icon: GraduationCap },
    { label: 'Trades & Visa Costs', href: '/trades', icon: Globe2 },
  ];

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200 mb-6">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive =
          tab.href === '/'
            ? pathname === '/'
            : pathname === tab.href || (tab.href !== '/students' && pathname.startsWith(tab.href));

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

