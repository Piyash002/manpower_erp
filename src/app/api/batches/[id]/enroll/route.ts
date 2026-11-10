import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Batch } from '@/models/Batch';
import { Student } from '@/models/Student';
import { BatchAssessment } from '@/models/BatchAssessment';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'Counselor']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    const { student_ids } = await req.json();

    if (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Please provide at least one student ID to enroll.' },
        { status: 400 }
      );
    }

    await connectDB();
    const batch = await Batch.findById(id);
    if (!batch) {
      return NextResponse.json({ success: false, message: 'Batch not found.' }, { status: 404 });
    }

    let enrolledCount = 0;

    for (const sId of student_ids) {
      const student = await Student.findById(sId);
      if (student) {
        student.batch = batch.batch_code;
        await student.save();

        // Create or ensure BatchAssessment record exists
        await BatchAssessment.findOneAndUpdate(
          { batch_id: batch._id, student_id: student._id },
          {
            $setOnInsert: {
              batch_id: batch._id,
              student_id: student._id,
              result_status: student.status === 'Passed' ? 'Passed' : student.status === 'Failed' ? 'Failed' : 'Pending',
            },
          },
          { upsert: true, new: true }
        );

        enrolledCount++;
      }
    }

    await createAuditLog({
      user: auth.user,
      action: 'BATCH_STUDENTS_ENROLLED',
      entity: 'Batch',
      entityId: batch._id.toString(),
      newValues: {
        batch_name: batch.name,
        batch_code: batch.batch_code,
        enrolled_count: enrolledCount,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Successfully enrolled ${enrolledCount} student(s) into batch "${batch.name}".`,
    });
  } catch (error: any) {
    console.error('Error enrolling students:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to enroll students.' },
      { status: 500 }
    );
  }
}

