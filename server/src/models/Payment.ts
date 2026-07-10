import mongoose, { Document, Schema, Types } from "mongoose";

// cash / cheque / upi = counter (no gateway charge); online = Razorpay from home
export type PaymentMode = "cash" | "cheque" | "upi" | "online";

export interface IPayment extends Document {
  student: Types.ObjectId;
  invoice: Types.ObjectId;
  amount: number;
  mode: PaymentMode;
  platformCharge: number; // ₹ convenience fee for online payments (0 otherwise)
  receiptNo: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  collectedBy?: Types.ObjectId; // staff who recorded it (empty for parent online)
  note?: string;
  voided: boolean; // reversed by mistake-correction; kept for a gapless receipt trail
  voidedAt?: Date;
  voidReason?: string;
  voidedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    invoice: { type: Schema.Types.ObjectId, ref: "Invoice", required: true },
    amount: { type: Number, required: true, min: 1 },
    mode: { type: String, enum: ["cash", "cheque", "upi", "online"], required: true },
    platformCharge: { type: Number, default: 0 },
    receiptNo: { type: String, required: true, unique: true },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    collectedBy: { type: Schema.Types.ObjectId, ref: "User" },
    note: { type: String },
    voided: { type: Boolean, default: false },
    voidedAt: { type: Date },
    voidReason: { type: String },
    voidedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// One Payment per Razorpay payment id — blocks replay/double-credit of the same
// gateway payment. Sparse so counter payments (no id) aren't affected.
paymentSchema.index(
  { razorpayPaymentId: 1 },
  { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: "string" } } }
);

export const Payment = mongoose.model<IPayment>("Payment", paymentSchema);
