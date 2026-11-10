'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { KeyRound, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMandatory?: boolean;
  onSuccess: () => void;
}

export function ChangePasswordModal({
  isOpen,
  onClose,
  isMandatory = false,
  onSuccess,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 10) {
      setError('New password must be at least 10 characters long as per ERP security guidelines.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update password');
      }

      setSuccess('Password updated successfully!');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isMandatory ? () => {} : onClose}
      title={isMandatory ? 'First Login: Change Required' : 'Change Password'}
      description={
        isMandatory
          ? 'Per PRD security rules, you must set a new strong password before proceeding.'
          : 'Update your account password. Must be at least 10 characters.'
      }
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {!isMandatory && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            New Password (Min 10 characters)
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            minLength={10}
            placeholder="At least 10 characters"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Confirm New Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            minLength={10}
            placeholder="Re-type new password"
          />
        </div>

        <div className="pt-2 flex justify-end gap-3">
          {!isMandatory && (
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <KeyRound className="w-4 h-4" />
            {loading ? 'Updating...' : 'Save New Password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

