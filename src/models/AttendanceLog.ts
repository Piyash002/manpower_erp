import mongoose, { Schema, Document, Model } from 'mongoose';

export type PunchType = 'IN' | 'OUT';
export type PunchSource =
  | 'Manual'
  | 'Biometric'
  | 'Import'
  | 'Self Check-in'
  | 'web'
  | 'hr'
  | 'csv'
  | 'biometric';

export interface IAttendanceLog extends Document {
  employee_id?: mongoose.Types.ObjectId | null;
  biometric_id?: string;
  device_id?: mongoose.Types.ObjectId | null;
  matched: boolean;
  date: Date; // Normalized UTC midnight for YYYY-MM-DD in Asia/Dhaka
  timestamp: Date;
  punch_type: PunchType;
  source: PunchSource;
  ip_address?: string;
  location?: string;
  reason?: string;
  recorded_by?: string;
  raw_line?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceLogSchema = new Schema<IAttendanceLog>(
  {
    employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', default: null, index: true },
    biometric_id: { type: String, default: '', trim: true, uppercase: true, index: true },
    device_id: { type: Schema.Types.ObjectId, ref: 'BiometricDevice', default: null, index: true },
    matched: { type: Boolean, default: true, index: true },
    date: { type: Date, required: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    punch_type: {
      type: String,
      enum: ['IN', 'OUT'],
      required: true,
    },
    source: {
      type: String,
      enum: ['Manual', 'Biometric', 'Import', 'Self Check-in', 'web', 'hr', 'csv', 'biometric'],
      default: 'Self Check-in',
      required: true,
    },
    ip_address: { type: String, default: '' },
    location: { type: String, default: '', trim: true },
    reason: { type: String, default: '', trim: true },
    recorded_by: { type: String, default: '' },
    raw_line: { type: String, default: '' },
  },
  { timestamps: true }
);

AttendanceLogSchema.index({ employee_id: 1, date: 1, timestamp: 1 });

export const AttendanceLog: Model<IAttendanceLog> =
  mongoose.models.AttendanceLog ||
  mongoose.model<IAttendanceLog>('AttendanceLog', AttendanceLogSchema);
