import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, TokenPayload } from './jwt';
import { connectDB } from './db';
import { AuditLog } from '@/models/AuditLog';

export type UserRole = 'Admin' | 'Counselor' | 'Accountant' | 'Viewer';

export interface AuthSession {
  user: TokenPayload;
}

/**
 * Extract token from either HttpOnly Cookie or Authorization Header
 */
export function getTokenFromRequest(req: NextRequest): string | null {
  // Check cookie first
  const cookieToken = req.cookies.get('auth_token')?.value;
  if (cookieToken) return cookieToken;

  // Check header
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * Get current authenticated user or null
 */
export function getCurrentUser(req: NextRequest): TokenPayload | null {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Guard route by requiring authentication and allowed roles
 */
export function requireAuth(
  req: NextRequest,
  allowedRoles?: UserRole[]
): { user: TokenPayload; errorResponse?: never } | { user?: never; errorResponse: NextResponse } {
  const user = getCurrentUser(req);

  if (!user) {
    return {
      errorResponse: NextResponse.json(
        { success: false, message: 'Unauthorized. Please sign in.' },
        { status: 401 }
      ),
    };
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return {
      errorResponse: NextResponse.json(
        {
          success: false,
          message: `Forbidden. Your role (${user.role}) is not authorized to perform this action.`,
        },
        { status: 403 }
      ),
    };
  }

  return { user };
}

/**
 * Helper to record audit log entries
 */
export async function createAuditLog({
  user,
  action,
  entity,
  entityId,
  oldValues,
  newValues,
  ipAddress,
}: {
  user?: { userId?: string; username?: string; name?: string; role?: string } | null;
  action: string;
  entity: string;
  entityId?: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
}) {
  try {
    await connectDB();
    await AuditLog.create({
      userId: user?.userId || 'system',
      userName: user?.name || user?.username || 'System',
      userRole: user?.role || 'System',
      action,
      entity,
      entityId,
      oldValues: oldValues ? JSON.parse(JSON.stringify(oldValues)) : undefined,
      newValues: newValues ? JSON.parse(JSON.stringify(newValues)) : undefined,
      ipAddress,
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

