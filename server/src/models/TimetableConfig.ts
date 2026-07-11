import mongoose, { Document, Schema, Types } from "mongoose";

// The school-wide bell schedule: the list of periods (with times) and which days
// of the week are working days. A single document — every class timetable fills
// this same grid, so period 3 means the same time everywhere.
export interface IPeriodSlot {
  period: number;
  label: string;
  start: string; // "HH:mm"
  end: string; // "HH:mm"
  isBreak: boolean;
}

export interface ITimetableConfig extends Document {
  periods: IPeriodSlot[];
  workingDays: number[]; // ISO weekday 1..7 (Mon..Sun)
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const periodSlotSchema = new Schema<IPeriodSlot>(
  {
    period: { type: Number, required: true },
    label: { type: String, default: "" },
    start: { type: String, default: "" },
    end: { type: String, default: "" },
    isBreak: { type: Boolean, default: false },
  },
  { _id: false }
);

const timetableConfigSchema = new Schema<ITimetableConfig>(
  {
    periods: { type: [periodSlotSchema], default: [] },
    workingDays: { type: [Number], default: [1, 2, 3, 4, 5, 6] }, // Mon–Sat
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const TimetableConfig = mongoose.model<ITimetableConfig>(
  "TimetableConfig",
  timetableConfigSchema
);

// Sensible starting schedule if the school hasn't set one yet.
export const DEFAULT_PERIODS: IPeriodSlot[] = [
  { period: 1, label: "Period 1", start: "08:00", end: "08:45", isBreak: false },
  { period: 2, label: "Period 2", start: "08:45", end: "09:30", isBreak: false },
  { period: 3, label: "Period 3", start: "09:30", end: "10:15", isBreak: false },
  { period: 4, label: "Short Break", start: "10:15", end: "10:30", isBreak: true },
  { period: 5, label: "Period 4", start: "10:30", end: "11:15", isBreak: false },
  { period: 6, label: "Period 5", start: "11:15", end: "12:00", isBreak: false },
  { period: 7, label: "Lunch", start: "12:00", end: "12:30", isBreak: true },
  { period: 8, label: "Period 6", start: "12:30", end: "13:15", isBreak: false },
  { period: 9, label: "Period 7", start: "13:15", end: "14:00", isBreak: false },
];
