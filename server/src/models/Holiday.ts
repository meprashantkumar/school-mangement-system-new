import mongoose, { Document, Schema, Types } from "mongoose";

// A named holiday. Sundays are NOT stored here — they're treated as weekly-offs by
// weekday computation.
//
// SCOPE. `class` is "" for a whole-school holiday (Diwali) or a single class name
// for a holiday that affects only that class (Class 10 is off during board exams).
// A holiday declared for several classes at once is stored as one row per class, so
// every lookup stays a plain indexed query on (dateKey, class) instead of needing an
// array match. Whole-school is the default and the common case.
//
// A multi-day break (a summer vacation, say) is likewise stored as one row per day
// rather than as a start/end pair. That is deliberate: the attendance percentage
// excludes holidays by matching a list of dateKeys ($nin in attendance.controller.ts),
// and the roster and the "you can't mark attendance on a holiday" guards all look a
// single day up by its key. Per-day rows keep every one of those working unchanged.
//
// So one row = one (day, class) pair, and `groupId` ties back together every row that
// one action created, so a whole break can be listed and removed as a unit.
export interface IHoliday extends Document {
  dateKey: string; // "YYYY-MM-DD"
  date: Date;
  name: string;
  session: string;
  class: string; // "" = the whole school; otherwise one class from CLASSES
  groupId?: string; // shared by every row one action created
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const holidaySchema = new Schema<IHoliday>(
  {
    dateKey: { type: String, required: true },
    date: { type: Date, required: true },
    name: { type: String, required: true, trim: true },
    session: { type: String, required: true },
    class: { type: String, default: "", trim: true },
    groupId: { type: String, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// One holiday per day per scope. `dateKey` alone used to be unique, which is why
// migrateHolidayScope() drops that older index — it would reject a class holiday on
// a day that already has one for another class.
holidaySchema.index({ dateKey: 1, class: 1 }, { unique: true });
// The percentage calculation asks for "every holiday this session that applies to
// class X" on every roster load.
holidaySchema.index({ session: 1, class: 1 });

export const Holiday = mongoose.model<IHoliday>("Holiday", holidaySchema);
