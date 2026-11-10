import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuditLog } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { StudentDocument } from '@/models/StudentDocument';
import { Student } from '@/models/Student';

// PUT /api/students/[id]/documents - Update document item status/details
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'Counselor']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;
    const body = await req.json();
    const { document_id, received, expiry_date, file_url, notes } = body;

    if (!document_id) {
      return NextResponse.json(
        { success: false, message: 'document_id is required' },
        { status: 400 }
      );
    }

    await connectDB();
    const doc = await StudentDocument.findOne({ _id: document_id, student_id: id });
    if (!doc) {
      return NextResponse.json({ success: false, message: 'Document item not found' }, { status: 404 });
    }

    const oldValues = doc.toJSON();

    if (received !== undefined) {
      doc.received = Boolean(received);
      // PRD Section 5.6: "the date received (set automatically when ticked)"
      if (doc.received && !doc.received_on) {
        doc.received_on = new Date();
      } else if (!doc.received) {
        doc.received_on = null;
      }
    }

    if (expiry_date !== undefined) {
      doc.expiry_date = expiry_date ? new Date(expiry_date) : null;
    }

    if (file_url !== undefined) {
      doc.file_url = file_url;
    }

    if (notes !== undefined) {
      doc.notes = notes;
    }

    await doc.save();

    const student = await Student.findById(id).select('student_no name');

    await createAuditLog({
      user: auth.user,
      action: 'DOCUMENT_UPDATED',
      entity: 'StudentDocument',
      entityId: doc._id.toString(),
      oldValues,
      newValues: {
        document_type: doc.document_type,
        received: doc.received,
        student_no: student?.student_no,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Document updated successfully',
      document: doc,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update document' },
      { status: 500 }
    );
  }
}

// POST /api/students/[id]/documents - Add custom document line (Admin & Counselor)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req, ['Admin', 'Counselor']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { id } = await params;
    const { document_type, needs_expiry } = await req.json();

    if (!document_type) {
      return NextResponse.json(
        { success: false, message: 'document_type is required' },
        { status: 400 }
      );
    }

    await connectDB();
    const doc = await StudentDocument.create({
      student_id: id,
      document_type: document_type.trim(),
      needs_expiry: Boolean(needs_expiry),
      received: false,
    });

    return NextResponse.json({
      success: true,
      message: 'New document checklist item added',
      document: doc,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to add document' },
      { status: 500 }
    );
  }
}

