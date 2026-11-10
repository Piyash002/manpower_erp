import mongoose, { Schema, Document, Model } from 'mongoose';

export type DepartmentStatus = 'Active' | 'Inactive';

export interface IDepartment extends Document {
  name: string;
  code: string;
  head_id?: mongoose.Types.ObjectId | null;
  parent_department_id?: mongoose.Types.ObjectId | null;
  description?: string;
  status: DepartmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentSchema = new Schema<IDepartment>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    head_id: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    parent_department_id: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
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

export const Department: Model<IDepartment> =
  mongoose.models.Department || mongoose.model<IDepartment>('Department', DepartmentSchema);

