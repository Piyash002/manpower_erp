import mongoose, { Schema, Document, Model } from 'mongoose';

export type VendorBillStatus = 'Open' | 'PartiallyPaid' | 'Paid' | 'Reversed';
export type VendorBillKind = 'Expense' | 'AssetPurchase';

export interface IVendorBillItem {
  description: string;
  amountPaisa: number;
}

export interface IVendorBill extends Document {
  billNo: string;
  vendorName: string;
  billDate: Date;
  dueDate: Date;
  items: IVendorBillItem[];
  description: string;
  totalPaisa: number;
  paidPaisa: number;
  duePaisa: number;
  status: VendorBillStatus;
  accrualEntryId?: mongoose.Types.ObjectId | null;
  reversalEntryId?: mongoose.Types.ObjectId | null;
  kind: VendorBillKind;
  expenseId?: mongoose.Types.ObjectId | null;
  assetId?: mongoose.Types.ObjectId | null;
  expenseAccountCode?: string;
  attachmentUrl?: string;
  branch: string;
  createdBy: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VendorBillItemSchema = new Schema<IVendorBillItem>(
  {
    description: { type: String, required: true, trim: true },
    amountPaisa: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const VendorBillSchema = new Schema<IVendorBill>(
  {
    billNo: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    vendorName: { type: String, required: true, trim: true, index: true },
    billDate: { type: Date, required: true, index: true },
    dueDate: { type: Date, required: true, index: true },
    items: { type: [VendorBillItemSchema], default: [] },
    description: { type: String, default: '', trim: true },
    totalPaisa: { type: Number, required: true, min: 1 },
    paidPaisa: { type: Number, required: true, default: 0, min: 0 },
    duePaisa: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['Open', 'PartiallyPaid', 'Paid', 'Reversed'],
      default: 'Open',
      required: true,
      index: true,
    },
    accrualEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    reversalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    kind: {
      type: String,
      enum: ['Expense', 'AssetPurchase'],
      default: 'Expense',
      required: true,
    },
    expenseId: { type: Schema.Types.ObjectId, ref: 'ExpenseRecord', default: null },
    assetId: { type: Schema.Types.ObjectId, ref: 'FixedAsset', default: null },
    expenseAccountCode: { type: String, default: '5299', uppercase: true, trim: true },
    attachmentUrl: { type: String, default: '', trim: true },
    branch: { type: String, default: 'Main', trim: true },
    createdBy: { type: String, default: 'System' },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

VendorBillSchema.pre('validate', function () {
  if (
    !Number.isInteger(this.totalPaisa) ||
    !Number.isInteger(this.paidPaisa) ||
    !Number.isInteger(this.duePaisa)
  ) {
    throw new Error('VendorBill monetary values must be integer paisa.');
  }
  if (this.paidPaisa > this.totalPaisa) {
    throw new Error('Paid amount cannot exceed total bill amount.');
  }
});

export const VendorBill: Model<IVendorBill> =
  mongoose.models.VendorBill || mongoose.model<IVendorBill>('VendorBill', VendorBillSchema);

