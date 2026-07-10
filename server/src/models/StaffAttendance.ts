import mongoose, { Document, Schema, Types } from "mongoose";

// Attendance for employees — both teachers (Teacher model) and non-teaching
// staff (Staff model). `personKind` says which collection `person` refers to.
export type StaffAttendanceStatus = "present" | "absent";
export type PersonKind = "teacher" | "staff";

export interface IStaffAttendance extends Document {
  person: Types.ObjectId;
  personKind: PersonKind;
  dateKey: string; // "YYYY-MM-DD"
  date: Date;
  status: StaffAttendanceStatus;
  markedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IStaffAttendance>(
  {
    person: { type: Schema.Types.ObjectId, required: true },
    personKind: { type: String, enum: ["teacher", "staff"], required: true },
    dateKey: { type: String, required: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ["present", "absent"], required: true },
    markedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// One record per person per day (upsert on mark — re-marking updates).
schema.index({ person: 1, dateKey: 1 }, { unique: true });
schema.index({ dateKey: 1 });

export const StaffAttendance = mongoose.model<IStaffAttendance>("StaffAttendance", schema);
