import mongoose, { Document, Schema, Types } from "mongoose";

// One paper in an exam's date sheet: a subject on a date, from start to end time.
export interface IExamPaper {
  subject?: Types.ObjectId;
  subjectName: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  note?: string;
}

// The date sheet for one exam (from the Exams module). Kept in its own collection
// so the Exams feature is untouched — this just hangs a schedule off an exam id.
export interface IExamTimetable extends Document {
  exam: Types.ObjectId;
  session: string;
  class: string;
  examName: string; // snapshot of the exam name
  papers: IExamPaper[];
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const paperSchema = new Schema<IExamPaper>(
  {
    subject: { type: Schema.Types.ObjectId, ref: "Subject" },
    subjectName: { type: String, default: "" },
    date: { type: String, default: "" },
    startTime: { type: String, default: "" },
    endTime: { type: String, default: "" },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const examTimetableSchema = new Schema<IExamTimetable>(
  {
    exam: { type: Schema.Types.ObjectId, ref: "Exam", required: true, unique: true },
    session: { type: String, required: true },
    class: { type: String, required: true },
    examName: { type: String, default: "" },
    papers: { type: [paperSchema], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const ExamTimetable = mongoose.model<IExamTimetable>(
  "ExamTimetable",
  examTimetableSchema
);
