import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IInstallment extends Document {
  student_id: mongoose.Types.ObjectId;
  installment_no: number;
  due_date: Date;
  amount: number;
  paid_amount: number;
  paid_on?: Date | null;
  status: 'Paid' | 'Partial' | 'Pending' | 'Overdue';
  createdAt: Date;
  updatedAt: Date;
}

const InstallmentSchema = new Schema<IInstallment>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    installment_no: { type: Number, required: true },
    due_date: { type: Date, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    paid_amount: { type: Number, default: 0, min: 0 },
    paid_on: { type: Date, default: null },
    status: {
      type: String,
      enum: ['Paid', 'Partial', 'Pending', 'Overdue'],
      default: 'Pending',
      index: true,
    },
  },
  { timestamps: true }
);

InstallmentSchema.index({ student_id: 1, installment_no: 1 });

export const Installment: Model<IInstallment> =
  mongoose.models.Installment || mongoose.model<IInstallment>('Installment', InstallmentSchema);

