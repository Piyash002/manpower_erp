import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, createAuditLog } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser(req);

    if (user) {
      await createAuditLog({
        user,
        action: 'SIGN_OUT',
        entity: 'Auth',
        entityId: user.userId,
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      });
    }

    const response = NextResponse.json({
      success: true,
      message: 'Signed out successfully',
    });

    response.cookies.delete('auth_token');
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Logout failed' },
      { status: 500 }
    );
  }
}

