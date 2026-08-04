import { env } from "../config/env";
import { Invoice, IInvoice } from "../models/Invoice";

const DAY_MS = 24 * 60 * 60 * 1000;

// Midnight UTC of whatever day a timestamp falls on. Due dates are entered as a
// plain "YYYY-MM-DD", which parses to midnight UTC, so days late has to be
// counted in whole calendar days from that same boundary — see computeLateFee.
const startOfDay = (d: Date): number =>
  Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

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

  // Whole calendar days past the due date: 0 for all of the due date itself, 1 the
  // next day, and so on.
  //
  // This used to be Math.ceil() over the raw millisecond difference, which charged
  // a day too many. A due date parses to midnight, so at any point during the due
  // date the difference was a few hours and ceil() rounded it up to a full day —
  // a parent paying on the day the fee was due was charged one day late, and
  // everyone overdue was charged one extra day for the rest of time.
  //
  // Comparing day boundaries instead also makes the result independent of the time
  // of day, so the sweep gives the same answer whether it runs at 2am or at 11pm.
  const days = Math.floor((startOfDay(now) - startOfDay(new Date(inv.dueDate))) / DAY_MS);
  if (days <= 0) return 0; // not overdue yet, or due today
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
