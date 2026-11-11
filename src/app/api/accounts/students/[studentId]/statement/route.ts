import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getStudentFeeStatement } from '@/lib/accounts/fees';

/**
 * Read-only financial statement for a student (Accounts + Admission read-only panel).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  const { studentId } = await params;

  try {
    const statement = await getStudentFeeStatement(studentId);
    return NextResponse.json({ success: true, data: statement });
  } catch (error: any) {
    const msg = error.message || 'Failed to fetch student statement';
    return NextResponse.json(
      { success: false, message: msg },
      { status: msg === 'Student not found.' ? 404 : 500 }
    );
  }
}

