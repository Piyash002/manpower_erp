import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, UserRole } from '@/lib/auth';

export const ACCOUNTS_READ_ROLES: UserRole[] = ['Admin', 'Accountant', 'Viewer'];
export const ACCOUNTS_WRITE_ROLES: UserRole[] = ['Admin', 'Accountant'];
export const ACCOUNTS_ADMIN_ROLES: UserRole[] = ['Admin'];

/**
 * Strict server-side RBAC guard for /api/accounts/*.
 * HR, Employee, Manager, and Counselor are denied core accounting ledger access.
 */
export function requireAccountsAuth(req: NextRequest, allowedRoles: UserRole[] = ACCOUNTS_READ_ROLES) {
  return requireAuth(req, allowedRoles);
}

export function forbiddenResponse(message: string) {
  return NextResponse.json({ success: false, message }, { status: 403 });
}

export function badRequestResponse(message: string, details?: unknown) {
  return NextResponse.json(
    { success: false, message, ...(details ? { details } : {}) },
    { status: 400 }
  );
}

