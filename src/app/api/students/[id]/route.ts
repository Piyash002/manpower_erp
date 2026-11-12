import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Student } from '@/models/Student';
import { Installment } from '@/models/Installment';
import { Payment } from '@/models/Payment';
import { StudentDocument } from '@/models/StudentDocument';
import { BatchAssessment } from '@/models/BatchAssessment';
import { Batch } from '@/models/Batch';
import { Employee } from '@/models/Employee';
import { StudentFeePlan } from '@/models/StudentFeePlan';
import { MoneyReceipt } from '@/models/MoneyReceipt';
import { FeeRefund } from '@/models/FeeRefund';
import { JournalEntry } from '@/models/JournalEntry';
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

    const student = await Student.findById(id)
      .populate('trade_id', 'name course_days')
      .populate('referred_by_agent', 'employee_id firstName lastName phone department commission_rate');
    if (!student) {
      return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
    }

    void JournalEntry;

    const [documents, batch, allAssessments, feePlan, receipts, refunds] = await Promise.all([
      StudentDocument.find({ student_id: id }).sort({ createdAt: 1 }),
      Batch.findOne({
        $or: [{ batch_code: student.batch }, { name: student.batch }],
      }).lean(),
      BatchAssessment.find({ student_id: id }).sort({ updatedAt: -1 }).lean(),
      StudentFeePlan.findOne({ studentId: id, isDeleted: { $ne: true } })
        .populate('invoiceJournalEntryId', 'voucherNo entryDate')
        .lean(),
      MoneyReceipt.find({ studentId: id, isDeleted: { $ne: true } })
        .populate('journalEntryId', 'voucherNo entryDate')
        .sort({ receiptDate: -1 })
        .lean(),
      FeeRefund.find({ studentId: id, isDeleted: { $ne: true } })
        .populate('journalEntryId', 'voucherNo entryDate')
        .sort({ refundDate: -1 })
        .lean(),
    ]);

    const assessment =
      (batch && allAssessments.find((a) => a.batch_id?.toString() === batch._id.toString())) ||
      allAssessments[0] ||
      null;

    // Check passport 6-month expiry alert (PRD Section 5.7)
    const passportExpiringSoon = isWithin6Months(student.passport_expiry_date);

    return NextResponse.json({
      success: true,
      student,
      feePlan,
      receipts,
      refunds,
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
      destination_country: student.destination_country,
      fee_snapshot: student.fee_snapshot,
      total_due: student.total_due,
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
    const prevCountry = student.destination_country;
    if (body.destination_country) student.destination_country = body.destination_country.trim();
    if (body.destination_contract_years !== undefined) student.destination_contract_years = Number(body.destination_contract_years);
    const prevStatus = student.status;
    const prevBatch = student.batch;
    let matchedTargetBatch: any = null;

    if (body.batch !== undefined) {
      const nextBatchStr = String(body.batch || '').trim();
      if (nextBatchStr) {
        matchedTargetBatch = await Batch.findOne({
          $or: [
            { batch_code: nextBatchStr.toUpperCase() },
            { batch_code: nextBatchStr },
            { name: nextBatchStr },
          ],
        }).lean();
        if (
          matchedTargetBatch &&
          matchedTargetBatch.trade_id?.toString() !== student.trade_id?.toString()
        ) {
          return NextResponse.json(
            {
              success: false,
              message: `Batch "${matchedTargetBatch.batch_code}" belongs to trade "${matchedTargetBatch.trade_name}", not "${student.trade_name}".`,
            },
            { status: 400 }
          );
        }
        student.batch = matchedTargetBatch ? matchedTargetBatch.batch_code : nextBatchStr;
      } else {
        student.batch = '';
      }
    }
    if (body.status) student.status = body.status;
    if (body.photo_url !== undefined) student.photo_url = body.photo_url;
    if (body.education_qualifications !== undefined && Array.isArray(body.education_qualifications)) {
      student.education_qualifications = body.education_qualifications
        .filter((eq: any) => eq && eq.level)
        .map((eq: any) => ({
          level: String(eq.level).trim(),
          board_or_university: eq.board_or_university ? String(eq.board_or_university).trim() : '',
          passing_year: eq.passing_year ? String(eq.passing_year).trim() : '',
          result_gpa: eq.result_gpa ? String(eq.result_gpa).trim() : '',
          certificate_url: eq.certificate_url ? String(eq.certificate_url).trim() : '',
        }));
    }
    if (body.overseas_passport_url !== undefined) student.overseas_passport_url = body.overseas_passport_url;
    if (body.overseas_visa_url !== undefined) student.overseas_visa_url = body.overseas_visa_url;
    if (body.referred_by_agent !== undefined) {
      student.referred_by_agent =
        body.referred_by_agent && body.referred_by_agent !== '' ? body.referred_by_agent : null;
    }

    // Ownership boundary: fee packages, discounts, installments, and payments are owned by Accounts.
    // Admission profile edits update descriptive fields only (never money totals).
    void prevCountry;

    await student.save();

    // Sync batch transfer & assessment state cleanly
    if (body.batch !== undefined && student.batch !== prevBatch) {
      if (matchedTargetBatch) {
        await BatchAssessment.deleteMany({
          student_id: student._id,
          batch_id: { $ne: matchedTargetBatch._id },
          result_status: 'Pending',
          theory_score: null,
          practical_score: null,
          total_score: null,
          $or: [{ certificate_url: '' }, { certificate_url: { $exists: false } }],
        });
        await BatchAssessment.findOneAndUpdate(
          { batch_id: matchedTargetBatch._id, student_id: student._id },
          {
            $setOnInsert: {
              batch_id: matchedTargetBatch._id,
              student_id: student._id,
              result_status:
                student.status === 'Passed'
                  ? 'Passed'
                  : student.status === 'Failed'
                  ? 'Failed'
                  : 'Pending',
            },
          },
          { upsert: true }
        );
      } else if (!student.batch) {
        await BatchAssessment.deleteMany({
          student_id: student._id,
          result_status: 'Pending',
          theory_score: null,
          practical_score: null,
          total_score: null,
          $or: [{ certificate_url: '' }, { certificate_url: { $exists: false } }],
        });
      }
    }

    if (body.status && student.status !== prevStatus) {
      const targetResult =
        student.status === 'Passed'
          ? 'Passed'
          : student.status === 'Failed'
          ? 'Failed'
          : student.status === 'Active'
          ? 'Pending'
          : null;
      if (targetResult) {
        const curBatch =
          matchedTargetBatch ||
          (student.batch
            ? await Batch.findOne({
                $or: [{ batch_code: student.batch }, { name: student.batch }],
              }).lean()
            : null);
        if (curBatch) {
          await BatchAssessment.updateOne(
            { batch_id: curBatch._id, student_id: student._id },
            { $set: { result_status: targetResult } }
          );
        }
      }
    }

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
        destination_country: student.destination_country,
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

    const [hasPlan, hasReceipts, hasRefunds] = await Promise.all([
      StudentFeePlan.countDocuments({ studentId: id, isDeleted: { $ne: true } }),
      MoneyReceipt.countDocuments({ studentId: id, isDeleted: { $ne: true } }),
      FeeRefund.countDocuments({ studentId: id, isDeleted: { $ne: true } }),
    ]);

    if (hasPlan > 0 || hasReceipts > 0 || hasRefunds > 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Financial records exist in Accounts for this student. Hard deletion is forbidden; mark status Cancelled/Dropped and process a Credit Note or Refund in Accounts.',
        },
        { status: 409 }
      );
    }

    await Promise.all([
      Student.findByIdAndDelete(id),
      Installment.deleteMany({ student_id: id }),
      Payment.deleteMany({ student_id: id }),
      StudentDocument.deleteMany({ student_id: id }),
      BatchAssessment.deleteMany({ student_id: id }),
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

