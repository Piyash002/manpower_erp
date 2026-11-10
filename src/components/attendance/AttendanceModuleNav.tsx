'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Clock,
    CheckSquare,
    UploadCloud,
    Cpu,
    Settings,
} from 'lucide-react';
import { useAuth } from '@/components/layout/DashboardLayout';

export function AttendanceModuleNav() {
    const pathname = usePathname();
    const { user } = useAuth();
    const isAdminOrHR = user?.role === 'Admin' || (user?.role as string) === 'HR';

    const tabs = [
        { name: 'Dashboard & Roster', href: '/attendance', icon: Clock, adminOnly: false },
        { name: 'Bulk Manual Entry', href: '/attendance/bulk', icon: CheckSquare, adminOnly: true },
        { name: 'CSV / .dat Import', href: '/attendance/import', icon: UploadCloud, adminOnly: true },
        { name: 'Devices & Punch Logs', href: '/attendance/devices', icon: Cpu, adminOnly: true },
        { name: 'Settings & Holidays', href: '/attendance/settings', icon: Settings, adminOnly: true },
    ].filter(tab => !tab.adminOnly || isAdminOrHR);

    return (
        <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
            {tabs.map((tab) => {
                const isActive =
                    tab.href === '/attendance'
                        ? pathname === '/attendance'
                        : pathname.startsWith(tab.href);
                return (
                    <Link
                        key={tab.href}
                        href={tab.href}
                        className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                            isActive
                                ? 'bg-gray-900 text-white shadow-sm'
                                : 'bg-white text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-gray-200'
                        }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        <span>{tab.name}</span>
                    </Link>
                );
            })}
        </div>
    );
}
