import mongoose, { Schema, Document, Model } from 'mongoose';

export type DesignationStatus = 'Active' | 'Inactive';

export interface IDesignation extends Document {
  name: string;
  code: string;
  level: number;
  grade_label?: string;
  department_id?: mongoose.Types.ObjectId | null;
  description?: string;
  status: DesignationStatus;
  createdAt: Date;
  updatedAt: Date;
}

const DesignationSchema = new Schema<IDesignation>(
  {
    name: { type: String, required: true, trim: true, index: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    level: { type: Number, default: 1, min: 1 },
    grade_label: { type: String, default: 'G1', trim: true },
    department_id: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    description: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
      index: true,
    },
  },
  { timestamps: true }
);

export const Designation: Model<IDesignation> =
  mongoose.models.Designation || mongoose.model<IDesignation>('Designation', DesignationSchema);

