import mongoose, { Schema, Document, Model } from 'mongoose';

export type AttendanceStatus = 'Present' | 'Absent' | 'Late' | 'Half-Day';

export interface IAttendance extends Document {
  employee_id: mongoose.Types.ObjectId;
  date: Date;
  check_in?: Date | null;
  check_out?: Date | null;
  status: AttendanceStatus;
  notes?: string;
  marked_by?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSchema = new Schema<IAttendance>(
  {
    employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    date: { type: Date, required: true, index: true },
    check_in: { type: Date, default: null },
    check_out: { type: Date, default: null },
    status: {
      type: String,
      enum: ['Present', 'Absent', 'Late', 'Half-Day'],
      default: 'Present',
      required: true,
    },
    notes: { type: String, default: '', trim: true },
    marked_by: { type: String, default: '' },
  },
  { timestamps: true }
);

AttendanceSchema.index({ employee_id: 1, date: 1 }, { unique: true });

export const Attendance: Model<IAttendance> =
  mongoose.models.Attendance || mongoose.model<IAttendance>('Attendance', AttendanceSchema);

