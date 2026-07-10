import mongoose, { Document, Schema } from "mongoose";

// A subject taught in the school (admin master list). Each subject declares which
// classes it applies to, so a Class 2 marksheet never offers Physics. Exams take a
// snapshot of the name + max marks, so renaming/deleting a subject never corrupts
// past results.
export interface ISubject extends Document {
  name: string;
  code?: string;
  applicableClasses: string[]; // e.g. ["Nursery", "LKG"] or ["9", "10"]
  order: number; // display order on the marksheet
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const subjectSchema = new Schema<ISubject>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String, trim: true },
    applicableClasses: { type: [String], default: [] },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Subject = mongoose.model<ISubject>("Subject", subjectSchema);
