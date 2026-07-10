import mongoose, { Document, Schema } from "mongoose";

// Non-teaching employees (teachers live in the Teacher model). Categories cover
// the common school roles; "Other" catches anything else.
export const STAFF_CATEGORIES = [
  "Driver",
  "Conductor",
  "Peon",
  "Guard",
  "Clerk",
  "Cook",
  "Operator",
  "Gardener",
  "Cleaner",
  "Accountant",
  "Librarian",
  "Nurse",
  "Other",
] as const;

export interface IStaff extends Document {
  name: string;
  category: string; // one of STAFF_CATEGORIES
  designation?: string; // free text, e.g. "Bus 3 Driver"
  phone?: string;
  gender?: string;
  employeeCode?: string;
  joiningDate?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const staffSchema = new Schema<IStaff>(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, default: "Other", trim: true },
    designation: { type: String, trim: true },
    phone: { type: String, trim: true },
    gender: { type: String, enum: ["Male", "Female", "Other", ""], default: "" },
    employeeCode: { type: String, trim: true },
    joiningDate: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Staff = mongoose.model<IStaff>("Staff", staffSchema);
