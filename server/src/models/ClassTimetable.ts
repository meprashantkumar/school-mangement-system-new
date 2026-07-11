import mongoose, { Document, Schema, Types } from "mongoose";
import { CURRENT_SESSION } from "../utils/academics";

// One filled cell of a class's weekly timetable: on this day + period, this
// subject is taught by this teacher. Subject/teacher names are snapshotted so the
// grid still reads correctly even if a subject or teacher is later renamed.
export interface ITimetableSlot {
  day: number; // ISO weekday 1..7 (Mon..Sun)
  period: number;
  subject?: Types.ObjectId;
  subjectName: string;
  teacher?: Types.ObjectId;
  teacherName: string;
  room?: string;
}

export interface IClassTimetable extends Document {
  class: string;
  section: string;
  session: string;
  slots: ITimetableSlot[];
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const slotSchema = new Schema<ITimetableSlot>(
  {
    day: { type: Number, required: true },
    period: { type: Number, required: true },
    subject: { type: Schema.Types.ObjectId, ref: "Subject" },
    subjectName: { type: String, default: "" },
    teacher: { type: Schema.Types.ObjectId, ref: "Teacher" },
    teacherName: { type: String, default: "" },
    room: { type: String, default: "" },
  },
  { _id: false }
);

const classTimetableSchema = new Schema<IClassTimetable>(
  {
    class: { type: String, required: true, trim: true },
    section: { type: String, required: true, trim: true },
    session: { type: String, default: CURRENT_SESSION, trim: true },
    slots: { type: [slotSchema], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// One timetable per class + section + session.
classTimetableSchema.index({ class: 1, section: 1, session: 1 }, { unique: true });

export const ClassTimetable = mongoose.model<IClassTimetable>(
  "ClassTimetable",
  classTimetableSchema
);
