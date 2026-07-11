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

// Sensible starting schedule if the school hasn't set one yet — just plain
// numbered periods. The school adds/removes periods to taste; times and breaks
// are intentionally left out (a period is only "Period N + subject + teacher").
export const DEFAULT_PERIODS: IPeriodSlot[] = [
  { period: 1, label: "Period 1", start: "", end: "", isBreak: false },
  { period: 2, label: "Period 2", start: "", end: "", isBreak: false },
  { period: 3, label: "Period 3", start: "", end: "", isBreak: false },
  { period: 4, label: "Period 4", start: "", end: "", isBreak: false },
  { period: 5, label: "Period 5", start: "", end: "", isBreak: false },
  { period: 6, label: "Period 6", start: "", end: "", isBreak: false },
  { period: 7, label: "Period 7", start: "", end: "", isBreak: false },
  { period: 8, label: "Period 8", start: "", end: "", isBreak: false },
];
