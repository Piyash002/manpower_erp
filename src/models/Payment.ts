import mongoose, { Schema, Document, Model } from 'mongoose';

export type PaymentMethod =
  | 'Cash'
  | 'bKash'
  | 'Nagad'
  | 'Rocket'
  | 'Bank transfer'
  | 'Cheque'
  | 'Card';

export interface IPayment extends Document {
  receipt_no: string;
  student_id: mongoose.Types.ObjectId;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  payment_date: Date;
  note?: string;
  created_by: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    receipt_no: { type: String, required: true, unique: true, index: true },
    student_id: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    method: {
      type: String,
      enum: ['Cash', 'bKash', 'Nagad', 'Rocket', 'Bank transfer', 'Cheque', 'Card'],
      required: true,
    },
    reference: { type: String, default: '' },
    payment_date: { type: Date, required: true, default: Date.now },
    note: { type: String, default: '' },
    created_by: { type: String, required: true },
  },
  { timestamps: true }
);

export const Payment: Model<IPayment> =
  mongoose.models.Payment || mongoose.model<IPayment>('Payment', PaymentSchema);

