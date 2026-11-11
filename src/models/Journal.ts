import mongoose, { Schema, Document, Model } from 'mongoose';

export type JournalTypeCode = 'JV' | 'RV' | 'PV' | 'CV';

export interface IJournal extends Document {
  code: JournalTypeCode;
  name: string;
  description?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const JournalSchema = new Schema<IJournal>(
  {
    code: {
      type: String,
      enum: ['JV', 'RV', 'PV', 'CV'],
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Journal: Model<IJournal> =
  mongoose.models.Journal || mongoose.model<IJournal>('Journal', JournalSchema);

