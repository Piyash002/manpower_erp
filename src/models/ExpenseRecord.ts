import mongoose, { Schema, Document, Model } from 'mongoose';

export type ExpensePaymentStatus = 'Paid' | 'Unpaid' | 'Prepaid';
export type ExpensePaymentMethod = 'Cash' | 'Bank' | 'Cheque' | 'bKash' | 'Nagad' | 'None';

export interface IExpenseRecord extends Document {
  expenseNo: string;
  date: Date;
  categoryId: mongoose.Types.ObjectId;
  categoryName: string;
  accountCode: string;
  amountPaisa: number;
  payeeName: string;
  description: string;
  paymentStatus: ExpensePaymentStatus;
  paymentMethod: ExpensePaymentMethod;
  reference: string;
  attachmentUrl: string;
  branch: string;
  department: string;
  entryId?: mongoose.Types.ObjectId | null;
  reversalEntryId?: mongoose.Types.ObjectId | null;
  vendorBillId?: mongoose.Types.ObjectId | null;
  status: 'Posted' | 'Reversed';
  createdBy: string;
  reversedBy?: string;
  reversedAt?: Date | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ExpenseRecordSchema = new Schema<IExpenseRecord>(
  {
    expenseNo: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    date: { type: Date, required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true, index: true },
    categoryName: { type: String, required: true, trim: true },
    accountCode: { type: String, required: true, uppercase: true, trim: true },
    amountPaisa: { type: Number, required: true, min: 1 },
    payeeName: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    paymentStatus: {
      type: String,
      enum: ['Paid', 'Unpaid', 'Prepaid'],
      required: true,
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'Bank', 'Cheque', 'bKash', 'Nagad', 'None'],
      default: 'Cash',
    },
    reference: { type: String, default: '', trim: true },
    attachmentUrl: { type: String, default: '', trim: true },
    branch: { type: String, default: 'Main', trim: true },
    department: { type: String, default: 'General', trim: true },
    entryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    reversalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    vendorBillId: { type: Schema.Types.ObjectId, ref: 'VendorBill', default: null },
    status: {
      type: String,
      enum: ['Posted', 'Reversed'],
      default: 'Posted',
      required: true,
      index: true,
    },
    createdBy: { type: String, default: 'System' },
    reversedBy: { type: String, default: '' },
    reversedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

ExpenseRecordSchema.pre('validate', function () {
  if (!Number.isInteger(this.amountPaisa) || this.amountPaisa <= 0) {
    throw new Error('Expense amountPaisa must be a positive integer.');
  }
});

export const ExpenseRecord: Model<IExpenseRecord> =
  mongoose.models.ExpenseRecord ||
  mongoose.model<IExpenseRecord>('ExpenseRecord', ExpenseRecordSchema);

