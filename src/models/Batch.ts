import mongoose, { Schema, Document, Model } from 'mongoose';

export type BatchStatus = 'Upcoming' | 'In Training' | 'Completed' | 'Archived';

export interface IBatch extends Document {
  name: string;
  batch_code: string;
  trade_id: mongoose.Types.ObjectId;
  trade_name: string;
  start_date: Date;
  end_date: Date;
  exam_date?: Date | null;
  instructor_id?: mongoose.Types.ObjectId | null;
  instructor?: string;
  capacity: number;
  status: BatchStatus;
  notes?: string;
  created_by: string;
  createdAt: Date;
  updatedAt: Date;
}

const BatchSchema = new Schema<IBatch>(
  {
    name: { type: String, required: true, trim: true },
    batch_code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    trade_id: { type: Schema.Types.ObjectId, ref: 'Trade', required: true, index: true },
    trade_name: { type: String, required: true, trim: true },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    exam_date: { type: Date, default: null },
    instructor_id: { type: Schema.Types.ObjectId, ref: 'Employee', default: null, index: true },
    instructor: { type: String, default: '', trim: true },
    capacity: { type: Number, default: 30, min: 1 },
    status: {
      type: String,
      enum: ['Upcoming', 'In Training', 'Completed', 'Archived'],
      default: 'Upcoming',
      index: true,
    },
    notes: { type: String, default: '', trim: true },
    created_by: { type: String, default: 'System' },
  },
  { timestamps: true }
);

export const Batch: Model<IBatch> =
  mongoose.models.Batch || mongoose.model<IBatch>('Batch', BatchSchema);

