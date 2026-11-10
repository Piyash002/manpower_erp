import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITrade extends Document {
  name: string;
  course_days: number;
  admission_fee: number;
  course_fee: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TradeSchema = new Schema<ITrade>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    course_days: { type: Number, required: true, min: 1 },
    admission_fee: { type: Number, required: true, min: 0 },
    course_fee: { type: Number, required: true, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Trade: Model<ITrade> =
  mongoose.models.Trade || mongoose.model<ITrade>('Trade', TradeSchema);

