import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Student } from '@/models/Student';
import { Installment } from '@/models/Installment';
import { Payment } from '@/models/Payment';
import { StudentDocument } from '@/models/StudentDocument';
import { BatchAssessment } from '@/models/BatchAssessment';
import { Batch } from '@/models/Batch';
import { CountryCost } from '@/models/CountryCost';
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
    if (body.status) student.status = body.status;
    if (body.batch) student.batch = body.batch.trim();
    if (body.photo_url !== undefined) student.photo_url = body.photo_url;
    if (body.overseas_passport_url !== undefined) student.overseas_passport_url = body.overseas_passport_url;
    if (body.overseas_visa_url !== undefined) student.overseas_visa_url = body.overseas_visa_url;

    // Server-side auto-lookup if destination_country changed/set to a real country and visa_cost was 0 and not manually overridden
    let autoVisaCost = body.visa_cost;
    let autoGovtFee = body.govt_fee;
    if (
      body.destination_country &&
      body.destination_country !== 'Not decided yet' &&
      body.destination_country !== prevCountry &&
      body.visa_cost === undefined &&
      (student.fee_snapshot?.visa_cost || 0) === 0
    ) {
      const rate =
        (await CountryCost.findOne({
          country: body.destination_country.trim(),
          trade_id: student.trade_id,
        }).lean()) ||
        (await CountryCost.findOne({ country: body.destination_country.trim() }).lean());

      if (rate) {
        autoVisaCost = rate.visa_cost;
        autoGovtFee = rate.govt_fee;
        if (body.destination_contract_years === undefined) {
          student.destination_contract_years = rate.contract_years;
        }
      }
    }

    // Optional Visa / Country / Fee Package update (e.g. course-only student later includes Visa & Country)
    const hasFeeUpdate =
      body.admission_fee !== undefined ||
      body.course_fee !== undefined ||
      autoVisaCost !== undefined ||
      autoGovtFee !== undefined ||
      body.discount !== undefined;

    if (hasFeeUpdate) {
      const adm = Math.max(0, Math.round(Number(body.admission_fee ?? student.fee_snapshot.admission_fee)));
      const crs = Math.max(0, Math.round(Number(body.course_fee ?? student.fee_snapshot.course_fee)));
      const visa = Math.max(0, Math.round(Number(autoVisaCost ?? student.fee_snapshot.visa_cost)));
      const govt = Math.max(0, Math.round(Number(autoGovtFee ?? student.fee_snapshot.govt_fee)));
      const disc = Math.max(0, Math.round(Number(body.discount ?? student.fee_snapshot.discount)));
      const newPayable = Math.max(0, adm + crs + visa + govt - disc);

      if (newPayable < student.total_paid) {
        return NextResponse.json(
          {
            success: false,
            message: `New total payable (৳${newPayable}) cannot be less than already paid amount (৳${student.total_paid}).`,
          },
          { status: 400 }
        );
      }

      const oldDue = student.total_due;
      const newDue = newPayable - student.total_paid;
      const deltaDue = newDue - oldDue;

      student.fee_snapshot = {
        admission_fee: adm,
        course_fee: crs,
        visa_cost: visa,
        govt_fee: govt,
        discount: disc,
        total_payable: newPayable,
      };
      student.total_due = newDue;

      // Keep Installments synchronized with new total_due
      if (deltaDue > 0) {
        const lastInst = await Installment.findOne({ student_id: id }).sort({ installment_no: -1 });
        const dueDate = body.visa_due_date
          ? new Date(body.visa_due_date)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await Installment.create({
          student_id: student._id,
          installment_no: (lastInst?.installment_no || 0) + 1,
          due_date: dueDate,
          amount: deltaDue,
          paid_amount: 0,
          status: 'Pending',
        });
      } else if (deltaDue < 0) {
        let toReduce = Math.abs(deltaDue);
        const unpaidInsts = await Installment.find({
          student_id: id,
          status: { $ne: 'Paid' },
        }).sort({ installment_no: -1 });

        for (const inst of unpaidInsts) {
          if (toReduce <= 0) break;
          const rem = Math.max(0, inst.amount - (inst.paid_amount || 0));
          const cut = Math.min(rem, toReduce);
          if (cut > 0) {
            inst.amount -= cut;
            toReduce -= cut;
            if (inst.amount <= (inst.paid_amount || 0)) {
              inst.status = 'Paid';
              inst.paid_on = inst.paid_on || new Date();
            }
            await inst.save();
          }
        }
      }
    }

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
        destination_country: student.destination_country,
        fee_snapshot: student.fee_snapshot,
        total_due: student.total_due,
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

