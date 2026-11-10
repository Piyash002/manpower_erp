import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Student } from '@/models/Student';
import { Installment } from '@/models/Installment';
import { Payment } from '@/models/Payment';
import { StudentDocument } from '@/models/StudentDocument';
import { BatchAssessment } from '@/models/BatchAssessment';
import { Batch } from '@/models/Batch';
import { isWithin6Months } from '@/lib/formatters';

// GET /api/students/[id] - Full profile
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;
    await connectDB();

    const student = await Student.findById(id).populate('trade_id', 'name course_days');
    if (!student) {
      return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
    }

    const [installments, payments, documents, assessment, batch] = await Promise.all([
      Installment.find({ student_id: id }).sort({ installment_no: 1 }),
      Payment.find({ student_id: id }).sort({ payment_date: -1 }),
      StudentDocument.find({ student_id: id }).sort({ createdAt: 1 }),
      BatchAssessment.findOne({ student_id: id }).lean(),
      Batch.findOne({
        $or: [{ batch_code: student.batch }, { name: student.batch }],
      }).lean(),
    ]);

    // Check passport 6-month expiry alert (PRD Section 5.7)
    const passportExpiringSoon = isWithin6Months(student.passport_expiry_date);

    return NextResponse.json({
      success: true,
      student,
      installments,
      payments,
      documents,
      assessment: assessment
        ? {
            ...assessment,
            _id: assessment._id.toString(),
          }
        : null,
      batch: batch
        ? {
            ...batch,
            _id: batch._id.toString(),
          }
        : null,
      passportExpiringSoon,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch student details' },
      { status: 500 }
    );
  }
}

// PUT /api/students/[id] - Profile update (Admin and Counselor)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'Counselor']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;
    const body = await req.json();

    await connectDB();
    const student = await Student.findById(id);
    if (!student) {
      return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
    }

    const oldValues = {
      mobile: student.mobile,
      email: student.email,
      emergency_contact_name: student.emergency_contact_name,
      emergency_contact_relation: student.emergency_contact_relation,
      emergency_contact_phone: student.emergency_contact_phone,
      present_address: student.present_address,
      permanent_address: student.permanent_address,
      passport_no: student.passport_no,
      passport_issue_date: student.passport_issue_date,
      passport_expiry_date: student.passport_expiry_date,
      batch: student.batch,
    };

    // If passport number changed, ensure no duplicate
    if (body.passport_no && body.passport_no.trim().toUpperCase() !== student.passport_no) {
      const cleanPassport = body.passport_no.trim().toUpperCase();
      const existing = await Student.findOne({ passport_no: cleanPassport, _id: { $ne: id } });
      if (existing) {
        return NextResponse.json(
          {
            success: false,
            message: `Passport number "${cleanPassport}" already belongs to student ${existing.student_no} (${existing.name}).`,
          },
          { status: 409 }
        );
      }
      student.passport_no = cleanPassport;
    }

    // Editable fields - Full student profile update
    if (body.name) student.name = body.name.trim();
    if (body.father_name) student.father_name = body.father_name.trim();
    if (body.mother_name) student.mother_name = body.mother_name.trim();
    if (body.date_of_birth) student.date_of_birth = new Date(body.date_of_birth);
    if (body.gender) student.gender = body.gender;
    if (body.blood_group) student.blood_group = body.blood_group.trim();
    if (body.nid_or_birth_cert) student.nid_or_birth_cert = body.nid_or_birth_cert.trim();
    if (body.religion) student.religion = body.religion.trim();
    if (body.marital_status) student.marital_status = body.marital_status.trim();
    if (body.mobile) student.mobile = body.mobile.trim();
    if (body.email !== undefined) student.email = body.email ? body.email.trim() : '';
    if (body.emergency_contact_name) student.emergency_contact_name = body.emergency_contact_name.trim();
    if (body.emergency_contact_relation) student.emergency_contact_relation = body.emergency_contact_relation.trim();
    if (body.emergency_contact_phone) student.emergency_contact_phone = body.emergency_contact_phone.trim();
    if (body.present_address) student.present_address = body.present_address.trim();
    if (body.permanent_address) student.permanent_address = body.permanent_address.trim();
    if (body.passport_issue_date) student.passport_issue_date = new Date(body.passport_issue_date);
    if (body.passport_expiry_date) student.passport_expiry_date = new Date(body.passport_expiry_date);
    if (body.destination_country) student.destination_country = body.destination_country.trim();
    if (body.destination_contract_years !== undefined) student.destination_contract_years = Number(body.destination_contract_years);
    if (body.status) student.status = body.status;
    if (body.batch) student.batch = body.batch.trim();
    if (body.photo_url !== undefined) student.photo_url = body.photo_url;

    await student.save();

    await createAuditLog({
      user: auth.user,
      action: 'STUDENT_UPDATED',
      entity: 'Student',
      entityId: student._id.toString(),
      oldValues,
      newValues: {
        mobile: student.mobile,
        passport_no: student.passport_no,
        passport_expiry_date: student.passport_expiry_date,
        batch: student.batch,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Student profile updated successfully',
      student,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update student profile' },
      { status: 500 }
    );
  }
}

// DELETE /api/students/[id] - Admin only
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;
    await connectDB();

    const student = await Student.findById(id);
    if (!student) {
      return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
    }

    await Promise.all([
      Student.findByIdAndDelete(id),
      Installment.deleteMany({ student_id: id }),
      Payment.deleteMany({ student_id: id }),
      StudentDocument.deleteMany({ student_id: id }),
    ]);

    await createAuditLog({
      user: auth.user,
      action: 'STUDENT_DELETED',
      entity: 'Student',
      entityId: id,
      oldValues: { student_no: student.student_no, name: student.name },
    });

    return NextResponse.json({
      success: true,
      message: `Student ${student.student_no} deleted successfully`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to delete student' },
      { status: 500 }
    );
  }
}

