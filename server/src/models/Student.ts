import mongoose, { Document, Schema, Types } from "mongoose";
import { CURRENT_SESSION } from "../utils/academics";
import { normalizePhone } from "../utils/phone";

// A snapshot of where a student sat in a past academic session. Promotion
// pushes the current position here before advancing, so history is preserved.
export interface IEnrollment {
  session: string;
  class: string;
  section?: string;
}

// Per-student override for an optional service's amount (e.g. a longer bus route
// costs this student more than the class's base Transport fee). When absent for an
// opted service, invoice generation falls back to the class fee-structure amount.
export interface IServiceFee {
  name: string;
  amount: number;
}

export interface IStudent extends Document {
  admissionNo: string;
  name: string;
  dateOfAdmission: Date; // when the student joined the school
  dateOfBirth?: Date; // student's date of birth (optional)
  session: string; // current academic session, e.g. "2026-27"
  class: string;
  section?: string;
  rollNo?: string;
  gender?: string;
  category: string;
  parentName?: string;
  motherName?: string; // mother's name (optional)
  parentPhone?: string;
  parentEmail?: string;
  address?: string; // residential address (optional)
  parent?: Types.ObjectId; // linked parent login (User), optional
  optedServices: string[]; // optional fee heads this student uses, e.g. ["Transport"]
  serviceFees: IServiceFee[]; // per-student amount overrides for opted services
  creditBalance: number; // advance / overpayment held for the student, applied to future dues
  enrollmentHistory: IEnrollment[]; // prior (session, class, section) snapshots
  status: "active" | "left" | "inactive";
  exitDate?: Date; // when the student left school (optional)
  exitReason?: string; // why they left (optional)
  createdAt: Date;
  updatedAt: Date;
}

const enrollmentSchema = new Schema<IEnrollment>(
  {
    session: { type: String, required: true },
    class: { type: String, required: true },
    section: { type: String },
  },
  { _id: false }
);

const serviceFeeSchema = new Schema<IServiceFee>(
  {
    name: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const studentSchema = new Schema<IStudent>(
  {
    admissionNo: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    dateOfAdmission: { type: Date, default: Date.now },
    dateOfBirth: { type: Date },
    session: { type: String, default: CURRENT_SESSION, trim: true },
    class: { type: String, required: true, trim: true },
    section: { type: String, trim: true },
    rollNo: { type: String, trim: true },
    gender: { type: String, enum: ["Male", "Female", "Other", ""], default: "" },
    category: { type: String, default: "General", trim: true },
    parentName: { type: String, trim: true },
    motherName: { type: String, trim: true },
    parentPhone: { type: String, trim: true },
    parentEmail: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    parent: { type: Schema.Types.ObjectId, ref: "User" },
    optedServices: { type: [String], default: [] },
    serviceFees: { type: [serviceFeeSchema], default: [] },
    creditBalance: { type: Number, default: 0, min: 0 },
    enrollmentHistory: { type: [enrollmentSchema], default: [] },
    status: { type: String, enum: ["active", "left", "inactive"], default: "active" },
    exitDate: { type: Date },
    exitReason: { type: String, trim: true },
  },
  { timestamps: true }
);

// Keep overrides tidy: only retain amounts for services the student still uses,
// so a dropped service can't leave a stale custom fee behind.
studentSchema.pre("save", function (next) {
  if (this.serviceFees?.length) {
    const opted = new Set(this.optedServices || []);
    this.serviceFees = this.serviceFees.filter((f) => opted.has(f.name));
  }
  // The parent's mobile number doubles as their login ID, so store it in one
  // canonical form ("+91 98765-43210" and "9876543210" must match).
  if (this.parentPhone) {
    this.parentPhone = normalizePhone(this.parentPhone) || this.parentPhone;
  }
  next();
});

export const Student = mongoose.model<IStudent>("Student", studentSchema);
