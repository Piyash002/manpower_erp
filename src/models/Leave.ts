import mongoose, { Schema, Document, Model } from 'mongoose';

export type LeaveType = 'Casual' | 'Sick' | 'Earned' | 'Unpaid' | 'Emergency';
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected';

export interface ILeave extends Document {
  employee_id: mongoose.Types.ObjectId;
  leave_type: LeaveType;
  start_date: Date;
  end_date: Date;
  reason?: string;
  status: LeaveStatus;
  reviewed_by?: string;
  reviewed_at?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const LeaveSchema = new Schema<ILeave>(
  {
    employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    leave_type: {
      type: String,
      enum: ['Casual', 'Sick', 'Earned', 'Unpaid', 'Emergency'],
      default: 'Casual',
      required: true,
    },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    reason: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
      index: true,
    },
    reviewed_by: { type: String, default: '' },
    reviewed_at: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Leave: Model<ILeave> =
  mongoose.models.Leave || mongoose.model<ILeave>('Leave', LeaveSchema);

