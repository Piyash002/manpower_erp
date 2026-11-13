'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Menu,
  Plus,
  Moon,
  Sun,
  Search,
  Globe,
  Bell,
  Mail,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  X,
  KeyRound,
  LogOut,
  RefreshCw,
  FileText,
  Percent,
  ShieldCheck,
  ArrowRight,
  GraduationCap,
  Users2,
  Building,
  Clock,
} from 'lucide-react';
import { TokenPayload } from '@/lib/jwt';
import { Badge } from '@/components/ui/Badge';
import { setGoogleTranslateLanguage } from '@/components/common/GoogleTranslateScript';

interface HeaderProps {
  user: TokenPayload | null;
  onOpenSidebar: () => void;
  onOpenChangePassword?: () => void;
  title?: string;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  category: 'salary' | 'attendance' | 'entries' | 'fee' | 'passport' | 'discount' | 'audit';
  level: 'danger' | 'warning' | 'info' | 'success';
  href: string;
  count?: number;
  timestamp: string;
  badgeText?: string;
}

export function Header({ user, onOpenSidebar, onOpenChangePassword, title }: HeaderProps) {
  const router = useRouter();
  const canAdmit = user?.role === 'Admin' || user?.role === 'Counselor';

  // 1. Campus / Branch Dropdown State
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState('CodeZenX ERP (Dhaka Campus)');

  const organizations = [
    { name: 'CodeZenX ERP (Dhaka Campus)', code: 'DHK-01' },
    { name: 'CodeZenX Technical Institute (Chattogram)', code: 'CTG-02' },
    { name: 'CodeZenX Recruitment Center (Sylhet)', code: 'SYL-03' },
  ];

  useEffect(() => {
    try {
      const savedCampus = localStorage.getItem('codezenx_campus');
      if (savedCampus && organizations.some((o) => o.name === savedCampus)) {
        setSelectedOrg(savedCampus);
      }
    } catch {
      // ignore in environments without localStorage
    }
  }, []);

  const handleSelectCampus = (orgName: string) => {
    setSelectedOrg(orgName);
    setShowOrgDropdown(false);
    try {
      localStorage.setItem('codezenx_campus', orgName);
    } catch {
      // ignore
    }
  };

  // 2. Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'dark') {
        setIsDarkMode(true);
        document.documentElement.classList.add('dark');
      } else {
        setIsDarkMode(false);
        document.documentElement.classList.remove('dark');
        if (!savedTheme) {
          localStorage.setItem('theme', 'light');
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleDarkMode = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    try {
      if (nextDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    } catch {
      // ignore
    }
  };

  // 3. Language State
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [selectedLang, setSelectedLang] = useState('en');

  useEffect(() => {
    try {
      const savedLang = localStorage.getItem('codezenx_lang');
      if (savedLang) setSelectedLang(savedLang);
    } catch {
      // ignore
    }
  }, []);

  const handleSelectLang = (lang: string) => {
    setSelectedLang(lang);
    setShowLangDropdown(false);
    setGoogleTranslateLanguage(lang as 'en' | 'bn');
  };

  // 4. Live Notifications State
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifCategory, setNotifCategory] = useState<'all' | 'salary' | 'attendance' | 'fee' | 'entries'>('all');
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  const fetchNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setNotifications(json.notifications || []);
          setUnreadCount(json.unreadCount || 0);
        }
      }
    } catch (e) {
      console.error('Failed to fetch live notifications:', e);
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 60000);
    return () => clearInterval(timer);
  }, []);

  // 5. Messages / Quick Notices State
  const [showMessages, setShowMessages] = useState(false);

  // 6. User Profile Dropdown State
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error(e);
    } finally {
      router.push('/login');
      router.refresh();
    }
  };

  // 7. Global Quick Search Modal State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/students?limit=8&search=${encodeURIComponent(searchQuery.trim())}`);
        const data = await res.json();
        if (data.students) setSearchResults(data.students);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const quickNavLinks = [
    { title: 'Admission Dashboard', href: '/admission/dashboard', icon: GraduationCap },
    { title: 'Student Directory', href: '/students', icon: Users2 },
    { title: 'HRM Dashboard', href: '/hrm/dashboard', icon: Building },
    { title: 'Accounts Dashboard', href: '/accounts/dashboard', icon: Clock },
    { title: 'Student Fees & Overdue', href: '/accounts/student-fees', icon: FileText },
    { title: 'System Users', href: '/users', icon: ShieldCheck },
  ];

  const roleDisplayNames: Record<string, string> = {
    Admin: 'Super Admin',
    Counselor: 'Admission Officer',
    HR: 'HRM Officer',
    Accountant: 'Accounts Officer',
    Viewer: 'Viewer',
  };

  const roleBadgeVariants: Record<string, 'purple' | 'info' | 'warning' | 'gray'> = {
    Admin: 'purple',
    Counselor: 'info',
    HR: 'info',
    Accountant: 'warning',
    Viewer: 'gray',
  };

  // Close dropdowns on background click
  const headerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setShowOrgDropdown(false);
        setShowLangDropdown(false);
        setShowNotifications(false);
        setShowMessages(false);
        setShowProfileDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <header
        ref={headerRef}
        className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-6 bg-white border-b border-slate-200/80 shadow-xs"
      >
        {/* Left section: Mobile Menu & Organization Picker */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSidebar}
            aria-label="Open Navigation Sidebar"
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg md:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Dynamic Campus / Branch Picker */}
          <div className="relative">
            <button
              onClick={() => {
                setShowOrgDropdown(!showOrgDropdown);
                setShowLangDropdown(false);
                setShowNotifications(false);
                setShowMessages(false);
                setShowProfileDropdown(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 rounded-lg text-xs font-semibold text-slate-800 transition-colors shadow-2xs"
            >
              <img
                src="/images/codezenx-logo.jpg"
                alt="CodeZenX"
                className="w-5 h-5 rounded object-cover shrink-0"
              />
              <span className="hidden md:inline max-w-[180px] lg:max-w-xs truncate">{selectedOrg}</span>
              <span className="md:hidden max-w-[90px] xs:max-w-[130px] truncate text-[11px] font-semibold">
                {selectedOrg.includes('(') ? selectedOrg.split('(')[1].replace(')', '') : selectedOrg}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            </button>

            {showOrgDropdown && (
              <div className="absolute left-0 mt-2 w-[calc(100vw-2rem)] sm:w-72 max-w-xs bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-100 mb-1">
                  <span>Select Campus / Branch</span>
                  <span className="text-emerald-600 font-mono text-[9px] bg-emerald-50 px-1.5 py-0.2 rounded">Live Active</span>
                </div>
                {organizations.map((org) => (
                  <button
                    key={org.name}
                    onClick={() => handleSelectCampus(org.name)}
                    className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                      selectedOrg === org.name
                        ? 'text-emerald-700 font-bold bg-emerald-50/50'
                        : 'text-slate-700'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <span className="truncate block font-medium">{org.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">Branch Code: {org.code}</span>
                    </div>
                    {selectedOrg === org.name && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right section: Theme, Search, Lang, Notifications, Messages, Profile */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* 1. Dark Mode Toggle */}
          <button
            onClick={toggleDarkMode}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="p-1.5 sm:p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-center"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* 2. Global Quick Search Button */}
          <button
            onClick={() => setIsSearchOpen(true)}
            title="Quick Search (Ctrl + K)"
            className="p-1.5 sm:p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-center"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* 3. Language Selector */}
          <div className="relative block">
            <button
              onClick={() => {
                setShowLangDropdown(!showLangDropdown);
                setShowOrgDropdown(false);
                setShowNotifications(false);
                setShowMessages(false);
                setShowProfileDropdown(false);
              }}
              title="Change Language"
              className="p-1.5 sm:p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1"
            >
              <Globe className="w-4 h-4" />
              <span className="text-[10px] sm:text-[11px] font-bold uppercase">{selectedLang}</span>
            </button>

            {showLangDropdown && (
              <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 text-xs">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Interface Language
                </div>
                <button
                  onClick={() => handleSelectLang('en')}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 ${
                    selectedLang === 'en' ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-700'
                  }`}
                >
                  <span>English (Default)</span>
                  {selectedLang === 'en' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}
                </button>
                <button
                  onClick={() => handleSelectLang('bn')}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 ${
                    selectedLang === 'bn' ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-700'
                  }`}
                >
                  <span>বাংলা (Bengali)</span>
                  {selectedLang === 'bn' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}
                </button>
              </div>
            )}
          </div>

          {/* 4. Live Dynamic Notifications */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowOrgDropdown(false);
                setShowLangDropdown(false);
                setShowMessages(false);
                setShowProfileDropdown(false);
                if (!showNotifications) fetchNotifications();
              }}
              title="System Notifications"
              className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex items-center justify-center w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-white animate-pulse" />
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-[calc(100vw-1.5rem)] sm:w-96 max-w-sm bg-white rounded-xl shadow-2xl border border-slate-200 p-3 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                  <div className="flex items-center gap-1.5">
                    <Bell className="w-4 h-4 text-slate-700" />
                    <span className="text-xs font-bold text-slate-800">Live System Alerts</span>
                    {notifications.length > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 font-mono">
                        {notifications.length}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={fetchNotifications}
                      title="Sync live alerts"
                      className="text-slate-400 hover:text-slate-600 p-1 rounded"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingNotifications ? 'animate-spin' : ''}`} />
                    </button>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Live Sync
                    </span>
                  </div>
                </div>

                {/* Category Filter Tabs */}
                <div className="flex items-center gap-1 pb-2 border-b border-slate-100 mb-2 overflow-x-auto no-scrollbar text-[11px]">
                  {[
                    { id: 'all', label: 'All', count: notifications.length },
                    { id: 'salary', label: 'Salary', count: notifications.filter((n) => n.category === 'salary').length },
                    { id: 'attendance', label: 'Attendance', count: notifications.filter((n) => n.category === 'attendance').length },
                    { id: 'fee', label: 'Overdues', count: notifications.filter((n) => n.category === 'fee' || n.category === 'discount').length },
                    { id: 'entries', label: 'Entries', count: notifications.filter((n) => n.category === 'entries' || n.category === 'passport').length },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setNotifCategory(tab.id as any)}
                      className={`px-2 py-1 rounded-md font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                        notifCategory === tab.id
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span>{tab.label}</span>
                      {tab.count > 0 && (
                        <span
                          className={`text-[9px] px-1 py-0.1 rounded-full font-bold ${
                            notifCategory === tab.id
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="space-y-2 max-h-80 overflow-y-auto text-xs pr-1">
                  {notifications.filter((n) => {
                    if (notifCategory === 'all') return true;
                    if (notifCategory === 'salary') return n.category === 'salary';
                    if (notifCategory === 'attendance') return n.category === 'attendance';
                    if (notifCategory === 'fee') return n.category === 'fee' || n.category === 'discount';
                    if (notifCategory === 'entries') return n.category === 'entries' || n.category === 'passport';
                    return true;
                  }).length === 0 ? (
                    <div className="py-6 text-center text-slate-400">
                      <CheckCircle2 className="w-6 h-6 mx-auto text-emerald-500 mb-1" />
                      <p className="font-semibold text-slate-700">All Systems Clear</p>
                      <p className="text-[11px] mt-0.5">No alerts in this category.</p>
                    </div>
                  ) : (
                    notifications
                      .filter((n) => {
                        if (notifCategory === 'all') return true;
                        if (notifCategory === 'salary') return n.category === 'salary';
                        if (notifCategory === 'attendance') return n.category === 'attendance';
                        if (notifCategory === 'fee') return n.category === 'fee' || n.category === 'discount';
                        if (notifCategory === 'entries') return n.category === 'entries' || n.category === 'passport';
                        return true;
                      })
                      .map((n) => (
                        <Link
                          key={n.id}
                          href={n.href}
                          onClick={() => setShowNotifications(false)}
                          className={`block p-2.5 rounded-lg border transition-all hover:shadow-xs ${
                            n.level === 'danger'
                              ? 'bg-rose-50/70 border-rose-200 hover:bg-rose-50'
                              : n.level === 'warning'
                                ? 'bg-amber-50/70 border-amber-200 hover:bg-amber-50'
                                : n.level === 'success'
                                  ? 'bg-emerald-50/70 border-emerald-200 hover:bg-emerald-50'
                                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {n.level === 'danger' ? (
                              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            ) : n.level === 'warning' ? (
                              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            ) : n.level === 'success' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <p className="font-bold text-slate-900 truncate">{n.title}</p>
                                {n.badgeText && (
                                  <span
                                    className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider shrink-0 ${
                                      n.level === 'danger'
                                        ? 'bg-rose-100 text-rose-800'
                                        : n.level === 'warning'
                                          ? 'bg-amber-100 text-amber-800'
                                          : n.level === 'success'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : 'bg-blue-100 text-blue-800'
                                    }`}
                                  >
                                    {n.badgeText}
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-600 text-[11px] mt-0.5 leading-snug">
                                {n.message}
                              </p>
                            </div>
                          </div>
                        </Link>
                      ))
                  )}
                </div>

                <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Auto-refresh every 60s</span>
                  <Link
                    href="/accounts/student-fees?status=Overdue"
                    onClick={() => setShowNotifications(false)}
                    className="font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    <span>View All Overdue Installments</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* 5. Messages / Live Sync Drawer */}
          <div className="relative hidden sm:block">
            <button
              onClick={() => {
                setShowMessages(!showMessages);
                setShowOrgDropdown(false);
                setShowLangDropdown(false);
                setShowNotifications(false);
                setShowProfileDropdown(false);
              }}
              title="System Notices"
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Mail className="w-4 h-4" />
            </button>

            {showMessages && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 p-3 z-50 animate-in fade-in zoom-in-95 duration-100 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                  <span className="font-bold text-slate-800">System Messages &amp; Status</span>
                  <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">
                    Online
                  </span>
                </div>
                <div className="space-y-2 text-slate-600 text-[11px]">
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="font-semibold text-slate-800">MongoDB Atlas Live Sync</p>
                    <p className="text-slate-500 mt-0.5">Database cluster healthy with connection pool active.</p>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="font-semibold text-slate-800">Cloudinary Asset Delivery</p>
                    <p className="text-slate-500 mt-0.5">Automated upload pipeline for passport and marksheets enabled.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="h-6 w-[1px] bg-slate-200 mx-1 hidden sm:block" />

          {/* 6. Dynamic User Profile Pill & Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowProfileDropdown(!showProfileDropdown);
                setShowOrgDropdown(false);
                setShowLangDropdown(false);
                setShowNotifications(false);
                setShowMessages(false);
              }}
              className="flex items-center gap-2 p-1 hover:bg-slate-100 rounded-xl transition-colors text-left"
            >
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold ring-2 ring-slate-100 shadow-2xs">
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full" />
              </div>
              <div className="hidden lg:block">
                <div className="text-xs font-bold text-slate-800 leading-tight">
                  {user?.name || 'Administrator'}
                </div>
                <div className="text-[10px] text-slate-500 font-semibold leading-tight">
                  {roleDisplayNames[user?.role || 'Viewer'] || user?.role || 'Viewer'}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden lg:block" />
            </button>

            {showProfileDropdown && (
              <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-64 max-w-xs bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 text-xs">
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="font-bold text-slate-900 text-sm truncate">{user?.name || 'User'}</p>
                  <p className="text-[11px] text-slate-500 font-mono">@{user?.username || 'user'}</p>
                  <div className="mt-1.5">
                    <Badge variant={roleBadgeVariants[user?.role || 'Viewer'] || 'gray'} size="sm">
                      {roleDisplayNames[user?.role || 'Viewer'] || user?.role || 'Viewer'}
                    </Badge>
                  </div>
                </div>

                <div className="py-1">
                  {onOpenChangePassword && (
                    <button
                      onClick={() => {
                        setShowProfileDropdown(false);
                        onOpenChangePassword();
                      }}
                      className="w-full text-left px-4 py-2 flex items-center gap-2 hover:bg-slate-50 text-slate-700 transition-colors"
                    >
                      <KeyRound className="w-4 h-4 text-slate-400" />
                      <span>Change Password</span>
                    </button>
                  )}
                  <Link
                    href="/users"
                    onClick={() => setShowProfileDropdown(false)}
                    className="w-full text-left px-4 py-2 flex items-center gap-2 hover:bg-slate-50 text-slate-700 transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4 text-slate-400" />
                    <span>Security &amp; Permissions</span>
                  </Link>
                </div>

                <div className="pt-1 border-t border-slate-100">
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2 flex items-center gap-2 hover:bg-rose-50 text-rose-700 font-semibold transition-colors"
                  >
                    <LogOut className="w-4 h-4 text-rose-600" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 7. Quick New Admission Button (Permission Protected) */}
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

      {/* Global Quick Search Modal (Command Palette) */}
      {isSearchOpen && (
        <div
          onClick={() => setIsSearchOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-start justify-center pt-14 sm:pt-20 p-2 sm:p-4 animate-in fade-in duration-100"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-xs max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center px-4 border-b border-slate-200">
              <Search className="w-4 h-4 text-slate-400 shrink-0 mr-2" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search candidates, student ID, phone, voucher or module..."
                className="w-full py-3.5 text-sm outline-hidden text-slate-900 placeholder:text-slate-400 bg-transparent"
              />
              <button
                onClick={() => setIsSearchOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 max-h-96 overflow-y-auto space-y-3">
              {/* Live search results */}
              {isSearching ? (
                <div className="py-6 text-center text-slate-400">Searching CodeZenX ERP...</div>
              ) : searchResults.length > 0 ? (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 px-2">
                    Matching Candidates
                  </p>
                  <div className="space-y-1">
                    {searchResults.map((st) => (
                      <Link
                        key={st._id}
                        href={`/students/${st._id}`}
                        onClick={() => setIsSearchOpen(false)}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <div>
                          <p className="font-bold text-slate-900">{st.name}</p>
                          <p className="text-[11px] text-slate-500 font-mono">
                            {st.student_no} · {st.phone || st.mobile} · {st.trade_name}
                          </p>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      </Link>
                    ))}
                  </div>
                </div>
              ) : searchQuery.trim() ? (
                <div className="py-6 text-center text-slate-400">No matching records found.</div>
              ) : null}

              {/* Quick Jump Shortcuts */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 px-2">
                  Quick Jump Shortcuts
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {quickNavLinks.map((link) => {
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.title}
                        href={link.href}
                        onClick={() => setIsSearchOpen(false)}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 border border-slate-100 text-slate-700 transition-colors"
                      >
                        <Icon className="w-4 h-4 text-slate-500 shrink-0" />
                        <span className="font-medium truncate">{link.title}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between px-4">
              <span>Press ESC to close</span>
              <span>CodeZenX ERP v2.0</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
