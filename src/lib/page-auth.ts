import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken, type AppRole, type TokenPayload } from '@/lib/jwt';
import { getDefaultDashboardHref } from '@/lib/dashboard-helpers';

/**
 * Server-side RBAC guard for App Router pages.
 * Redirects unauthenticated users to /login and unauthorized roles to their default dashboard.
 */
export async function requirePageRole(allowedRoles: AppRole[]): Promise<TokenPayload> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) {
    redirect('/login');
  }

  const user = verifyToken(token);
  if (!user) {
    redirect('/login');
  }

  if (!allowedRoles.includes(user.role)) {
    redirect(getDefaultDashboardHref(user.role));
  }

  return user;
}

