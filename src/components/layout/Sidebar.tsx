'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  UserPlus,
  Users2,
  Globe2,
  ShieldCheck,
  LogOut,
  X,
  KeyRound,
  Banknote,
  GraduationCap,
  FileText,
  PanelLeftClose,
  Sparkles,
  UserCheck,
  Clock,
  Receipt,
  BookOpen,
  FileSpreadsheet,
  BookMarked,
  Lock,
  Scale,
  Layers,
  Wallet,
  ClockAlert,
} from 'lucide-react';
import { TokenPayload } from '@/lib/jwt';
import { Badge } from '@/components/ui/Badge';

interface SidebarProps {
  user: TokenPayload | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenChangePassword?: () => void;
}

export function Sidebar({ user, isOpen, onClose, onOpenChangePassword }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

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

  const role = user?.role || 'Viewer';

  interface NavItem {
    title: string;
    href: string;
    icon: any;
    allowed: string[];
  }

  interface MenuGroup {
    heading: string;
    items: NavItem[];
  }

  const menuGroups: MenuGroup[] = [
    {
      heading: 'Main',
      items: [
        {
          title: 'Dashboard',
          href: '/',
          icon: LayoutDashboard,
          allowed: ['Admin', 'Counselor', 'Accountant', 'Viewer'],
        },
      ],
    },
    {
      heading: 'Student Admission',
      items: [
        {
          title: 'New Admission',
          href: '/admissions/new',
          icon: UserPlus,
          allowed: ['Admin', 'Counselor'],
        },
        {
          title: 'Students Directory',
          href: '/students',
          icon: Users2,
          allowed: ['Admin', 'Counselor', 'Accountant', 'Viewer'],
        },
        {
          title: 'Batches & Assessment',
          href: '/batches',
          icon: GraduationCap,
          allowed: ['Admin', 'Counselor', 'Accountant', 'Viewer'],
        },
        {
          title: 'Trades & Countries',
          href: '/trades',
          icon: Globe2,
          allowed: ['Admin'],
        },
      ],
    },
    {
      heading: 'HRM',
      items: [
        {
          title: 'Employees & Agents',
          href: '/hrm/employees',
          icon: UserCheck,
          allowed: ['Admin', 'Counselor', 'Accountant', 'Viewer'],
        },
        {
          title: 'Attendance & Calendar',
          href: '/attendance',
          icon: Clock,
          allowed: ['Admin', 'Counselor', 'Accountant', 'Viewer'],
        },
        {
          title: 'Payroll Runs & Payslips',
          href: '/payroll',
          icon: Receipt,
          allowed: ['Admin', 'HR', 'Manager', 'Employee', 'Counselor', 'Accountant', 'Viewer'],
        },
        {
          title: 'Users & Staff',
          href: '/users',
          icon: ShieldCheck,
          allowed: ['Admin'],
        },
        {
          title: 'System Audit Logs',
          href: '/audit-logs',
          icon: FileText,
          allowed: ['Admin', 'Counselor', 'Accountant', 'Viewer'],
        },
      ],
    },
    {
      heading: 'Accounts',
      items: [
        {
          title: 'Fee Templates',
          href: '/accounts/fee-templates',
          icon: Layers,
          allowed: ['Admin', 'Accountant', 'Viewer'],
        },
        {
          title: 'Student Fees',
          href: '/accounts/student-fees',
          icon: Users2,
          allowed: ['Admin', 'Accountant', 'Viewer'],
        },
        {
          title: 'Money Receipts',
          href: '/accounts/receipts',
          icon: Banknote,
          allowed: ['Admin', 'Accountant', 'Viewer'],
        },
        {
          title: 'Due & Aging',
          href: '/accounts/dues',
          icon: ClockAlert,
          allowed: ['Admin', 'Accountant', 'Viewer'],
        },
        {
          title: 'Salary Disbursement',
          href: '/accounts/payroll',
          icon: Wallet,
          allowed: ['Admin', 'Accountant', 'Viewer'],
        },
        {
          title: 'Chart of Accounts',
          href: '/accounts/coa',
          icon: BookOpen,
          allowed: ['Admin', 'Accountant', 'Viewer'],
        },
        {
          title: 'Journal Vouchers',
          href: '/accounts/vouchers',
          icon: FileSpreadsheet,
          allowed: ['Admin', 'Accountant', 'Viewer'],
        },
        {
          title: 'General Ledger',
          href: '/accounts/ledger',
          icon: BookMarked,
          allowed: ['Admin', 'Accountant', 'Viewer'],
        },
        {
          title: 'Opening Balances',
          href: '/accounts/opening-balances',
          icon: Scale,
          allowed: ['Admin', 'Accountant', 'Viewer'],
        },
        {
          title: 'Periods & Fiscal Year',
          href: '/accounts/periods',
          icon: Lock,
          allowed: ['Admin', 'Accountant', 'Viewer'],
        },
      ],
    },
  ];

  const roleBadgeVariants: Record<string, 'purple' | 'info' | 'warning' | 'gray'> = {
    Admin: 'purple',
    Counselor: 'info',
    Accountant: 'warning',
    Viewer: 'gray',
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden"
        />
      )}

      {/* CodeZenX ERP Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 flex flex-col w-64 bg-white border-r border-slate-200/90 text-slate-700 transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* CodeZenX ERP Brand Header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-100">
          <Link href="/" className="flex items-center gap-2.5">
            <img
              src="/images/codezenx-logo.jpg"
              alt="CodeZenX ERP"
              className="w-9 h-9 rounded-lg object-cover shadow-sm shrink-0"
            />
            <div>
              <div className="flex items-center gap-1">
                <span className="text-base font-bold tracking-tight text-slate-900 font-sans">
                  CodeZenX <span className="text-sky-600">ERP</span>
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium -mt-1">Manpower &amp; Recruitment</p>
            </div>
          </Link>

          <button
            onClick={onClose}
            title="Collapse Sidebar"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors md:hidden"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="hidden md:flex p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer">
            <PanelLeftClose className="w-4 h-4" />
          </div>
        </div>

        {/* Navigation list grouped cleanly under Main, Student Admission, HRM */}
        <div className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
          {menuGroups.map((group) => {
            const visibleItems = group.items.filter((item) => item.allowed.includes(role));
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.heading} className="space-y-1">
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                  {group.heading}
                </div>

                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.href === '/'
                      ? pathname === '/'
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.title}
                      href={item.href}
                      onClick={() => onClose()}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? 'text-white' : 'text-slate-400'
                          }`}
                        />
                        <span>{item.title}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer with Signed-in Profile */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/80">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="relative w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-xs font-bold text-slate-700">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800 truncate">{user?.name || 'User'}</p>
                <div className="flex items-center gap-1.5">
                  <Badge variant={roleBadgeVariants[role] || 'gray'} size="sm">
                    {role}
                  </Badge>
                </div>
              </div>
            </div>

            {onOpenChangePassword && (
              <button
                onClick={onOpenChangePassword}
                title="Change Password"
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-md transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-transparent rounded-lg transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
