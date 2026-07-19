import crypto from "crypto";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Invoice, IInvoice } from "../models/Invoice";
import { Payment } from "../models/Payment";
import { Student } from "../models/Student";
import { razorpay } from "../config/razorpay";
import { env } from "../config/env";
import { sendMail } from "../config/mailer";
import { logAudit, AUDIT } from "../utils/audit";
import { nextReceiptNo } from "../utils/receipt";
import { IUser } from "../models/User";

// Emails the parent a payment confirmation / receipt (best-effort; never blocks the
// payment response, and silently no-ops if there's no email on file).
function sendPaymentConfirmation(payment: any, invoice: IInvoice, student: any) {
  const email = student?.parentEmail;
  if (!email) return;
  const when = new Date().toLocaleString("en-IN");
  const platform = payment.platformCharge || 0;
  const totalPaid = payment.amount + platform;
  // For online payments the parent is actually charged fee + convenience fee, so
  // show both plus the true total (not just the fee that reduced the dues).
  const amountRows =
    platform > 0
      ? `<tr><td style="padding:4px 8px">Fee credited</td><td style="padding:4px 8px">₹${payment.amount}</td></tr>
         <tr><td style="padding:4px 8px">Convenience fee</td><td style="padding:4px 8px">₹${platform}</td></tr>
         <tr><td style="padding:4px 8px">Total paid</td><td style="padding:4px 8px"><strong>₹${totalPaid}</strong></td></tr>`
      : `<tr><td style="padding:4px 8px">Amount paid</td><td style="padding:4px 8px"><strong>₹${payment.amount}</strong></td></tr>`;
  sendMail(
    email,
    `Payment received — ${payment.receiptNo}`,
    `<div style="font-family:Arial,sans-serif">
      <h2 style="color:#2C6FE6">${env.schoolName} — Payment Received</h2>
      <p>Dear ${student.parentName || "Parent"},</p>
      <p>We have received the following payment for <strong>${student.name}</strong> (Class ${student.class}):</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 8px">Receipt No</td><td style="padding:4px 8px"><strong>${payment.receiptNo}</strong></td></tr>
        ${amountRows}
        <tr><td style="padding:4px 8px">Mode</td><td style="padding:4px 8px">${payment.mode.toUpperCase()}</td></tr>
        <tr><td style="padding:4px 8px">Period</td><td style="padding:4px 8px">${invoice.periodLabel}</td></tr>
        <tr><td style="padding:4px 8px">Date</td><td style="padding:4px 8px">${when}</td></tr>
        <tr><td style="padding:4px 8px">Remaining due</td><td style="padding:4px 8px">₹${invoice.dueAmount}</td></tr>
      </table>
      <p>Thank you,<br/>${env.schoolName}</p>
    </div>`
  ).catch((e) => console.error("Payment confirmation email failed:", e));
}

// Creates a Payment, assigning a fresh receipt number. The receipt number
// (count+1) isn't atomic, so if two payments land at once one hits the unique
// receiptNo index — we simply retry with a recomputed number. Any OTHER duplicate
// (e.g. a replayed Razorpay payment id) is rethrown for the caller to handle.
async function createPayment(data: Record<string, unknown>) {
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

// Parents/students may only touch invoices belonging to their own children.
async function assertCanAccess(user: IUser, invoice: IInvoice) {
  if (user.role === "superadmin" || user.role === "admin") return;
  const student = await Student.findById(invoice.student);
  if (!student || student.parentEmail !== user.email) {
    throw new ApiError(403, "You cannot access this invoice");
  }
}

// POST /api/payments/counter  { invoiceId, amount, mode, note }
// Staff records a counter payment: cash, cheque, or upi (QR scanned at school). No gateway charge.
export const recordCounterPayment = asyncHandler(async (req, res) => {
  const { invoiceId, amount, mode, note } = req.body;
  const amt = Number(amount);
  if (!invoiceId || !amt || amt <= 0) {
    throw new ApiError(400, "Invoice and a valid amount are required");
  }

  const allowedModes = ["cash", "cheque", "upi"];
  const payMode = allowedModes.includes(mode) ? mode : "cash";

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new ApiError(404, "Invoice not found");
  if (amt > invoice.dueAmount) {
    throw new ApiError(400, `Amount exceeds the due amount (${invoice.dueAmount})`);
  }

  // Create the Payment FIRST, then credit the invoice. If the receipt write
  // fails, the invoice is never touched — so a retry can't double-credit and we
  // never end up with a credited invoice that has no receipt.
  const payment = await createPayment({
    student: invoice.student,
    invoice: invoice._id,
    amount: amt,
    mode: payMode,
    collectedBy: req.user!.id,
    note,
  });

  invoice.paidAmount += amt;
  await invoice.save();

  const student = await Student.findById(invoice.student);
  // Counter payments (cash/cheque/UPI-QR) are made in person and handed a printed
  // receipt on the spot, so no confirmation email is sent. Only online payments
  // made from home email the parent (see verifyRazorpayPayment).
  logAudit(
    req,
    AUDIT.PAYMENT,
    `Collected ₹${amt} (${payMode}) — ${payment.receiptNo}${student ? ` from ${student.name}` : ""}`,
    { entity: "Payment", entityId: String(payment._id) }
  );

  res.status(201).json({ message: "Payment recorded", payment, invoice });
});

// The convenience fee for an online payment: a percentage of the amount being
// paid, rounded UP to the whole rupee. Razorpay keeps 2% + 18% GST = 2.36% of
// the total charged, so the default 2.5% (see env.onlinePlatformFeePct) covers
// the gateway's cut on every payment — the school never runs at a loss.
export function platformFeeFor(amount: number): number {
  return Math.ceil((amount * env.onlinePlatformFeePct) / 100);
}

// POST /api/payments/razorpay/order  { invoiceId, amount }
export const createRazorpayOrder = asyncHandler(async (req, res) => {
  if (!razorpay) throw new ApiError(400, "Online payments are not configured");

  const { invoiceId, amount } = req.body;
  const amt = Number(amount);
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new ApiError(404, "Invoice not found");
  await assertCanAccess(req.user!, invoice);
  if (!amt || amt <= 0 || amt > invoice.dueAmount) throw new ApiError(400, "Invalid amount");

  // Online payments from home carry a platform/convenience fee on top of the fee amount.
  const platformFee = platformFeeFor(amt);
  const order = await razorpay.orders.create({
    amount: Math.round((amt + platformFee) * 100), // paise, incl. platform fee
    currency: "INR",
    receipt: `inv_${invoice.id}`,
    // Stamp the fee split onto the order itself. Verification reads the fee back
    // from HERE (Razorpay-held, server-set) instead of re-deriving it, so the
    // amount credited can never be tampered with by the client.
    notes: { platformFee: String(platformFee), feeAmount: String(amt) },
  });

  res.json({ order, keyId: env.razorpay.keyId, platformFee });
});

// POST /api/payments/razorpay/verify
// { razorpay_order_id, razorpay_payment_id, razorpay_signature }
//
// IMPORTANT: the credited amount and the target invoice are derived ENTIRELY from
// Razorpay (the fetched payment/order), never from the request body. This stops a
// client from claiming a larger amount than they actually paid.
export const verifyRazorpayPayment = asyncHandler(async (req, res) => {
  if (!razorpay) throw new ApiError(400, "Online payments are not configured");

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new ApiError(400, "Missing payment details");
  }

  // 1) Signature proves the order+payment ids came from Razorpay.
  const expected = crypto
    .createHmac("sha256", env.razorpay.keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");
  if (expected !== razorpay_signature) {
    throw new ApiError(400, "Payment verification failed");
  }

  // 2) Idempotency: if we've already recorded this gateway payment, return it.
  const already = await Payment.findOne({ razorpayPaymentId: razorpay_payment_id });
  if (already) {
    const inv = await Invoice.findById(already.invoice);
    return res.status(200).json({ message: "Payment already recorded", payment: already, invoice: inv });
  }

  // 3) Fetch the real payment + order from Razorpay (source of truth for amount).
  const rp: any = await razorpay.payments.fetch(razorpay_payment_id);
  if (!rp || rp.order_id !== razorpay_order_id) {
    throw new ApiError(400, "Payment does not match the order");
  }
  // Capture if it was only authorised, so the money is actually taken.
  let captured = rp;
  if (rp.status === "authorized") {
    captured = await razorpay.payments.capture(razorpay_payment_id, rp.amount, rp.currency || "INR");
  }
  if (captured.status !== "captured") {
    throw new ApiError(400, "Payment was not captured");
  }

  const order: any = await razorpay.orders.fetch(razorpay_order_id);
  const invoiceId = String(order?.receipt || "").replace(/^inv_/, "");
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new ApiError(404, "Invoice for this order was not found");
  await assertCanAccess(req.user!, invoice);

  // 4) Credit ONLY what was actually captured, minus the platform fee, capped at
  // the invoice's outstanding due. The fee comes from the order's own notes
  // (set by us at order creation, held by Razorpay), so it can't be spoofed.
  const platformFee = Math.round(Number(order?.notes?.platformFee) || 0);
  const capturedRupees = Math.round(Number(captured.amount) / 100);
  const feeCredit = Math.max(0, Math.min(capturedRupees - platformFee, invoice.dueAmount));
  if (feeCredit <= 0) throw new ApiError(400, "Captured amount does not cover any dues");

  const isStaff = req.user!.role === "superadmin" || req.user!.role === "admin";

  // Create the Payment first: the unique razorpayPaymentId index makes a
  // duplicate/replay fail HERE, before the invoice is ever credited.
  const payment = await createPayment({
    student: invoice.student,
    invoice: invoice._id,
    amount: feeCredit, // only the fee reduces dues; platform fee is separate
    platformCharge: platformFee,
    mode: "online",
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
    collectedBy: isStaff ? req.user!.id : undefined,
  });

  invoice.paidAmount += feeCredit;
  await invoice.save();

  const student = await Student.findById(invoice.student);
  sendPaymentConfirmation(payment, invoice, student);
  logAudit(
    req,
    AUDIT.PAYMENT,
    `Online payment ₹${feeCredit} — ${payment.receiptNo}${student ? ` from ${student.name}` : ""}`,
    { entity: "Payment", entityId: String(payment._id) }
  );

  res.status(201).json({ message: "Payment successful", payment, invoice });
});

// POST /api/payments/:id/void  { reason }
// Reverses a mistaken payment: subtracts it back from the invoice's paid amount
// and marks the Payment voided (the row + receipt number are kept for a gapless
// audit trail). For online payments the money stays with the school and is
// adjusted against the next month's fee (per school policy — no gateway refund).
export const voidPayment = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const payment = await Payment.findById(req.params.id);
  if (!payment) throw new ApiError(404, "Payment not found");
  if (payment.voided) throw new ApiError(400, "This payment is already voided");

  const invoice = await Invoice.findById(payment.invoice);
  if (invoice) {
    invoice.paidAmount = Math.max(0, invoice.paidAmount - payment.amount);
    await invoice.save();
  }

  payment.voided = true;
  payment.voidedAt = new Date();
  payment.voidReason = reason || undefined;
  payment.voidedBy = req.user!._id as any;
  await payment.save();

  logAudit(
    req,
    AUDIT.VOID,
    `Voided payment ${payment.receiptNo} (₹${payment.amount})${reason ? ` — ${reason}` : ""}`,
    { entity: "Payment", entityId: String(payment._id) }
  );
  res.json({ message: "Payment voided", payment, invoice });
});

// GET /api/payments?from=&to=&mode=&student=
export const getPayments = asyncHandler(async (req, res) => {
  const { from, to, mode, student } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { voided: { $ne: true } };
  if (mode) filter.mode = mode;
  if (student) filter.student = student;
  if (from || to) {
    // Interpret the picked calendar dates in IST so the range matches the dates
    // shown in the UI, regardless of the server's timezone.
    const range: Record<string, Date> = {};
    if (from) range.$gte = new Date(`${from}T00:00:00.000+05:30`);
    if (to) range.$lte = new Date(`${to}T23:59:59.999+05:30`);
    filter.createdAt = range;
  }

  const payments = await Payment.find(filter)
    .populate("student", "name admissionNo class")
    .populate("collectedBy", "name")
    .sort({ createdAt: -1 });
  res.json({ payments });
});

// GET /api/payments/:id/receipt
export const getReceipt = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id)
    .populate("student")
    .populate("invoice")
    .populate("collectedBy", "name");
  if (!payment) throw new ApiError(404, "Receipt not found");

  // Parents/students may only view receipts for their own children.
  await assertCanAccess(req.user!, payment.invoice as unknown as IInvoice);

  res.json({ payment });
});
