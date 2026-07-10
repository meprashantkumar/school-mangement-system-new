import mongoose, { Document, Schema, Types } from "mongoose";

// A school-wide named holiday. Sundays are NOT stored here — they're treated as
// weekly-offs by weekday computation. One holiday per calendar day.
export interface IHoliday extends Document {
  dateKey: string; // "YYYY-MM-DD"
  date: Date;
  name: string;
  session: string;
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
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Holiday = mongoose.model<IHoliday>("Holiday", holidaySchema);
