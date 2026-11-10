import mongoose, { Schema, Document, Model } from 'mongoose';
import type { AppRole } from '@/lib/jwt';

export interface IUser extends Document {
  name: string;
  username: string;
  passwordHash: string;
  role: AppRole;
  active: boolean;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil?: Date | null;
  lastLogin?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['Admin', 'HR', 'Manager', 'Employee', 'Counselor', 'Accountant', 'Viewer'],
      default: 'Viewer',
      required: true,
    },
    active: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLogin: { type: Date, default: null },
  },
  { timestamps: true }
);

export const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

