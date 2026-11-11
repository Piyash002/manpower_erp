import mongoose, { Schema, Document, Model } from 'mongoose';

export type EmployeeDepartment =
  | 'Visa'
  | 'Training'
  | 'Accounts'
  | 'Agent'
  | 'Counseling'
  | 'Administration'
  | 'Other'
  | string;

export type EmployeeStatus = 'Active' | 'On Leave' | 'Inactive' | 'Resigned' | 'Terminated';
export type EmployeeType = 'Permanent' | 'Contract' | 'Intern' | 'Part-time';
export type GenderType = 'Male' | 'Female' | 'Other' | '';
export type MaritalStatusType = 'Single' | 'Married' | 'Divorced' | 'Widowed' | '';
export type PaymentMethodType = 'Bank' | 'bKash' | 'Nagad' | 'Cash';
export type EmployeeDocCategory = 'NID' | 'CV' | 'Certificate' | 'Appointment' | 'Other';

export interface IEmployeeDocumentItem {
  title: string;
  category: EmployeeDocCategory;
  url: string;
  uploaded_at: Date;
  uploaded_by?: string;
}

export interface IEmployee extends Document {
  userId?: mongoose.Types.ObjectId | null;
  employee_id: string;
  biometric_id?: string | null;
  shift?: string;
  photo_url?: string;
  firstName: string;
  lastName: string;
  father_name?: string;
  mother_name?: string;
  date_of_birth?: Date | null;
  gender?: GenderType;
  nid_number?: string;
  blood_group?: string;
  marital_status?: MaritalStatusType;
  phone: string;
  email?: string;
  present_address?: string;
  permanent_address?: string;
  emergency_contact?: {
    name?: string;
    relation?: string;
    phone?: string;
  };
  department: EmployeeDepartment;
  department_id?: mongoose.Types.ObjectId | null;
  branch?: string;
  designation: string;
  designation_id?: mongoose.Types.ObjectId | null;
  employee_type: EmployeeType;
  basic_salary: number;
  commission_rate: number;
  joining_date?: Date;
  resignation_date?: Date | null;
  status: EmployeeStatus;
  is_deleted: boolean;
  archived_at?: Date | null;
  schedule_id?: mongoose.Types.ObjectId | null;
  manager_id?: mongoose.Types.ObjectId | null;
  payment_method: PaymentMethodType;
  bank_name?: string;
  bank_branch?: string;
  bank_account_no?: string;
  documents: IEmployeeDocumentItem[];
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
    photo_url: { type: String, default: '', trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    father_name: { type: String, default: '', trim: true },
    mother_name: { type: String, default: '', trim: true },
    date_of_birth: { type: Date, default: null },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', ''],
      default: '',
    },
    nid_number: {
      type: String,
      trim: true,
    },
    blood_group: { type: String, default: '', trim: true },
    marital_status: {
      type: String,
      enum: ['Single', 'Married', 'Divorced', 'Widowed', ''],
      default: '',
    },
    phone: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    present_address: { type: String, default: '', trim: true },
    permanent_address: { type: String, default: '', trim: true },
    emergency_contact: {
      name: { type: String, default: '', trim: true },
      relation: { type: String, default: '', trim: true },
      phone: { type: String, default: '', trim: true },
    },
    department: {
      type: String,
      default: 'Counseling',
      required: true,
      trim: true,
      index: true,
    },
    department_id: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
      index: true,
    },
    branch: { type: String, default: 'Main', trim: true },
    designation: { type: String, required: true, trim: true },
    designation_id: {
      type: Schema.Types.ObjectId,
      ref: 'Designation',
      default: null,
      index: true,
    },
    employee_type: {
      type: String,
      enum: ['Permanent', 'Contract', 'Intern', 'Part-time'],
      default: 'Permanent',
      index: true,
    },
    basic_salary: { type: Number, required: true, min: 0, default: 0 },
    commission_rate: { type: Number, min: 0, max: 100, default: 0 },
    joining_date: { type: Date, default: Date.now },
    resignation_date: { type: Date, default: null },
    status: {
      type: String,
      enum: ['Active', 'On Leave', 'Inactive', 'Resigned', 'Terminated'],
      default: 'Active',
      index: true,
    },
    is_deleted: { type: Boolean, default: false, index: true },
    archived_at: { type: Date, default: null },
    schedule_id: { type: Schema.Types.ObjectId, ref: 'WorkingSchedule', default: null },
    manager_id: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    payment_method: {
      type: String,
      enum: ['Bank', 'bKash', 'Nagad', 'Cash'],
      default: 'Bank',
    },
    bank_name: { type: String, default: '', trim: true },
    bank_branch: { type: String, default: '', trim: true },
    bank_account_no: { type: String, default: '', trim: true },
    documents: {
      type: [
        {
          title: { type: String, required: true, trim: true },
          category: {
            type: String,
            enum: ['NID', 'CV', 'Certificate', 'Appointment', 'Other'],
            default: 'Other',
          },
          url: { type: String, required: true, trim: true },
          uploaded_at: { type: Date, default: Date.now },
          uploaded_by: { type: String, default: '' },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

EmployeeSchema.index({ department_id: 1, designation_id: 1, status: 1 });
EmployeeSchema.index({ is_deleted: 1, status: 1 });
EmployeeSchema.index(
  { biometric_id: 1 },
  { unique: true, partialFilterExpression: { biometric_id: { $type: 'string' } } }
);
EmployeeSchema.index(
  { nid_number: 1 },
  { unique: true, partialFilterExpression: { nid_number: { $type: 'string' } } }
);

export const Employee: Model<IEmployee> =
  mongoose.models.Employee || mongoose.model<IEmployee>('Employee', EmployeeSchema);
