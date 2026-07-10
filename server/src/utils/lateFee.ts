import { env } from "../config/env";
import { Invoice, IInvoice } from "../models/Invoice";

const DAY_MS = 24 * 60 * 60 * 1000;

// The late fee an invoice should currently carry: rupees-per-day past the due
// date (capped). Only accrues while the actual fee (excluding late fee) is unpaid.
export function computeLateFee(inv: IInvoice, now = new Date()): number {
  const { perDay, max } = env.lateFee;
  const current = inv.lateFee || 0;
  if (!perDay || !inv.dueDate) return current;

  // Amount still owed for the real fee, ignoring any late fee already added.
  const baseDue = Math.max(
    0,
    inv.totalAmount - inv.discountAmount + inv.fineAmount - inv.paidAmount
  );
  if (baseDue <= 0) return current; // the fee itself is cleared — don't keep charging

  const overdueMs = now.getTime() - new Date(inv.dueDate).getTime();
  if (overdueMs <= 0) return 0; // not overdue yet
  const days = Math.ceil(overdueMs / DAY_MS);
  let fee = perDay * days;
  if (max > 0) fee = Math.min(fee, max);
  return fee;
}

// Applies the current late fee to one invoice, saving only if it changed.
export async function syncInvoiceLateFee(inv: IInvoice): Promise<boolean> {
  if (!env.lateFee.perDay || !inv.dueDate) return false;
  const fee = computeLateFee(inv);
  if (fee !== (inv.lateFee || 0)) {
    inv.lateFee = fee;
    await inv.save(); // pre-save hook recomputes net + due + status
    return true;
  }
  return false;
}

// Sweeps every overdue, still-owing invoice and refreshes its late fee.
export async function runLateFeeSweep(): Promise<number> {
  if (!env.lateFee.perDay) return 0;
  const overdue = await Invoice.find({ dueDate: { $lt: new Date() }, dueAmount: { $gt: 0 } });
  let changed = 0;
  for (const inv of overdue) {
    if (await syncInvoiceLateFee(inv)) changed += 1;
  }
  if (changed) console.log(`Late fee sweep: updated ${changed} invoice(s)`);
  return changed;
}
