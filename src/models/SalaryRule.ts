import mongoose, { Schema, Document, Model } from 'mongoose';

export type SalaryRuleCategory = 'BASIC' | 'ALLOWANCE' | 'GROSS' | 'DEDUCTION' | 'NET';
export type SalaryRuleType = 'fixed' | 'percentage_of_basic' | 'formula';

export interface ISalaryRule extends Document {
  structure_id: mongoose.Types.ObjectId;
  name: string;
  code: string;
  category: SalaryRuleCategory;
  type: SalaryRuleType;
  amount_or_percentage: number;
  formula?: string;
  sequence: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SalaryRuleSchema = new Schema<ISalaryRule>(
  {
    structure_id: {
      type: Schema.Types.ObjectId,
      ref: 'SalaryStructure',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    category: {
      type: String,
      enum: ['BASIC', 'ALLOWANCE', 'GROSS', 'DEDUCTION', 'NET'],
      required: true,
    },
    type: {
      type: String,
      enum: ['fixed', 'percentage_of_basic', 'formula'],
      required: true,
    },
    amount_or_percentage: { type: Number, default: 0 },
    formula: { type: String, default: '', trim: true },
    sequence: { type: Number, required: true, default: 10 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SalaryRuleSchema.index({ structure_id: 1, code: 1 }, { unique: true });
SalaryRuleSchema.index({ structure_id: 1, sequence: 1 });

export const SalaryRule: Model<ISalaryRule> =
  mongoose.models.SalaryRule || mongoose.model<ISalaryRule>('SalaryRule', SalaryRuleSchema);

