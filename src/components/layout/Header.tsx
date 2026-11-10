'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Menu,
  Plus,
  Moon,
  Search,
  Globe,
  Bell,
  Mail,
  ChevronDown,
  Building,
  CheckCircle2,
  Calendar,
  X,
} from 'lucide-react';
import { TokenPayload } from '@/lib/jwt';

interface HeaderProps {
  user: TokenPayload | null;
  onOpenSidebar: () => void;
  title?: string;
}

export function Header({ user, onOpenSidebar, title }: HeaderProps) {
  const canAdmit = user?.role === 'Admin' || user?.role === 'Counselor';
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState('Manpower Training Academy (Dhaka Campus)');

  const organizations = [
    'Manpower Training Academy (Dhaka Campus)',
    'Falcon Technical Institute (Chattogram)',
    'Gulf Recruitment & Testing Center (Sylhet)',
  ];

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-6 bg-white border-b border-slate-200/80 shadow-xs">
      {/* Left section: Mobile menu & Organization Picker */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg md:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Dreams ERP Organization Pill */}
        <div className="relative">
          <button
            onClick={() => setShowOrgDropdown(!showOrgDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 rounded-lg text-xs font-semibold text-slate-800 transition-colors"
          >
            <span className="w-5 h-5 rounded bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
              M
            </span>
            <span className="max-w-[180px] sm:max-w-xs truncate">{selectedOrg}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          </button>

          {showOrgDropdown && (
            <div className="absolute left-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Select Campus / Branch
              </div>
              {organizations.map((org) => (
                <button
                  key={org}
                  onClick={() => {
                    setSelectedOrg(org);
                    setShowOrgDropdown(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between hover:bg-slate-50 ${
                    selectedOrg === org
                      ? 'text-emerald-600 font-bold bg-emerald-50/50'
                      : 'text-slate-700'
                  }`}
                >
                  <span className="truncate">{org}</span>
                  {selectedOrg === org && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right section: Icons matching Dreams ERP toolbar */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Dark Mode toggle icon */}
        <button
          title="Toggle Theme"
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors hidden sm:flex"
        >
          <Moon className="w-4 h-4" />
        </button>

        {/* Global Search icon */}
        <Link
          href="/students"
          title="Search Candidates"
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors hidden sm:flex"
        >
          <Search className="w-4 h-4" />
        </Link>

        {/* Language selector icon */}
        <button
          title="Language: English"
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors hidden sm:flex"
        >
          <Globe className="w-4 h-4" />
        </button>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            title="Notifications"
            className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 p-3 z-50">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                <span className="text-xs font-bold text-slate-800">Notifications</span>
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                  Live Sync
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="p-2 bg-slate-50 rounded-lg">
                  <p className="font-semibold text-slate-800">Passport Expiry Alerts</p>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Candidates with &lt; 6 months passport validity highlighted in Red.
                  </p>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <p className="font-semibold text-slate-800">Installment Due Reminders</p>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Upcoming dues filtered in Installment Collection module.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Messages icon */}
        <button
          title="Messages"
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors hidden sm:flex"
        >
          <Mail className="w-4 h-4" />
        </button>

        <div className="h-6 w-[1px] bg-slate-200 mx-1 hidden sm:block" />

        {/* User profile avatar with green online badge */}
        <div className="flex items-center gap-2 pl-1">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold ring-2 ring-slate-100">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full" />
          </div>
          <div className="hidden lg:block text-left">
            <div className="text-xs font-bold text-slate-800 leading-tight">
              {user?.name || 'Administrator'}
            </div>
            <div className="text-[10px] text-slate-400 font-medium leading-tight">
              {user?.role || 'Viewer'}
            </div>
          </div>
        </div>

        {/* Quick New Admission Button */}
        {canAdmit && (
          <Link
            href="/admissions/new"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors shrink-0 ml-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Admission</span>
          </Link>
        )}
      </div>
    </header>
  );
}
