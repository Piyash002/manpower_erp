import mongoose, { Schema, Document, Model } from 'mongoose';

export type CorrectionStatus = 'Pending' | 'Approved' | 'Rejected';

export interface IAttendanceCorrection extends Document {
  employee_id: mongoose.Types.ObjectId;
  date: Date;
  requested_in?: Date | null;
  requested_out?: Date | null;
  reason: string;
  status: CorrectionStatus;
  reviewed_by?: string;
  reviewed_at?: Date | null;
  review_note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceCorrectionSchema = new Schema<IAttendanceCorrection>(
  {
    employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    date: { type: Date, required: true, index: true },
    requested_in: { type: Date, default: null },
    requested_out: { type: Date, default: null },
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
      index: true,
    },
    reviewed_by: { type: String, default: '' },
    reviewed_at: { type: Date, default: null },
    review_note: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

export const AttendanceCorrection: Model<IAttendanceCorrection> =
  mongoose.models.AttendanceCorrection ||
  mongoose.model<IAttendanceCorrection>('AttendanceCorrection', AttendanceCorrectionSchema);

