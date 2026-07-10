import mongoose, { Document, Schema } from "mongoose";

// A fee component/line item, e.g. Tuition, Transport, Exam, Hostel.
export interface IFeeHead extends Document {
  name: string;
  description?: string;
  optional: boolean; // e.g. Transport — only charged to students who opt in
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const feeHeadSchema = new Schema<IFeeHead>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    optional: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const FeeHead = mongoose.model<IFeeHead>("FeeHead", feeHeadSchema);
