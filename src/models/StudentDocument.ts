import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IStudentDocument extends Document {
  student_id: mongoose.Types.ObjectId;
  document_type: string;
  needs_expiry: boolean;
  received: boolean;
  received_on?: Date | null;
  expiry_date?: Date | null;
  file_url?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StudentDocumentSchema = new Schema<IStudentDocument>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    document_type: { type: String, required: true },
    needs_expiry: { type: Boolean, default: false },
    received: { type: Boolean, default: false },
    received_on: { type: Date, default: null },
    expiry_date: { type: Date, default: null },
    file_url: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

StudentDocumentSchema.index({ student_id: 1, document_type: 1 }, { unique: true });

export const StudentDocument: Model<IStudentDocument> =
  mongoose.models.StudentDocument ||
  mongoose.model<IStudentDocument>('StudentDocument', StudentDocumentSchema);

