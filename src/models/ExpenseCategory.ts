import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IExpenseCategory extends Document {
  name: string;
  accountCode: string;
  systemTag?: string;
  description?: string;
  active: boolean;
  isDeleted: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const ExpenseCategorySchema = new Schema<IExpenseCategory>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    accountCode: { type: String, required: true, uppercase: true, trim: true, index: true },
    systemTag: { type: String, default: '', uppercase: true, trim: true },
    description: { type: String, default: '', trim: true },
    active: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: String, default: 'System' },
  },
  { timestamps: true }
);

export const ExpenseCategory: Model<IExpenseCategory> =
  mongoose.models.ExpenseCategory ||
  mongoose.model<IExpenseCategory>('ExpenseCategory', ExpenseCategorySchema);

