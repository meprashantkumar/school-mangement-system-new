import mongoose, { Document, Schema, Types } from "mongoose";

// A school-wide named holiday. Sundays are NOT stored here — they're treated as
// weekly-offs by weekday computation. One holiday per calendar day.
//
// A multi-day break (a summer vacation, say) is stored as one row per day rather
// than as a start/end pair. That is deliberate: the attendance percentage excludes
// holidays by matching a list of dateKeys ($nin in attendance.controller.ts), and
// the roster and the two "you can't mark attendance on a holiday" guards all look a
// single day up by its key. Per-day rows keep every one of those working unchanged.
// `groupId` ties the days back together so a whole break can be removed at once.
export interface IHoliday extends Document {
  dateKey: string; // "YYYY-MM-DD"
  date: Date;
  name: string;
  session: string;
  groupId?: string; // shared by every day of one multi-day break
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const holidaySchema = new Schema<IHoliday>(
  {
    dateKey: { type: String, required: true, unique: true },
    date: { type: Date, required: true },
    name: { type: String, required: true, trim: true },
    session: { type: String, required: true },
    groupId: { type: String, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Holiday = mongoose.model<IHoliday>("Holiday", holidaySchema);
