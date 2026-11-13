'use client';

import React, { useState, useEffect, createContext, useContext } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ChangePasswordModal } from './ChangePasswordModal';
import { TokenPayload } from '@/lib/jwt';
import {
  Loader2,
  LayoutDashboard,
  Users2,
  Banknote,
  Building2,
  Menu,
} from 'lucide-react';

interface AuthContextType {
  user: TokenPayload | null;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  refreshUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function DashboardLayout({
  children,
  initialUser = null,
}: {
  children: React.ReactNode;
  initialUser?: TokenPayload | null;
}) {
  const pathname = usePathname();
  const [user, setUser] = useState<TokenPayload | null>(initialUser);
  const [loading, setLoading] = useState(!initialUser);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [isMandatoryPasswordChange, setIsMandatoryPasswordChange] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('codezenx_sidebar_collapsed');
      if (saved === 'true') setIsCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('codezenx_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          setUser(data.user);

          // PRD Section 3.1: "The Admin must change its password at first login."
          if (data.user.mustChangePassword) {
            setIsMandatoryPasswordChange(true);
            setPasswordModalOpen(true);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch user session:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialUser) {
      fetchUser();
    } else if (initialUser.mustChangePassword) {
      setIsMandatoryPasswordChange(true);
      setPasswordModalOpen(true);
    }
  }, [initialUser]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <img
            src="/images/codezenx-logo.jpg"
            alt="CodeZenX ERP"
            className="w-12 h-12 rounded-xl object-cover shadow-md"
          />
          <Loader2 className="w-6 h-6 text-sky-600 animate-spin" />
          <p className="text-sm font-medium text-slate-600">Loading CodeZenX ERP...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, refreshUser: fetchUser }}>
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <Sidebar
          user={user}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
          onOpenChangePassword={() => {
            setIsMandatoryPasswordChange(false);
            setPasswordModalOpen(true);
          }}
        />

        <div
          className={`flex flex-col flex-1 transition-all duration-200 ${
            isCollapsed ? 'md:pl-20' : 'md:pl-64'
          }`}
        >
          <Header
            user={user}
            onOpenSidebar={() => setSidebarOpen(true)}
            onOpenChangePassword={() => {
              setIsMandatoryPasswordChange(false);
              setPasswordModalOpen(true);
            }}
          />

          <main className="flex-1 p-3 sm:p-5 md:p-8 max-w-7xl w-full mx-auto pb-20 md:pb-8">
            {children}
          </main>
        </div>

        {/* Mobile Bottom Navigation Bar (Phone & Small Tablet Friendly) */}
        <nav
          aria-label="Mobile Bottom Navigation"
          className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1 shadow-lg"
        >
          <div className="flex items-center justify-around">
            <Link
              href="/"
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-lg text-[10px] font-semibold transition-colors ${
                pathname === '/'
                  ? 'text-blue-600 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 mb-0.5" />
              <span>Overview</span>
            </Link>

            <Link
              href="/students"
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-lg text-[10px] font-semibold transition-colors ${
                pathname.startsWith('/students') || pathname.startsWith('/admissions')
                  ? 'text-blue-600 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users2 className="w-4 h-4 mb-0.5" />
              <span>Students</span>
            </Link>

            <Link
              href="/accounts/student-fees"
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-lg text-[10px] font-semibold transition-colors ${
                pathname.startsWith('/accounts')
                  ? 'text-blue-600 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Banknote className="w-4 h-4 mb-0.5" />
              <span>Accounts</span>
            </Link>

            <Link
              href="/hrm/dashboard"
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-lg text-[10px] font-semibold transition-colors ${
                pathname.startsWith('/hrm') ||
                pathname.startsWith('/payroll') ||
                pathname.startsWith('/attendance')
                  ? 'text-blue-600 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Building2 className="w-4 h-4 mb-0.5" />
              <span>HRM</span>
            </Link>

            <button
              onClick={() => setSidebarOpen(true)}
              className="flex flex-col items-center justify-center py-1 px-2.5 rounded-lg text-[10px] font-semibold text-slate-500 hover:text-slate-800"
            >
              <Menu className="w-4 h-4 mb-0.5" />
              <span>Menu</span>
            </button>
          </div>
        </nav>

        {/* Password change modal */}
        <ChangePasswordModal
          isOpen={passwordModalOpen}
          onClose={() => setPasswordModalOpen(false)}
          isMandatory={isMandatoryPasswordChange}
          onSuccess={() => {
            setIsMandatoryPasswordChange(false);
            fetchUser();
          }}
        />
      </div>
    </AuthContext.Provider>
  );
}

