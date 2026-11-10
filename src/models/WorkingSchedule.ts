import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWorkingSchedule extends Document {
  name: string;
  code: string;
  department?: string;
  working_days: number[]; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  start_time: string; // "09:00"
  end_time: string; // "18:00"
  grace_minutes: number;
  standard_hours: number;
  half_day_hours: number;
  overtime_after_hours: number;
  overtime_multiplier: number;
  overtime_needs_approval: boolean;
  late_rule_enabled: boolean;
  late_days_per_deduction: number; // e.g., 3 lates = 1 day salary deduction
  is_default: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const WorkingScheduleSchema = new Schema<IWorkingSchedule>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    department: { type: String, default: '', trim: true },
    working_days: { type: [Number], default: [0, 1, 2, 3, 4] }, // Sun-Thu default
    start_time: { type: String, required: true, default: '09:00' },
    end_time: { type: String, required: true, default: '18:00' },
    grace_minutes: { type: Number, default: 10, min: 0 },
    standard_hours: { type: Number, default: 8, min: 1 },
    half_day_hours: { type: Number, default: 4, min: 0.5 },
    overtime_after_hours: { type: Number, default: 8, min: 1 },
    overtime_multiplier: { type: Number, default: 1.5, min: 1 },
    overtime_needs_approval: { type: Boolean, default: false },
    late_rule_enabled: { type: Boolean, default: true },
    late_days_per_deduction: { type: Number, default: 3, min: 1 },
    is_default: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const WorkingSchedule: Model<IWorkingSchedule> =
  mongoose.models.WorkingSchedule ||
  mongoose.model<IWorkingSchedule>('WorkingSchedule', WorkingScheduleSchema);

