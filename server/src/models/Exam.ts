import mongoose, { Document, Schema, Types } from "mongoose";
import { CURRENT_SESSION } from "../utils/academics";

// One subject line inside an exam. The subject name + max/pass marks are snapshotted
// at definition time so results stay stable even if the master subject changes.
export interface IExamSubject {
  subject: Types.ObjectId;
  name: string;
  maxMarks: number;
  passMarks: number;
}

// An examination defined once per (session, class) — shared across all its sections
// so the cross-section topper is computed on the same subjects + max marks. Each
// section's class-teacher enters marks for their own students under this one exam.
export interface IExam extends Document {
  name: string; // e.g. "Half-Yearly Examination"
  type: string; // unit | halfyearly | annual | other  (drives the default weight)
  session: string;
  class: string;
  weight: number; // relative weight in the weighted overall/final ranking
  subjects: IExamSubject[];
  published: boolean; // parents only see results once an admin publishes
  publishedAt?: Date;
  publishedBy?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const examSubjectSchema = new Schema<IExamSubject>(
  {
    subject: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    name: { type: String, required: true },
    maxMarks: { type: Number, required: true, min: 1 },
    passMarks: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const examSchema = new Schema<IExam>(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, default: "other" },
    session: { type: String, default: CURRENT_SESSION },
    class: { type: String, required: true },
    weight: { type: Number, default: 10, min: 0 },
    subjects: { type: [examSubjectSchema], default: [] },
    published: { type: Boolean, default: false },
    publishedAt: { type: Date },
    publishedBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// One exam per class per session per name (so both section teachers share it).
examSchema.index({ session: 1, class: 1, name: 1 }, { unique: true });

export const Exam = mongoose.model<IExam>("Exam", examSchema);
