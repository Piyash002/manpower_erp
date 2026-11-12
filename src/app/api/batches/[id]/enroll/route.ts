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

    const existingBatchAssessments = await BatchAssessment.find({ batch_id: batch._id })
      .select('student_id')
      .lean();
    const alreadyInBatch = new Set(
      existingBatchAssessments.map((a) => a.student_id.toString())
    );

    const candidateStudents = await Student.find({ _id: { $in: student_ids } });
    if (candidateStudents.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No valid students found to enroll.' },
        { status: 404 }
      );
    }

    // 1. Validate trade consistency across Batch and Students
    const mismatched = candidateStudents.filter(
      (s) => s.trade_id?.toString() !== batch.trade_id?.toString()
    );
    if (mismatched.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Trade mismatch: ${mismatched[0].student_no} (${mismatched[0].trade_name}) belongs to a different trade than batch ${batch.batch_code} (${batch.trade_name}).`,
        },
        { status: 400 }
      );
    }

    // 2. Enforce batch capacity for net new enrollments
    const newAdditions = candidateStudents.filter((s) => !alreadyInBatch.has(s._id.toString()));
    if (batch.capacity > 0 && alreadyInBatch.size + newAdditions.length > batch.capacity) {
      return NextResponse.json(
        {
          success: false,
          message: `Batch capacity (${batch.capacity}) exceeded. Currently ${alreadyInBatch.size} enrolled, adding ${newAdditions.length} would exceed capacity.`,
        },
        { status: 400 }
      );
    }

    let enrolledCount = 0;

    for (const student of candidateStudents) {
      // Remove stale Pending (ungraded) BatchAssessment from any old batch so trainee isn't duplicated
      await BatchAssessment.deleteMany({
        student_id: student._id,
        batch_id: { $ne: batch._id },
        result_status: 'Pending',
        theory_score: null,
        practical_score: null,
        total_score: null,
        $or: [{ certificate_url: '' }, { certificate_url: { $exists: false } }],
      });

      student.batch = batch.batch_code;
      await student.save();

      // Create or ensure BatchAssessment record exists
      await BatchAssessment.findOneAndUpdate(
        { batch_id: batch._id, student_id: student._id },
        {
          $setOnInsert: {
            batch_id: batch._id,
            student_id: student._id,
            result_status:
              student.status === 'Passed'
                ? 'Passed'
                : student.status === 'Failed'
                ? 'Failed'
                : 'Pending',
          },
        },
        { upsert: true, new: true }
      );

      enrolledCount++;
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

