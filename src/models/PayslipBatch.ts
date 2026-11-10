import mongoose, { Schema, Document, Model } from 'mongoose';

export type PayslipBatchStatus = 'Draft' | 'Confirmed' | 'Paid' | 'Cancelled';

export interface IPayslipBatch extends Document {
  name: string;
  batch_code: string;
  month: number;
  year: number;
  department: string; // 'all' or specific department name
  status: PayslipBatchStatus;
  payslip_count: number;
  total_gross_pay: number;
  total_deductions: number;
  total_net_pay: number;
  created_by: string;
  confirmed_at?: Date | null;
  paid_at?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PayslipBatchSchema = new Schema<IPayslipBatch>(
  {
    name: { type: String, required: true, trim: true },
    batch_code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 2020, max: 2100 },
    department: { type: String, default: 'all', trim: true },
    status: {
      type: String,
      enum: ['Draft', 'Confirmed', 'Paid', 'Cancelled'],
      default: 'Draft',
      index: true,
    },
    payslip_count: { type: Number, default: 0, min: 0 },
    total_gross_pay: { type: Number, default: 0, min: 0 },
    total_deductions: { type: Number, default: 0, min: 0 },
    total_net_pay: { type: Number, default: 0, min: 0 },
    created_by: { type: String, default: 'System' },
    confirmed_at: { type: Date, default: null },
    paid_at: { type: Date, default: null },
  },
  { timestamps: true }
);

export const PayslipBatch: Model<IPayslipBatch> =
  mongoose.models.PayslipBatch ||
  mongoose.model<IPayslipBatch>('PayslipBatch', PayslipBatchSchema);

