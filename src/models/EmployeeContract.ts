import mongoose, { Schema, Document, Model } from 'mongoose';

export type ContractStatus = 'Active' | 'Expired' | 'Cancelled';

export interface IEmployeeContract extends Document {
  employee_id: mongoose.Types.ObjectId;
  structure_id: mongoose.Types.ObjectId;
  basic_salary: number;
  start_date: Date;
  end_date?: Date | null;
  status: ContractStatus;
  bank_name?: string;
  bank_account_no?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeContractSchema = new Schema<IEmployeeContract>(
  {
    employee_id: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    structure_id: {
      type: Schema.Types.ObjectId,
      ref: 'SalaryStructure',
      required: true,
      index: true,
    },
    basic_salary: { type: Number, required: true, min: 0 },
    start_date: { type: Date, required: true },
    end_date: { type: Date, default: null },
    status: {
      type: String,
      enum: ['Active', 'Expired', 'Cancelled'],
      default: 'Active',
      index: true,
    },
    bank_name: { type: String, default: '', trim: true },
    bank_account_no: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

export const EmployeeContract: Model<IEmployeeContract> =
  mongoose.models.EmployeeContract ||
  mongoose.model<IEmployeeContract>('EmployeeContract', EmployeeContractSchema);

