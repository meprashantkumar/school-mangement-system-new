import mongoose, { Document, Schema, Types } from "mongoose";

// cash / cheque / upi = counter (no gateway charge); online = Razorpay from home;
// credit = a drawdown of the student's advance balance (no new cash — excluded
// from cash collection reports).
export type PaymentMode = "cash" | "cheque" | "upi" | "online" | "credit";

// How one payment's money was split across the student's invoices. A lump-sum
// payment can settle several months in one receipt.
export interface IPaymentAllocation {
  invoice: Types.ObjectId;
  period?: string;
  periodLabel?: string;
  amount: number;
}

export type ChequeStatus = "pending" | "cleared" | "bounced";

export interface IPayment extends Document {
  student: Types.ObjectId;
  invoice?: Types.ObjectId; // primary/settled invoice (optional for pure-advance)
  allocations: IPaymentAllocation[]; // per-invoice split for multi-month payments
  amount: number; // total cash received (counter) / fee credited (online)
  creditAdded: number; // surplus of `amount` parked as advance credit
  mode: PaymentMode;
  platformCharge: number; // ₹ convenience fee for online payments (0 otherwise)
  reference?: string; // UTR / cheque no / txn reference
  chequeStatus?: ChequeStatus; // lifecycle for cheque payments
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

const allocationSchema = new Schema<IPaymentAllocation>(
  {
    invoice: { type: Schema.Types.ObjectId, ref: "Invoice", required: true },
    period: { type: String },
    periodLabel: { type: String },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const paymentSchema = new Schema<IPayment>(
  {
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    invoice: { type: Schema.Types.ObjectId, ref: "Invoice" },
    allocations: { type: [allocationSchema], default: [] },
    amount: { type: Number, required: true, min: 0 },
    creditAdded: { type: Number, default: 0, min: 0 },
    mode: { type: String, enum: ["cash", "cheque", "upi", "online", "credit"], required: true },
    platformCharge: { type: Number, default: 0 },
    reference: { type: String, trim: true },
    chequeStatus: { type: String, enum: ["pending", "cleared", "bounced"] },
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

// A cheque is money in transit until the bank clears it, so it starts "pending".
// Nothing used to set this, and the office's "Cheques awaiting clearance" list is
// built by filtering on exactly that value — so the list was always empty, the card
// holding the only Cleared / Bounced buttons never appeared, and a bounced cheque
// could not be reversed anywhere in the app.
//
// Enforced on the model rather than at the call site so it holds for every way a
// payment can be created.
paymentSchema.pre("validate", function (next) {
  if (this.mode === "cheque" && !this.chequeStatus) this.chequeStatus = "pending";
  next();
});

// One Payment per Razorpay payment id — blocks replay/double-credit of the same
// gateway payment. Sparse so counter payments (no id) aren't affected.
paymentSchema.index(
  { razorpayPaymentId: 1 },
  { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: "string" } } }
);

export const Payment = mongoose.model<IPayment>("Payment", paymentSchema);
