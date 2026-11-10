import mongoose, { Schema, Document, Model } from 'mongoose';

export type EmployeeDepartment =
  | 'Visa'
  | 'Training'
  | 'Accounts'
  | 'Agent'
  | 'Counseling'
  | 'Administration'
  | 'Other';

export type EmployeeStatus = 'Active' | 'On Leave' | 'Inactive' | 'Terminated';

export interface IEmployee extends Document {
  userId?: mongoose.Types.ObjectId | null;
  employee_id: string;
  biometric_id?: string | null;
  shift?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  department: EmployeeDepartment;
  designation: string;
  basic_salary: number;
  commission_rate: number;
  joining_date?: Date;
  status: EmployeeStatus;
  schedule_id?: mongoose.Types.ObjectId | null;
  manager_id?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeSchema = new Schema<IEmployee>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    employee_id: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    biometric_id: {
      type: String,
      trim: true,
      uppercase: true,
    },
    shift: { type: String, default: 'Regular', trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    department: {
      type: String,
      enum: ['Visa', 'Training', 'Accounts', 'Agent', 'Counseling', 'Administration', 'Other'],
      default: 'Counseling',
      required: true,
      index: true,
    },
    designation: { type: String, required: true, trim: true },
    basic_salary: { type: Number, required: true, min: 0, default: 0 },
    commission_rate: { type: Number, min: 0, max: 100, default: 0 },
    joining_date: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['Active', 'On Leave', 'Inactive', 'Terminated'],
      default: 'Active',
      index: true,
    },
    schedule_id: { type: Schema.Types.ObjectId, ref: 'WorkingSchedule', default: null },
    manager_id: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
  },
  { timestamps: true }
);

EmployeeSchema.index(
  { biometric_id: 1 },
  {
    unique: true,
    partialFilterExpression: { biometric_id: { $type: 'string' } },
  }
);

export const Employee: Model<IEmployee> =
  mongoose.models.Employee || mongoose.model<IEmployee>('Employee', EmployeeSchema);
