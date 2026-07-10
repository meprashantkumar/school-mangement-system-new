import mongoose, { Document, Schema, Types } from "mongoose";

export interface InvoiceItem {
  name: string;
  amount: number;
}

export interface InvoiceConcession {
  reason: string;
  amount: number;
}

export type InvoiceStatus = "unpaid" | "partial" | "paid";

// One invoice = one billing period (month) for a student.
export interface IInvoice extends Document {
  student: Types.ObjectId;
  feeStructure?: Types.ObjectId;
  academicYear: string;
  class: string;
  period: string; // e.g. "2026-07"
  periodLabel: string; // e.g. "July 2026"
  dueDate?: Date;
  items: InvoiceItem[];
  concessions: InvoiceConcession[];
  totalAmount: number;
  discountAmount: number;
  fineAmount: number;
  lateFee: number; // auto late fee accrued after the due date
  netAmount: number;
  paidAmount: number;
  dueAmount: number;
  status: InvoiceStatus;
  createdAt: Date;
  updatedAt: Date;
}

const invoiceSchema = new Schema<IInvoice>(
  {
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    feeStructure: { type: Schema.Types.ObjectId, ref: "FeeStructure" },
    academicYear: { type: String, required: true },
    class: { type: String, required: true },
    period: { type: String, required: true },
    periodLabel: { type: String, required: true },
    dueDate: { type: Date },
    items: [
      {
        name: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
      },
    ],
    concessions: [
      {
        reason: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
      },
    ],
    totalAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    fineAmount: { type: Number, default: 0, min: 0 },
    lateFee: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    dueAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
    },
  },
  { timestamps: true }
);

// One invoice per (student, fee structure, month) — makes the generation
// idempotency a hard DB guarantee, so concurrent/duplicate runs can't double-bill.
invoiceSchema.index(
  { student: 1, feeStructure: 1, period: 1 },
  { unique: true, partialFilterExpression: { feeStructure: { $exists: true } } }
);

// Recompute derived totals before every save.
invoiceSchema.pre("save", function (next) {
  this.totalAmount = this.items.reduce((s, i) => s + (i.amount || 0), 0);
  this.discountAmount = this.concessions.reduce((s, c) => s + (c.amount || 0), 0);
  this.netAmount = Math.max(
    0,
    this.totalAmount - this.discountAmount + this.fineAmount + (this.lateFee || 0)
  );
  this.dueAmount = Math.max(0, this.netAmount - this.paidAmount);
  this.status = this.dueAmount <= 0 ? "paid" : this.paidAmount > 0 ? "partial" : "unpaid";
  next();
});

export const Invoice = mongoose.model<IInvoice>("Invoice", invoiceSchema);
