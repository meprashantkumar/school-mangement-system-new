import mongoose, { Document, Schema, Types } from "mongoose";
import { CURRENT_SESSION } from "../utils/academics";

// A public admission application. Anyone can submit one from the website; staff
// review it (approve → becomes a real Student, or reject). Kept separate from the
// Student model so applications never touch the enrolled-student data until an
// admin approves.
export type AdmissionStatus = "pending" | "approved" | "rejected";

export interface IAdmission extends Document {
  applicationNo: string;
  studentName: string;
  gender?: string;
  dateOfBirth?: Date;
  applyingForClass: string;
  session: string;
  previousSchool?: string;
  category: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  address?: string;
  message?: string; // applicant's optional note
  status: AdmissionStatus;
  reviewNote?: string; // staff note / rejection reason
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  convertedStudent?: Types.ObjectId; // the Student created on approval
  createdAt: Date;
  updatedAt: Date;
}

const admissionSchema = new Schema<IAdmission>(
  {
    applicationNo: { type: String, required: true, unique: true, trim: true },
    studentName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ["Male", "Female", "Other", ""], default: "" },
    dateOfBirth: { type: Date },
    applyingForClass: { type: String, required: true, trim: true },
    session: { type: String, default: CURRENT_SESSION, trim: true },
    previousSchool: { type: String, trim: true },
    category: { type: String, default: "General", trim: true },
    parentName: { type: String, trim: true },
    parentPhone: { type: String, trim: true },
    parentEmail: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    message: { type: String, trim: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    reviewNote: { type: String, trim: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    convertedStudent: { type: Schema.Types.ObjectId, ref: "Student" },
  },
  { timestamps: true }
);

admissionSchema.index({ status: 1, createdAt: -1 });

export const Admission = mongoose.model<IAdmission>("Admission", admissionSchema);
