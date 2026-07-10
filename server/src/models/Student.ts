import mongoose, { Document, Schema, Types } from "mongoose";
import { CURRENT_SESSION } from "../utils/academics";

// A snapshot of where a student sat in a past academic session. Promotion
// pushes the current position here before advancing, so history is preserved.
export interface IEnrollment {
  session: string;
  class: string;
  section?: string;
}

export interface IStudent extends Document {
  admissionNo: string;
  name: string;
  dateOfAdmission: Date; // when the student joined the school
  session: string; // current academic session, e.g. "2026-27"
  class: string;
  section?: string;
  rollNo?: string;
  gender?: string;
  category: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  parent?: Types.ObjectId; // linked parent login (User), optional
  optedServices: string[]; // optional fee heads this student uses, e.g. ["Transport"]
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

const studentSchema = new Schema<IStudent>(
  {
    admissionNo: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    dateOfAdmission: { type: Date, default: Date.now },
    session: { type: String, default: CURRENT_SESSION, trim: true },
    class: { type: String, required: true, trim: true },
    section: { type: String, trim: true },
    rollNo: { type: String, trim: true },
    gender: { type: String, enum: ["Male", "Female", "Other", ""], default: "" },
    category: { type: String, default: "General", trim: true },
    parentName: { type: String, trim: true },
    parentPhone: { type: String, trim: true },
    parentEmail: { type: String, trim: true, lowercase: true },
    parent: { type: Schema.Types.ObjectId, ref: "User" },
    optedServices: { type: [String], default: [] },
    enrollmentHistory: { type: [enrollmentSchema], default: [] },
    status: { type: String, enum: ["active", "left", "inactive"], default: "active" },
    exitDate: { type: Date },
    exitReason: { type: String, trim: true },
  },
  { timestamps: true }
);

export const Student = mongoose.model<IStudent>("Student", studentSchema);
