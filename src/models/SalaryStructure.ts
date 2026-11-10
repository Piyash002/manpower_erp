import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISalaryStructure extends Document {
  name: string;
  code: string;
  description?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SalaryStructureSchema = new Schema<ISalaryStructure>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    description: { type: String, default: '', trim: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export const SalaryStructure: Model<ISalaryStructure> =
  mongoose.models.SalaryStructure ||
  mongoose.model<ISalaryStructure>('SalaryStructure', SalaryStructureSchema);

