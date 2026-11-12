import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IVendorBillPayment extends Document {
  paymentNo: string;
  billId: mongoose.Types.ObjectId;
  paymentDate: Date;
  amountPaisa: number;
  method: 'Cash' | 'Bank' | 'Cheque' | 'bKash' | 'Nagad';
  reference: string;
  bankName?: string;
  chequeNo?: string;
  chequeDate?: Date | null;
  attachmentUrl?: string;
  entryId: mongoose.Types.ObjectId;
  reversalEntryId?: mongoose.Types.ObjectId | null;
  status: 'Posted' | 'Reversed';
  createdBy: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VendorBillPaymentSchema = new Schema<IVendorBillPayment>(
  {
    paymentNo: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    billId: { type: Schema.Types.ObjectId, ref: 'VendorBill', required: true, index: true },
    paymentDate: { type: Date, required: true, index: true },
    amountPaisa: { type: Number, required: true, min: 1 },
    method: {
      type: String,
      enum: ['Cash', 'Bank', 'Cheque', 'bKash', 'Nagad'],
      required: true,
    },
    reference: { type: String, default: '', trim: true },
    bankName: { type: String, default: '', trim: true },
    chequeNo: { type: String, default: '', trim: true },
    chequeDate: { type: Date, default: null },
    attachmentUrl: { type: String, default: '', trim: true },
    entryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', required: true },
    reversalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    status: {
      type: String,
      enum: ['Posted', 'Reversed'],
      default: 'Posted',
      required: true,
      index: true,
    },
    createdBy: { type: String, default: 'System' },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

VendorBillPaymentSchema.pre('validate', function () {
  if (!Number.isInteger(this.amountPaisa) || this.amountPaisa <= 0) {
    throw new Error('Bill payment amountPaisa must be a positive integer.');
  }
});

export const VendorBillPayment: Model<IVendorBillPayment> =
  mongoose.models.VendorBillPayment ||
  mongoose.model<IVendorBillPayment>('VendorBillPayment', VendorBillPaymentSchema);

