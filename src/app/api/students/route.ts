import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Student } from '@/models/Student';
import { Installment } from '@/models/Installment';
import { Payment } from '@/models/Payment';
import { StudentDocument } from '@/models/StudentDocument';
import { Batch } from '@/models/Batch';
import { BatchAssessment } from '@/models/BatchAssessment';
import { generateStudentId, generateReceiptNo } from '@/models/Counter';
import { calculateInstallments } from '@/lib/formatters';
import { DEFAULT_DOCUMENT_CHECKLIST } from '@/lib/seed';

// GET /api/students - List students with search, filters & overdue check
export async function GET(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor', 'Accountant', 'Viewer']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    await connectDB();
    const { searchParams } = new URL(req.url);

    const query = searchParams.get('q')?.trim();
    const tradeId = searchParams.get('trade_id');
    const country = searchParams.get('country');
    const batch = searchParams.get('batch');
    const status = searchParams.get('status');
    const sort = searchParams.get('sort') || 'newest';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const filter: any = {};

    if (query) {
      filter.$or = [
        { name: { $regex: query, $options: 'i' } },
        { student_no: { $regex: query, $options: 'i' } },
        { mobile: { $regex: query, $options: 'i' } },
        { passport_no: { $regex: query, $options: 'i' } },
        { nid_or_birth_cert: { $regex: query, $options: 'i' } },
      ];
    }

    if (tradeId && tradeId !== 'all') filter.trade_id = tradeId;
    if (country && country !== 'all') filter.destination_country = country;
    if (batch && batch !== 'all') filter.batch = batch;
    if (status && status !== 'all') filter.status = status;

    let sortObj: any = { createdAt: -1 };
    if (sort === 'batch_asc') sortObj = { batch: 1, student_no: 1 };
    else if (sort === 'batch_desc') sortObj = { batch: -1, student_no: 1 };
    else if (sort === 'name_asc') sortObj = { name: 1 };
    else if (sort === 'student_no_asc') sortObj = { student_no: 1 };
    else if (sort === 'due_desc') sortObj = { total_due: -1 };

    const skip = (page - 1) * limit;

    const [rawStudents, total] = await Promise.all([
      Student.find(filter)
        .populate('trade_id', 'name')
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),
      Student.countDocuments(filter),
    ]);

    // Check overdue installments & fetch assessments for returned students
    const studentIds = rawStudents.map((s) => s._id);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [overdueInstallments, assessments] = await Promise.all([
      Installment.find({
        student_id: { $in: studentIds },
        due_date: { $lt: startOfToday },
        status: { $ne: 'Paid' },
        $expr: { $lt: ['$paid_amount', '$amount'] },
      }).select('student_id'),
      BatchAssessment.find({
        student_id: { $in: studentIds },
      }).lean(),
    ]);

    const overdueStudentIdSet = new Set(
      overdueInstallments.map((i) => i.student_id.toString())
    );

    const assessmentMap = new Map<string, any>();
    for (const a of assessments) {
      assessmentMap.set(a.student_id.toString(), {
        ...a,
        _id: a._id.toString(),
      });
    }

    const students = rawStudents.map((s: any) => ({
      ...s,
      is_overdue: (s.total_due || 0) > 0 && overdueStudentIdSet.has(s._id.toString()),
      assessment: assessmentMap.get(s._id.toString()) || null,
    }));

    return NextResponse.json({
      success: true,
      students,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error('Fetch students error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch students' },
      { status: 500 }
    );
  }
}

// POST /api/students - New Admission (Admin and Counselor only)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req, ['Admin', 'Counselor']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    await connectDB();

    const {
      // Identity
      name,
      father_name,
      mother_name,
      date_of_birth,
      gender,
      blood_group,
      nid_or_birth_cert,
      religion,
      marital_status,
      photo_url,

      // Contact
      mobile,
      email,
      emergency_contact_name,
      emergency_contact_relation,
      emergency_contact_phone,
      present_address,
      permanent_address,

      // Passport
      passport_no,
      passport_issue_date,
      passport_expiry_date,
      passport_doc_url,

      // Previous Overseas Work
      has_previous_overseas_work,
      overseas_country,
      overseas_from_year,
      overseas_to_year,
      overseas_trade,
      overseas_passport_no,
      overseas_visa_type,
      overseas_visa_no,
      overseas_visa_expiry,
      overseas_reason_for_return,

      // Training & Destination
      trade_id,
      trade_name,
      batch,
      session,
      admission_date,
      destination_country,
      destination_contract_years,

      // Fees
      admission_fee,
      course_fee,
      visa_cost,
      govt_fee,
      discount,

      // First Payment
      paid_now,
      payment_method,
      payment_reference,
      payment_note,

      // Installments
      installment_count,
    } = body;

    // Validate Required Fields
    if (!name || !father_name || !mother_name || !date_of_birth || !gender || !nid_or_birth_cert) {
      return NextResponse.json(
        { success: false, message: 'All personal identity fields are required' },
        { status: 400 }
      );
    }

    if (!mobile || !emergency_contact_name || !emergency_contact_phone || !present_address || !permanent_address) {
      return NextResponse.json(
        { success: false, message: 'Contact information and addresses are required' },
        { status: 400 }
      );
    }

    if (!passport_no) {
      return NextResponse.json(
        { success: false, message: 'Passport number is required' },
        { status: 400 }
      );
    }

    if (!trade_id || !trade_name || !batch || !session) {
      return NextResponse.json(
        { success: false, message: 'Trade, batch and session selection are required' },
        { status: 400 }
      );
    }

    // 1. PRD Section 5.2 Duplicate Checks:
    // "Duplicate check: saving is refused if the passport number or NID already belongs to another student. Tell the user which student."
    const cleanPassport = passport_no.trim().toUpperCase();
    const existingPassport = await Student.findOne({ passport_no: cleanPassport });
    if (existingPassport) {
      return NextResponse.json(
        {
          success: false,
          message: `Duplicate Passport: Passport number "${cleanPassport}" already belongs to student ${existingPassport.student_no} (${existingPassport.name}). Admission refused.`,
        },
        { status: 409 }
      );
    }

    const cleanNid = nid_or_birth_cert.trim();
    const existingNid = await Student.findOne({ nid_or_birth_cert: cleanNid });
    if (existingNid) {
      return NextResponse.json(
        {
          success: false,
          message: `Duplicate NID/Birth Certificate: Number "${cleanNid}" already belongs to student ${existingNid.student_no} (${existingNid.name}). Admission refused.`,
        },
        { status: 409 }
      );
    }

    // 2. Fee Calculation (PRD Section 7)
    const admFee = Math.round(Number(admission_fee || 0));
    const crsFee = Math.round(Number(course_fee || 0));
    const vCost = Math.round(Number(visa_cost || 0));
    const gFee = Math.round(Number(govt_fee || 0));
    const disc = Math.round(Number(discount || 0));

    const totalPayable = Math.max(0, admFee + crsFee + vCost + gFee - disc);
    const paidNowAmount = Math.min(Math.max(0, Math.round(Number(paid_now || 0))), totalPayable);
    const remainingDue = totalPayable - paidNowAmount;

    // 3. Generate Auto Student ID (ST-YYYY-0001)
    const studentNo = await generateStudentId();

    // 4. Create Student
    const newStudent = await Student.create({
      student_no: studentNo,

      // Identity
      name: name.trim(),
      father_name: father_name.trim(),
      mother_name: mother_name.trim(),
      date_of_birth: new Date(date_of_birth),
      gender,
      blood_group: blood_group || 'Unknown',
      nid_or_birth_cert: cleanNid,
      religion: religion || 'Islam',
      marital_status: marital_status || 'Single',
      photo_url: photo_url || '',

      // Contact
      mobile: mobile.trim(),
      email: email ? email.trim() : '',
      emergency_contact_name: emergency_contact_name.trim(),
      emergency_contact_relation: emergency_contact_relation.trim(),
      emergency_contact_phone: emergency_contact_phone.trim(),
      present_address: present_address.trim(),
      permanent_address: permanent_address.trim(),

      // Passport
      passport_no: cleanPassport,
      passport_issue_date: passport_issue_date ? new Date(passport_issue_date) : undefined,
      passport_expiry_date: passport_expiry_date ? new Date(passport_expiry_date) : undefined,

      // Previous Overseas Work
      has_previous_overseas_work: Boolean(has_previous_overseas_work),
      overseas_country: overseas_country || '',
      overseas_from_year: overseas_from_year ? Number(overseas_from_year) : undefined,
      overseas_to_year: overseas_to_year ? Number(overseas_to_year) : undefined,
      overseas_trade: overseas_trade || '',
      overseas_passport_no: overseas_passport_no || '',
      overseas_visa_type: overseas_visa_type || '',
      overseas_visa_no: overseas_visa_no || '',
      overseas_visa_expiry: overseas_visa_expiry ? new Date(overseas_visa_expiry) : undefined,
      overseas_reason_for_return: overseas_reason_for_return || '',

      // Training
      trade_id,
      trade_name: trade_name.trim(),
      batch: batch.trim(),
      session: session.trim(),
      admission_date: admission_date ? new Date(admission_date) : new Date(),
      destination_country: destination_country || 'Not decided yet',
      destination_contract_years: Number(destination_contract_years || 0),
      status: 'Active',

      // Fee Snapshot
      fee_snapshot: {
        admission_fee: admFee,
        course_fee: crsFee,
        visa_cost: vCost,
        govt_fee: gFee,
        discount: disc,
        total_payable: totalPayable,
      },

      total_paid: paidNowAmount,
      total_due: remainingDue,
      created_by: auth.user.name,
    });

    // 5. Default Documents Checklist Creation (attach Passport copy if uploaded at admission)
    const documentRecords = DEFAULT_DOCUMENT_CHECKLIST.map((doc) => {
      if (doc.document_type === 'Passport copy' && passport_doc_url) {
        return {
          student_id: newStudent._id,
          document_type: doc.document_type,
          needs_expiry: doc.needs_expiry,
          received: true,
          received_on: new Date(),
          expiry_date: passport_expiry_date ? new Date(passport_expiry_date) : null,
          file_url: passport_doc_url,
          notes: 'Uploaded during new admission',
        };
      }
      return {
        student_id: newStudent._id,
        document_type: doc.document_type,
        needs_expiry: doc.needs_expiry,
        received: false,
      };
    });
    await StudentDocument.insertMany(documentRecords);

    // 6. Record First Payment & Receipt (if paid_now > 0)
    let receiptRecord = null;
    if (paidNowAmount > 0) {
      const receiptNo = await generateReceiptNo();
      receiptRecord = await Payment.create({
        receipt_no: receiptNo,
        student_id: newStudent._id,
        amount: paidNowAmount,
        method: payment_method || 'Cash',
        reference: payment_reference || '',
        payment_date: admission_date ? new Date(admission_date) : new Date(),
        note: payment_note || 'Admission First Payment',
        created_by: auth.user.name,
      });

      await createAuditLog({
        user: auth.user,
        action: 'PAYMENT_RECORDED',
        entity: 'Payment',
        entityId: receiptRecord._id.toString(),
        newValues: {
          receipt_no: receiptNo,
          student_no: newStudent.student_no,
          amount: paidNowAmount,
          method: payment_method,
        },
      });
    }

    // 7. Generate Installments (always create at least 1 installment if remainingDue > 0)
    const installCount = Math.max(1, parseInt(installment_count || '1', 10) || 1);
    let installmentRecords: any[] = [];
    if (remainingDue > 0) {
      const calculated = calculateInstallments(
        remainingDue,
        installCount,
        admission_date ? new Date(admission_date) : new Date()
      );

      const toInsert = calculated.map((item) => ({
        student_id: newStudent._id,
        installment_no: item.number,
        due_date: new Date(item.dueDate),
        amount: item.amount,
        paid_amount: 0,
        status: 'Pending',
      }));

      installmentRecords = await Installment.insertMany(toInsert);
    }

    // 8. Auto-link to Batch Assessment if matching Batch exists
    if (batch && batch.trim()) {
      try {
        const matchedBatch = await Batch.findOne({
          $or: [{ batch_code: batch.trim() }, { name: batch.trim() }],
        });
        if (matchedBatch) {
          await BatchAssessment.create({
            batch_id: matchedBatch._id,
            student_id: newStudent._id,
            result_status: 'Pending',
          });
        }
      } catch (batchErr) {
        console.error('Error linking batch assessment:', batchErr);
      }
    }

    // 9. Audit Log for Admission
    await createAuditLog({
      user: auth.user,
      action: 'ADMISSION_CREATED',
      entity: 'Student',
      entityId: newStudent._id.toString(),
      newValues: {
        student_no: newStudent.student_no,
        name: newStudent.name,
        trade: newStudent.trade_name,
        total_payable: totalPayable,
        paid_now: paidNowAmount,
        installments: installCount,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Student admitted successfully with ID: ${studentNo}`,
      student: newStudent,
      receipt: receiptRecord,
      installments: installmentRecords,
    });
  } catch (error: any) {
    console.error('Admission error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to complete admission' },
      { status: 500 }
    );
  }
}

