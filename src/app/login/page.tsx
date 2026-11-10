'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, Lock, User, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Invalid username or password');
      }

      // Successful sign in -> redirect
      router.push(callbackUrl);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fillQuickLogin = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
      <form className="space-y-5" onSubmit={handleSubmit}>
        {error && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2.5 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
            Username
          </label>
          <div className="relative">
            <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wider disabled:opacity-50"
        >
          <span>{loading ? 'Verifying Credentials...' : 'Sign In to ERP'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      {/* Quick Demo Credentials for Evaluation */}
      <div className="mt-8 pt-6 border-t border-slate-700/60">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-center mb-3">
          One-Click Role Test Credentials
        </p>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => fillQuickLogin('admin@gmail.com', 'admin123')}
            className="p-2 bg-slate-900/80 hover:bg-slate-700 rounded-lg border border-slate-700 text-left transition-colors"
          >
            <span className="font-bold text-purple-400 block">Administrator</span>
            <span className="text-slate-400 text-[10px]">admin@gmail.com / admin123</span>
          </button>

          <button
            type="button"
            onClick={() => fillQuickLogin('counselor', 'Counselor12345')}
            className="p-2 bg-slate-900/80 hover:bg-slate-700 rounded-lg border border-slate-700 text-left transition-colors"
          >
            <span className="font-bold text-blue-400 block">Counselor</span>
            <span className="text-slate-400 text-[10px]">counselor / Counselor12345</span>
          </button>

          <button
            type="button"
            onClick={() => fillQuickLogin('accountant', 'Accountant12345')}
            className="p-2 bg-slate-900/80 hover:bg-slate-700 rounded-lg border border-slate-700 text-left transition-colors"
          >
            <span className="font-bold text-amber-400 block">Accountant</span>
            <span className="text-slate-400 text-[10px]">accountant / Accountant12345</span>
          </button>

          <button
            type="button"
            onClick={() => fillQuickLogin('viewer', 'Viewer123456')}
            className="p-2 bg-slate-900/80 hover:bg-slate-700 rounded-lg border border-slate-700 text-left transition-colors"
          >
            <span className="font-bold text-slate-400 block">Viewer (Read-Only)</span>
            <span className="text-slate-400 text-[10px]">viewer / Viewer123456</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen bg-slate-900 text-slate-100 flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background visual accents */}
      <div className="absolute top-0 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        {/* Brand Logo & Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white shadow-xl shadow-blue-500/20 mb-4">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase">
            Manpower Training & Recruitment ERP
          </h1>
          <p className="mt-1.5 text-xs text-slate-400 max-w-sm">
            Government Approved Agency Management System &bull; Technical Trade Training & Overseas Employment
          </p>
        </div>

        {/* Suspense wrapper for Next.js prerendering */}
        <Suspense
          fallback={
            <div className="p-8 bg-slate-800 text-center text-slate-400 rounded-2xl">
              Loading login portal...
            </div>
          }
        >
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-center text-xs text-slate-500">
          Security: Passwords hashed with salted bcrypt. Rate-limited lock on 5 failed attempts.
        </p>
      </div>
    </div>
  );
}
