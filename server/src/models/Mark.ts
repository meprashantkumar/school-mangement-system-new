import mongoose, { Document, Schema, Types } from "mongoose";

// A single student's mark in one subject of one exam. `absent` (AB) is distinct from
// a real 0. class/section/session are snapshotted for fast per-section listing.
// Unique on (exam, student, subject) so re-entry upserts — never duplicates.
export interface IMark extends Document {
  exam: Types.ObjectId;
  student: Types.ObjectId;
  subject: Types.ObjectId;
  marksObtained?: number; // undefined when absent
  absent: boolean;
  class: string;
  section: string;
  session: string;
  markedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const markSchema = new Schema<IMark>(
  {
    exam: { type: Schema.Types.ObjectId, ref: "Exam", required: true },
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    subject: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    marksObtained: { type: Number, min: 0 },
    absent: { type: Boolean, default: false },
    class: { type: String, default: "" },
    section: { type: String, default: "" },
    session: { type: String, default: "" },
    markedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

markSchema.index({ exam: 1, student: 1, subject: 1 }, { unique: true });
markSchema.index({ exam: 1, section: 1 });

export const Mark = mongoose.model<IMark>("Mark", markSchema);
