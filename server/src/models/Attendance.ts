import mongoose, { Document, Schema, Types } from "mongoose";

export type AttendanceStatus = "present" | "absent";

export interface IAttendance extends Document {
  student: Types.ObjectId;
  class: string; // snapshot for fast class-day queries
  section: string;
  session: string;
  dateKey: string; // "YYYY-MM-DD" — day granularity, timezone-safe
  date: Date; // start-of-day, for sorting/ranges
  status: AttendanceStatus;
  markedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceSchema = new Schema<IAttendance>(
  {
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    class: { type: String, required: true },
    section: { type: String, default: "" },
    session: { type: String, required: true },
    dateKey: { type: String, required: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ["present", "absent"], required: true },
    markedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// One record per student per day (upsert on mark — re-marking updates, never duplicates).
attendanceSchema.index({ student: 1, dateKey: 1 }, { unique: true });
// Fast "roster for this class+section on this day" lookups.
attendanceSchema.index({ class: 1, section: 1, session: 1, dateKey: 1 });

export const Attendance = mongoose.model<IAttendance>("Attendance", attendanceSchema);
