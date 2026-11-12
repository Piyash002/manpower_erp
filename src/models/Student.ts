import mongoose, { Schema, Document, Model } from 'mongoose';

export type StudentStatus = 'Active' | 'Passed' | 'Failed' | 'Dropped';

export interface IFeeSnapshot {
  admission_fee: number;
  course_fee: number;
  visa_cost: number;
  govt_fee: number;
  discount: number;
  total_payable: number;
}

export interface IEducationQualification {
  level: string; // 'SSC' | 'HSC' | 'Honours' | 'Masters' | 'Diploma' | 'Other'
  board_or_university?: string;
  passing_year?: string;
  result_gpa?: string;
  certificate_url?: string;
}

export interface IStudent extends Document {
  student_no: string;

  // Identity
  name: string;
  father_name: string;
  mother_name: string;
  date_of_birth: Date;
  gender: 'Male' | 'Female' | 'Other';
  blood_group: string;
  nid_or_birth_cert: string;
  religion: string;
  marital_status: string;
  photo_url?: string;
  education_qualifications?: IEducationQualification[];

  // Contact
  mobile: string;
  email?: string;
  emergency_contact_name: string;
  emergency_contact_relation: string;
  emergency_contact_phone: string;
  present_address: string;
  permanent_address: string;

  // Passport
  passport_no: string;
  passport_issue_date?: Date;
  passport_expiry_date?: Date;

  // Previous Overseas Work
  has_previous_overseas_work: boolean;
  overseas_country?: string;
  overseas_from_year?: number;
  overseas_to_year?: number;
  overseas_trade?: string;
  overseas_passport_no?: string;
  overseas_passport_url?: string;
  overseas_visa_type?: string;
  overseas_visa_no?: string;
  overseas_visa_url?: string;
  overseas_visa_expiry?: Date;
  overseas_reason_for_return?: string;

  // Training & Destination
  trade_id: mongoose.Types.ObjectId;
  trade_name: string;
  batch: string;
  session: string;
  admission_date: Date;
  destination_country: string;
  destination_contract_years: number;
  status: StudentStatus;

  // Fee Snapshot (Fixed forever once admitted)
  fee_snapshot: IFeeSnapshot;

  // Cached Financial Totals
  total_paid: number;
  total_due: number;

  // HRM Referral Tracking
  referred_by_agent?: mongoose.Types.ObjectId | null;

  created_by: string;
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<IStudent>(
  {
    student_no: { type: String, required: true, unique: true, index: true },

    // Identity
    name: { type: String, required: true, trim: true, index: true },
    father_name: { type: String, required: true, trim: true },
    mother_name: { type: String, required: true, trim: true },
    date_of_birth: { type: Date, required: true },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
    blood_group: { type: String, default: 'Unknown' },
    nid_or_birth_cert: { type: String, required: true, unique: true, trim: true, index: true },
    religion: { type: String, default: 'Islam' },
    marital_status: { type: String, default: 'Single' },
    photo_url: { type: String, default: '' },
    education_qualifications: {
      type: [
        {
          level: { type: String, required: true, trim: true },
          board_or_university: { type: String, default: '', trim: true },
          passing_year: { type: String, default: '', trim: true },
          result_gpa: { type: String, default: '', trim: true },
          certificate_url: { type: String, default: '', trim: true },
        },
      ],
      default: [],
    },

    // Contact
    mobile: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true },
    emergency_contact_name: { type: String, required: true },
    emergency_contact_relation: { type: String, required: true },
    emergency_contact_phone: { type: String, required: true },
    present_address: { type: String, required: true },
    permanent_address: { type: String, required: true },

    // Passport
    passport_no: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
    passport_issue_date: { type: Date },
    passport_expiry_date: { type: Date, index: true },

    // Previous Overseas Work
    has_previous_overseas_work: { type: Boolean, default: false },
    overseas_country: { type: String, default: '' },
    overseas_from_year: { type: Number },
    overseas_to_year: { type: Number },
    overseas_trade: { type: String, default: '' },
    overseas_passport_no: { type: String, default: '' },
    overseas_passport_url: { type: String, default: '' },
    overseas_visa_type: { type: String, default: '' },
    overseas_visa_no: { type: String, default: '' },
    overseas_visa_url: { type: String, default: '' },
    overseas_visa_expiry: { type: Date },
    overseas_reason_for_return: { type: String, default: '' },

    // Training & Destination
    trade_id: { type: Schema.Types.ObjectId, ref: 'Trade', required: true, index: true },
    trade_name: { type: String, required: true, index: true },
    batch: { type: String, required: true, trim: true, index: true },
    session: { type: String, required: true, trim: true },
    admission_date: { type: Date, required: true, default: Date.now, index: true },
    destination_country: { type: String, default: 'Not decided yet', index: true },
    destination_contract_years: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Active', 'Passed', 'Failed', 'Dropped'],
      default: 'Active',
      index: true,
    },

    // Fee Snapshot
    fee_snapshot: {
      admission_fee: { type: Number, required: true, min: 0 },
      course_fee: { type: Number, required: true, min: 0 },
      visa_cost: { type: Number, required: true, min: 0 },
      govt_fee: { type: Number, required: true, min: 0 },
      discount: { type: Number, required: true, min: 0, default: 0 },
      total_payable: { type: Number, required: true, min: 0 },
    },

    // Cached payment summary
    total_paid: { type: Number, default: 0, min: 0 },
    total_due: { type: Number, default: 0, min: 0 },

    // HRM Referral Agent Reference
    referred_by_agent: { type: Schema.Types.ObjectId, ref: 'Employee', default: null, index: true },

    created_by: { type: String, required: true },
  },
  { timestamps: true }
);

export const Student: Model<IStudent> =
  mongoose.models.Student || mongoose.model<IStudent>('Student', StudentSchema);

