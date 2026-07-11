import mongoose, { Document, Schema, Types } from "mongoose";

// A recycle-bin entry: a full snapshot of a deleted document so it can be
// restored exactly (same _id, so any references stay valid).
export type TrashKind =
  | "Student"
  | "Teacher"
  | "Staff"
  | "FeeStructure"
  | "FeeHead"
  | "Subject"
  | "Exam"
  | "Admission";

export interface ITrash extends Document {
  kind: TrashKind;
  originalId: Types.ObjectId;
  label: string; // human summary for the bin list
  data: Record<string, unknown>; // the full original document
  deletedBy?: Types.ObjectId;
  deletedByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const trashSchema = new Schema<ITrash>(
  {
    kind: { type: String, required: true },
    originalId: { type: Schema.Types.ObjectId, required: true },
    label: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
    deletedByName: { type: String },
  },
  { timestamps: true }
);

trashSchema.index({ createdAt: -1 });

export const Trash = mongoose.model<ITrash>("Trash", trashSchema);
