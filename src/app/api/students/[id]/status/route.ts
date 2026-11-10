import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Student } from '@/models/Student';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'Counselor']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;
    const { status } = await req.json();

    const validStatuses = ['Active', 'Passed', 'Failed', 'Dropped'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    await connectDB();
    const student = await Student.findById(id);
    if (!student) {
      return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
    }

    const oldStatus = student.status;
    student.status = status;
    await student.save();

    await createAuditLog({
      user: auth.user,
      action: 'STUDENT_STATUS_CHANGED',
      entity: 'Student',
      entityId: student._id.toString(),
      oldValues: { status: oldStatus },
      newValues: { status },
    });

    return NextResponse.json({
      success: true,
      message: `Status updated to ${status}`,
      status: student.status,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update student status' },
      { status: 500 }
    );
  }
}

