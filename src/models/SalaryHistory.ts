import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISalaryHistory extends Document {
  employee_id: mongoose.Types.ObjectId;
  previous_basic: number;
  new_basic: number;
  structure_id?: mongoose.Types.ObjectId | null;
  effective_date: Date;
  reason?: string;
  changed_by: string;
  createdAt: Date;
  updatedAt: Date;
}

const SalaryHistorySchema = new Schema<ISalaryHistory>(
  {
    employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    previous_basic: { type: Number, required: true, min: 0 },
    new_basic: { type: Number, required: true, min: 0 },
    structure_id: { type: Schema.Types.ObjectId, ref: 'SalaryStructure', default: null },
    effective_date: { type: Date, default: Date.now },
    reason: { type: String, default: '', trim: true },
    changed_by: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

SalaryHistorySchema.index({ employee_id: 1, effective_date: -1 });

export const SalaryHistory: Model<ISalaryHistory> =
  mongoose.models.SalaryHistory ||
  mongoose.model<ISalaryHistory>('SalaryHistory', SalaryHistorySchema);

