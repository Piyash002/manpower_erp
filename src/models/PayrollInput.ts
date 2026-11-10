import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPayrollInput extends Document {
  employee_id: mongoose.Types.ObjectId;
  month: number;
  year: number;
  bonus: number;
  overtime_hours: number;
  overtime_rate: number;
  loan_installment: number;
  manual_deduction: number;
  notes?: string;
  updated_by?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PayrollInputSchema = new Schema<IPayrollInput>(
  {
    employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 2020, max: 2100 },
    bonus: { type: Number, default: 0, min: 0 },
    overtime_hours: { type: Number, default: 0, min: 0 },
    overtime_rate: { type: Number, default: 0, min: 0 },
    loan_installment: { type: Number, default: 0, min: 0 },
    manual_deduction: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '', trim: true },
    updated_by: { type: String, default: '' },
  },
  { timestamps: true }
);

PayrollInputSchema.index({ employee_id: 1, month: 1, year: 1 }, { unique: true });

export const PayrollInput: Model<IPayrollInput> =
  mongoose.models.PayrollInput ||
  mongoose.model<IPayrollInput>('PayrollInput', PayrollInputSchema);

