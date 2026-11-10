import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICounter extends Document {
  name: string;
  seq: number;
}

const CounterSchema = new Schema<ICounter>({
  name: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

export const Counter: Model<ICounter> =
  mongoose.models.Counter || mongoose.model<ICounter>('Counter', CounterSchema);

/**
 * Get the next sequential number formatted
 */
export async function getNextSequence(name: string): Promise<number> {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return counter ? counter.seq : 1;
}

/**
 * Generate Student ID format ST-YYYY-0001
 */
export async function generateStudentId(): Promise<string> {
  const year = new Date().getFullYear();
  const key = `student_id_${year}`;
  const seq = await getNextSequence(key);
  const padded = String(seq).padStart(4, '0');
  return `ST-${year}-${padded}`;
}

/**
 * Generate Money Receipt number format MR-00001
 */
export async function generateReceiptNo(): Promise<string> {
  const key = 'money_receipt_no';
  const seq = await getNextSequence(key);
  const padded = String(seq).padStart(5, '0');
  return `MR-${padded}`;
}

/**
 * Generate Employee ID format EMP-0001
 */
export async function generateEmployeeId(): Promise<string> {
  const key = 'employee_id_seq';
  const seq = await getNextSequence(key);
  const padded = String(seq).padStart(4, '0');
  return `EMP-${padded}`;
}
