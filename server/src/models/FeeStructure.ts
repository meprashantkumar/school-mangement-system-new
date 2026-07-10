import mongoose, { Document, Schema, Types } from "mongoose";

export interface StructureItem {
  feeHead?: Types.ObjectId;
  name: string;
  amount: number;
  optional: boolean; // optional services (e.g. Transport) only apply to opted-in students
}

// A fee plan for a class (e.g. "Class 6 - 2026-27"). Items are the monthly fee menu;
// invoices are generated per month, picking mandatory items + each student's opted services.
export interface IFeeStructure extends Document {
  name: string;
  class: string;
  academicYear: string;
  items: StructureItem[];
  totalAmount: number; // mandatory total (informational)
  createdAt: Date;
  updatedAt: Date;
}

const feeStructureSchema = new Schema<IFeeStructure>(
  {
    name: { type: String, required: true, trim: true },
    class: { type: String, required: true, trim: true },
    academicYear: { type: String, required: true, trim: true },
    items: [
      {
        feeHead: { type: Schema.Types.ObjectId, ref: "FeeHead" },
        name: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        optional: { type: Boolean, default: false },
      },
    ],
    totalAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// totalAmount reflects the mandatory items (optional services are added per student).
feeStructureSchema.pre("save", function (next) {
  this.totalAmount = this.items
    .filter((i) => !i.optional)
    .reduce((sum, item) => sum + (item.amount || 0), 0);
  next();
});

export const FeeStructure = mongoose.model<IFeeStructure>("FeeStructure", feeStructureSchema);
