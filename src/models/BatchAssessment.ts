import mongoose, { Schema, Document, Model } from 'mongoose';

export type AssessmentResult = 'Pending' | 'Passed' | 'Failed';

export interface IBatchAssessment extends Document {
  batch_id: mongoose.Types.ObjectId;
  student_id: mongoose.Types.ObjectId;
  exam_date?: Date | null;
  theory_score?: number | null;
  practical_score?: number | null;
  total_score?: number | null;
  result_status: AssessmentResult;
  certificate_no?: string;
  certificate_url?: string;
  certificate_issue_date?: Date | null;
  remarks?: string;
  evaluated_by?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BatchAssessmentSchema = new Schema<IBatchAssessment>(
  {
    batch_id: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    student_id: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    exam_date: { type: Date, default: null },
    theory_score: { type: Number, default: null, min: 0, max: 100 },
    practical_score: { type: Number, default: null, min: 0, max: 100 },
    total_score: { type: Number, default: null, min: 0, max: 100 },
    result_status: {
      type: String,
      enum: ['Pending', 'Passed', 'Failed'],
      default: 'Pending',
      index: true,
    },
    certificate_no: { type: String, default: '', trim: true },
    certificate_url: { type: String, default: '', trim: true },
    certificate_issue_date: { type: Date, default: null },
    remarks: { type: String, default: '', trim: true },
    evaluated_by: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

BatchAssessmentSchema.index({ batch_id: 1, student_id: 1 }, { unique: true });

export const BatchAssessment: Model<IBatchAssessment> =
  mongoose.models.BatchAssessment ||
  mongoose.model<IBatchAssessment>('BatchAssessment', BatchAssessmentSchema);

