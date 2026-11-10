'use client';

import React, { useState, useEffect, createContext, useContext } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ChangePasswordModal } from './ChangePasswordModal';
import { TokenPayload } from '@/lib/jwt';
import { Loader2 } from 'lucide-react';

interface AuthContextType {
  user: TokenPayload | null;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  refreshUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<TokenPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [isMandatoryPasswordChange, setIsMandatoryPasswordChange] = useState(false);

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
    fetchUser();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm font-medium text-slate-600">Loading Manpower ERP...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, refreshUser: fetchUser }}>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <Sidebar
          user={user}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onOpenChangePassword={() => {
            setIsMandatoryPasswordChange(false);
            setPasswordModalOpen(true);
          }}
        />

        <div className="flex flex-col flex-1 md:pl-64">
          <Header
            user={user}
            onOpenSidebar={() => setSidebarOpen(true)}
          />

          <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">{children}</main>
        </div>

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

