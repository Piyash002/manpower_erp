import mongoose, { Schema, Document, Model } from 'mongoose';

export type PunchType = 'IN' | 'OUT';
export type PunchSource = 'web' | 'hr' | 'csv' | 'biometric';

export interface IAttendanceLog extends Document {
  employee_id: mongoose.Types.ObjectId;
  date: Date; // Normalized UTC midnight for YYYY-MM-DD in Asia/Dhaka
  timestamp: Date;
  punch_type: PunchType;
  source: PunchSource;
  ip_address?: string;
  location?: string;
  reason?: string;
  recorded_by?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceLogSchema = new Schema<IAttendanceLog>(
  {
    employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    date: { type: Date, required: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    punch_type: {
      type: String,
      enum: ['IN', 'OUT'],
      required: true,
    },
    source: {
      type: String,
      enum: ['web', 'hr', 'csv', 'biometric'],
      default: 'web',
      required: true,
    },
    ip_address: { type: String, default: '' },
    location: { type: String, default: '', trim: true },
    reason: { type: String, default: '', trim: true },
    recorded_by: { type: String, default: '' },
  },
  { timestamps: true }
);

AttendanceLogSchema.index({ employee_id: 1, date: 1, timestamp: 1 });

export const AttendanceLog: Model<IAttendanceLog> =
  mongoose.models.AttendanceLog ||
  mongoose.model<IAttendanceLog>('AttendanceLog', AttendanceLogSchema);

