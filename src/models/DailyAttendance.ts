import mongoose, { Schema, Document, Model } from 'mongoose';

export type DailyAttendanceStatus =
  | 'Present'
  | 'Absent'
  | 'Late'
  | 'Half-day'
  | 'Leave'
  | 'Holiday'
  | 'Weekend';

export interface IDailyAttendance extends Document {
  employee_id: mongoose.Types.ObjectId;
  date: Date; // Normalized UTC midnight for YYYY-MM-DD in Asia/Dhaka
  schedule_id?: mongoose.Types.ObjectId | null;
  first_in?: Date | null;
  last_out?: Date | null;
  worked_hours: number;
  late_minutes: number;
  overtime_hours: number;
  overtime_approved: boolean;
  status: DailyAttendanceStatus;
  leave_id?: mongoose.Types.ObjectId | null;
  leave_is_paid?: boolean | null;
  has_conflict: boolean;
  missing_checkout: boolean;
  is_manual_override: boolean;
  notes?: string;
  locked: boolean;
  legacy_attendance_id?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DailyAttendanceSchema = new Schema<IDailyAttendance>(
  {
    employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    date: { type: Date, required: true, index: true },
    schedule_id: { type: Schema.Types.ObjectId, ref: 'WorkingSchedule', default: null },
    first_in: { type: Date, default: null },
    last_out: { type: Date, default: null },
    worked_hours: { type: Number, default: 0, min: 0 },
    late_minutes: { type: Number, default: 0, min: 0 },
    overtime_hours: { type: Number, default: 0, min: 0 },
    overtime_approved: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['Present', 'Absent', 'Late', 'Half-day', 'Leave', 'Holiday', 'Weekend'],
      default: 'Present',
      required: true,
      index: true,
    },
    leave_id: { type: Schema.Types.ObjectId, ref: 'Leave', default: null },
    leave_is_paid: { type: Boolean, default: null },
    has_conflict: { type: Boolean, default: false },
    missing_checkout: { type: Boolean, default: false },
    is_manual_override: { type: Boolean, default: false },
    notes: { type: String, default: '', trim: true },
    locked: { type: Boolean, default: false, index: true },
    legacy_attendance_id: { type: String, default: '', index: true },
  },
  { timestamps: true }
);

DailyAttendanceSchema.index({ employee_id: 1, date: 1 }, { unique: true });

export const DailyAttendance: Model<IDailyAttendance> =
  mongoose.models.DailyAttendance ||
  mongoose.model<IDailyAttendance>('DailyAttendance', DailyAttendanceSchema);

