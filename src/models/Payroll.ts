import mongoose, { Schema, Document, Model } from 'mongoose';

export type PayrollStatus = 'Draft' | 'Processed' | 'Paid';

export interface IPayroll extends Document {
  employee_id: mongoose.Types.ObjectId;
  month: number; // 1 - 12
  year: number;
  basic_salary: number;
  deductions: number;
  commission_earned: number;
  commission_rate_applied?: number;
  referred_collections_total?: number;
  net_payable: number;
  status: PayrollStatus;
  paid_on?: Date | null;
  notes?: string;
  generated_by?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PayrollSchema = new Schema<IPayroll>(
  {
    employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 2020, max: 2100 },
    basic_salary: { type: Number, required: true, min: 0, default: 0 },
    deductions: { type: Number, required: true, min: 0, default: 0 },
    commission_earned: { type: Number, required: true, min: 0, default: 0 },
    commission_rate_applied: { type: Number, min: 0, default: 0 },
    referred_collections_total: { type: Number, min: 0, default: 0 },
    net_payable: { type: Number, required: true, min: 0, default: 0 },
    status: {
      type: String,
      enum: ['Draft', 'Processed', 'Paid'],
      default: 'Draft',
      index: true,
    },
    paid_on: { type: Date, default: null },
    notes: { type: String, default: '', trim: true },
    generated_by: { type: String, default: '' },
  },
  { timestamps: true }
);

PayrollSchema.index({ employee_id: 1, month: 1, year: 1 }, { unique: true });

export const Payroll: Model<IPayroll> =
  mongoose.models.Payroll || mongoose.model<IPayroll>('Payroll', PayrollSchema);

