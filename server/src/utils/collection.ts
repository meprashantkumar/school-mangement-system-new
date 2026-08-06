import { Types } from "mongoose";
import { Payment } from "../models/Payment";
import { IInvoice } from "../models/Invoice";
import { nextReceiptNo } from "./receipt";
import { ApiError } from "./ApiError";

// One planned credit against an invoice.
export interface AllocationPlan {
  invoice: Types.ObjectId;
  period: string;
  periodLabel: string;
  amount: number;
}

// Creates a Payment with a fresh receipt number. Reading the highest issued number
// isn't atomic, so if two counters take money in the same instant one of them loses
// the race — it retries, reads the number the winner just took, and moves past it.
// Any OTHER duplicate (e.g. a replayed Razorpay payment id) is rethrown for the caller.
export async function createPayment(data: Record<string, unknown>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const receiptNo = await nextReceiptNo();
      return await Payment.create({ ...data, receiptNo });
    } catch (err: any) {
      if (err?.code === 11000 && err?.keyPattern?.receiptNo && attempt < 4) continue;
      throw err;
    }
  }
  throw new ApiError(500, "Could not generate a unique receipt number");
}

// Plans how `amount` spreads across the given invoices, in the order passed
// (caller sorts oldest-first). Pure calculation — writes nothing. Returns the
// per-invoice allocations plus any leftover (an advance / overpayment to park).
export function planAllocations(invoices: IInvoice[], amount: number) {
  let remaining = Math.max(0, Math.round(amount));
  const allocations: AllocationPlan[] = [];
  for (const inv of invoices) {
    if (remaining <= 0) break;
    const due = Math.max(0, inv.dueAmount);
    if (due <= 0) continue;
    const take = Math.min(remaining, due);
    allocations.push({
      invoice: inv._id as Types.ObjectId,
      period: inv.period,
      periodLabel: inv.periodLabel,
      amount: take,
    });
    remaining -= take;
  }
  return { allocations, leftover: remaining };
}

// Credits the planned allocations onto their (already-loaded) invoice docs. The
// invoice pre-save hook recomputes net/due/status. Returns the total credited.
export async function applyAllocations(allocations: AllocationPlan[], invoices: IInvoice[]) {
  const byId = new Map(invoices.map((i) => [String(i._id), i]));
  let total = 0;
  for (const a of allocations) {
    const inv = byId.get(String(a.invoice));
    if (!inv) continue;
    inv.paidAmount += a.amount;
    await inv.save();
    total += a.amount;
  }
  return total;
}
