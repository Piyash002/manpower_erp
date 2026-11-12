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
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant']);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;

  try {
    const body = await req.json();
    const {
      student_id,
      exam_date,
      theory_score,
      practical_score,
      result_status,
      certificate_no,
      certificate_url,
      certificate_issue_date,
      remarks,
    } = body;

    if (!student_id) {
      return NextResponse.json({ success: false, message: 'Student ID is required.' }, { status: 400 });
    }

    await connectDB();
    const batch = await Batch.findById(id);
    if (!batch) {
      return NextResponse.json({ success: false, message: 'Batch not found.' }, { status: 404 });
    }

    const student = await Student.findById(student_id);
    if (!student) {
      return NextResponse.json({ success: false, message: 'Student not found.' }, { status: 404 });
    }

    // Compute total score if scores are provided
    let totalScore: number | null = null;
    const tScore = theory_score !== undefined && theory_score !== null && theory_score !== '' ? Number(theory_score) : null;
    const pScore = practical_score !== undefined && practical_score !== null && practical_score !== '' ? Number(practical_score) : null;
    if (tScore !== null || pScore !== null) {
      totalScore = Math.round(((tScore || 0) + (pScore || 0)) / (tScore !== null && pScore !== null ? 2 : 1));
    }

    // Upsert BatchAssessment
    const assessment = await BatchAssessment.findOneAndUpdate(
      { batch_id: batch._id, student_id: student._id },
      {
        $set: {
          exam_date: exam_date ? new Date(exam_date) : null,
          theory_score: tScore,
          practical_score: pScore,
          total_score: totalScore,
          result_status: result_status || 'Pending',
          certificate_no: certificate_no ? certificate_no.trim() : '',
          certificate_url: certificate_url ? certificate_url.trim() : '',
          certificate_issue_date: certificate_issue_date ? new Date(certificate_issue_date) : null,
          remarks: remarks ? remarks.trim() : '',
          evaluated_by: auth.user.name,
        },
      },
      { upsert: true, new: true }
    );

    // Sync student status & batch code cleanly when result changes
    let studentChanged = false;
    if (result_status === 'Passed' && student.status !== 'Passed') {
      student.status = 'Passed';
      studentChanged = true;
    } else if (result_status === 'Failed' && student.status !== 'Failed') {
      student.status = 'Failed';
      studentChanged = true;
    } else if (
      result_status === 'Pending' &&
      (student.status === 'Passed' || student.status === 'Failed')
    ) {
      student.status = 'Active';
      studentChanged = true;
    }
    if (!student.batch || student.batch.trim() !== batch.batch_code) {
      student.batch = batch.batch_code;
      studentChanged = true;
    }
    if (studentChanged) {
      await student.save();
    }

    await createAuditLog({
      user: auth.user,
      action: 'EXAM_ASSESSMENT_RECORDED',
      entity: 'BatchAssessment',
      entityId: assessment._id.toString(),
      newValues: {
        student_no: student.student_no,
        student_name: student.name,
        batch: batch.batch_code,
        result_status,
        total_score: totalScore,
        certificate_no,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Exam assessment and result recorded for ${student.name}.`,
      assessment,
      student_status: student.status,
    });
  } catch (error: any) {
    console.error('Error saving assessment:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to save assessment.' },
      { status: 500 }
    );
  }
}

