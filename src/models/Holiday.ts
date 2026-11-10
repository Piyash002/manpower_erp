import mongoose, { Schema, Document, Model } from 'mongoose';

export type HolidayType = 'Government' | 'Company';

export interface IHoliday extends Document {
  title: string;
  date: Date; // Normalized UTC midnight for YYYY-MM-DD
  type: HolidayType;
  description?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const HolidaySchema = new Schema<IHoliday>(
  {
    title: { type: String, required: true, trim: true },
    date: { type: Date, required: true, index: true },
    type: {
      type: String,
      enum: ['Government', 'Company'],
      default: 'Government',
      required: true,
    },
    description: { type: String, default: '', trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

HolidaySchema.index({ date: 1, title: 1 }, { unique: true });

export const Holiday: Model<IHoliday> =
  mongoose.models.Holiday || mongoose.model<IHoliday>('Holiday', HolidaySchema);

