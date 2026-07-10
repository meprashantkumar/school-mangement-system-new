import mongoose, { Document, Schema, Types } from "mongoose";

// Records a bulk-promotion so it can be undone in one click. Each entry stores
// the student's exact position BEFORE the promotion for a lossless rollback.
export interface IPromotionEntry {
  student: Types.ObjectId;
  prevSession: string;
  prevClass: string;
  prevSection?: string;
  prevStatus: string;
}

export interface IPromotionRun extends Document {
  fromSession: string;
  fromClass: string;
  fromSection?: string;
  toSession: string;
  summary: string;
  entries: IPromotionEntry[];
  undone: boolean;
  by?: Types.ObjectId;
  byName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const entrySchema = new Schema<IPromotionEntry>(
  {
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    prevSession: { type: String, required: true },
    prevClass: { type: String, required: true },
    prevSection: { type: String },
    prevStatus: { type: String, required: true },
  },
  { _id: false }
);

const runSchema = new Schema<IPromotionRun>(
  {
    fromSession: { type: String, required: true },
    fromClass: { type: String, required: true },
    fromSection: { type: String },
    toSession: { type: String, required: true },
    summary: { type: String, default: "" },
    entries: { type: [entrySchema], default: [] },
    undone: { type: Boolean, default: false },
    by: { type: Schema.Types.ObjectId, ref: "User" },
    byName: { type: String },
  },
  { timestamps: true }
);

export const PromotionRun = mongoose.model<IPromotionRun>("PromotionRun", runSchema);
