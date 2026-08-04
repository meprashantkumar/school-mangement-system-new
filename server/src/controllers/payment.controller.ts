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
import { createPayment, planAllocations, applyAllocations } from "../utils/collection";
import { syncInvoiceLateFee } from "../utils/lateFee";
import { isMyChild } from "../utils/children";
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

// Parents/students may only touch invoices belonging to their own children.
// Ownership is resolved through the shared children lookup (ID link, then mobile
// number, then email) — parents log in by mobile and usually have no email, so
// comparing email addresses here both locked them out of their own child and let
// them reach any other student who also had no email on file.
async function assertCanAccess(user: IUser, invoice: IInvoice) {
  if (user.role === "superadmin" || user.role === "admin") return;
  if (!(await isMyChild(user, invoice.student))) {
    throw new ApiError(403, "You cannot access this invoice");
  }
}

// Un-credits a payment's invoice(s): subtracts each allocation (or, for legacy
// single-invoice payments, invoice + amount) back off paidAmount. Used by both
// void and cheque-bounce. Does not touch the credit balance (callers handle that).
async function reverseAllocations(payment: any) {
  const allocs =
    payment.allocations?.length > 0
      ? payment.allocations
      : payment.invoice
      ? [{ invoice: payment.invoice, amount: payment.amount }]
      : [];
  for (const a of allocs) {
    const inv = await Invoice.findById(a.invoice);
    if (inv) {
      inv.paidAmount = Math.max(0, inv.paidAmount - a.amount);
      await inv.save();
    }
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

// POST /api/payments/collect  { studentId, invoiceId?, amount, mode, reference?, note? }
// The unified counter collection. Spreads `amount` across the student's dues
// (oldest month first) and parks any surplus as advance credit. One receipt can
// therefore settle several months and/or leave an advance. If invoiceId is given,
// only that invoice is targeted (surplus still becomes advance credit).
export const recordCollection = asyncHandler(async (req, res) => {
  const { studentId, invoiceId, amount, mode, reference, note } = req.body;
  const amt = Math.round(Number(amount));
  if (!studentId || !amt || amt <= 0) {
    throw new ApiError(400, "Student and a valid amount are required");
  }
  const allowedModes = ["cash", "cheque", "upi"];
  const payMode = allowedModes.includes(mode) ? mode : "cash";

  const student = await Student.findById(studentId);
  if (!student) throw new ApiError(404, "Student not found");

  // Target invoices (something owing), oldest month first, late fees current.
  let invoices: IInvoice[];
  if (invoiceId) {
    const inv = await Invoice.findById(invoiceId);
    if (!inv || String(inv.student) !== String(student._id)) {
      throw new ApiError(404, "Invoice not found for this student");
    }
    await syncInvoiceLateFee(inv);
    invoices = inv.dueAmount > 0 ? [inv] : [];
  } else {
    invoices = await Invoice.find({ student: student._id }).sort({ period: 1 });
    for (const inv of invoices) await syncInvoiceLateFee(inv);
    invoices = invoices.filter((i) => i.dueAmount > 0);
  }

  const { allocations, leftover } = planAllocations(invoices, amt);

  // Payment first (reserves the receipt), then credit — mirrors the single-invoice
  // path so a failed receipt write never leaves a credited invoice with no receipt.
  const payment = await createPayment({
    student: student._id,
    invoice: allocations[0]?.invoice, // primary invoice (for the legacy receipt view)
    allocations,
    amount: amt, // total cash received (incl. any advance)
    creditAdded: leftover, // surplus parked as advance credit
    mode: payMode,
    reference: reference || undefined,
    note,
    chequeStatus: payMode === "cheque" ? "pending" : undefined,
    collectedBy: req.user!.id,
  });

  await applyAllocations(allocations, invoices);
  if (leftover > 0) {
    student.creditBalance = (student.creditBalance || 0) + leftover;
    await student.save();
  }

  logAudit(
    req,
    AUDIT.PAYMENT,
    `Collected ₹${amt} (${payMode}) — ${payment.receiptNo} from ${student.name}${
      leftover ? ` (₹${leftover} to advance)` : ""
    }`,
    { entity: "Payment", entityId: String(payment._id) }
  );

  const updated = await Invoice.find({ student: student._id }).sort({ createdAt: -1 });
  res.status(201).json({
    message: "Payment recorded",
    payment,
    invoices: updated,
    creditBalance: student.creditBalance || 0,
  });
});

// POST /api/payments/apply-credit  { studentId, amount? }
// Draws down a student's advance credit onto their outstanding dues (oldest month
// first). Records a "credit" payment — no new cash, so it's excluded from cash
// collection reports.
export const applyCredit = asyncHandler(async (req, res) => {
  const { studentId, amount } = req.body;
  const student = await Student.findById(studentId);
  if (!student) throw new ApiError(404, "Student not found");

  const requested = Math.round(Number(amount) || student.creditBalance || 0);
  const use = Math.min(Math.max(0, requested), student.creditBalance || 0);
  if (use <= 0) throw new ApiError(400, "No advance credit to apply");

  let invoices = await Invoice.find({ student: student._id }).sort({ period: 1 });
  for (const inv of invoices) await syncInvoiceLateFee(inv);
  invoices = invoices.filter((i) => i.dueAmount > 0);

  const { allocations } = planAllocations(invoices, use);
  if (allocations.length === 0) throw new ApiError(400, "No outstanding dues to apply credit to");
  const applied = allocations.reduce((s, a) => s + a.amount, 0);

  const payment = await createPayment({
    student: student._id,
    invoice: allocations[0].invoice,
    allocations,
    amount: applied,
    mode: "credit",
    note: "Applied from advance credit",
    collectedBy: req.user!.id,
  });
  await applyAllocations(allocations, invoices);
  student.creditBalance = Math.max(0, (student.creditBalance || 0) - applied);
  await student.save();

  logAudit(
    req,
    AUDIT.PAYMENT,
    `Applied ₹${applied} advance credit — ${payment.receiptNo} for ${student.name}`,
    { entity: "Payment", entityId: String(payment._id) }
  );

  const updated = await Invoice.find({ student: student._id }).sort({ createdAt: -1 });
  res.json({
    message: `Applied ₹${applied} from advance credit`,
    payment,
    invoices: updated,
    creditBalance: student.creditBalance,
  });
});

// PATCH /api/payments/:id/cheque  { status: "cleared" | "bounced" }
// A bounced cheque reverses its credit (un-credits the invoice(s) + removes any
// advance) and voids the payment; the row + receipt number are kept for the trail.
export const updateChequeStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (status !== "cleared" && status !== "bounced") {
    throw new ApiError(400, "Status must be 'cleared' or 'bounced'");
  }
  const payment = await Payment.findById(req.params.id);
  if (!payment) throw new ApiError(404, "Payment not found");
  if (payment.mode !== "cheque") throw new ApiError(400, "Not a cheque payment");
  if (payment.voided) throw new ApiError(400, "This payment is already voided");
  if (payment.chequeStatus === status) {
    return res.json({ message: `Cheque already ${status}`, payment });
  }

  if (status === "bounced") {
    await reverseAllocations(payment);
    if (payment.creditAdded) {
      const student = await Student.findById(payment.student);
      if (student) {
        student.creditBalance = Math.max(0, (student.creditBalance || 0) - payment.creditAdded);
        await student.save();
      }
    }
    payment.voided = true;
    payment.voidedAt = new Date();
    payment.voidReason = "Cheque bounced";
    payment.voidedBy = req.user!._id as any;
  }
  payment.chequeStatus = status;
  await payment.save();

  logAudit(
    req,
    status === "bounced" ? AUDIT.VOID : AUDIT.PAYMENT,
    `Cheque ${payment.receiptNo} marked ${status}${status === "bounced" ? " — reversed" : ""}`,
    { entity: "Payment", entityId: String(payment._id) }
  );
  res.json({ message: `Cheque marked ${status}`, payment });
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

  // Un-credit the invoice(s) this payment settled.
  await reverseAllocations(payment);

  // Reverse the credit side too.
  const student = await Student.findById(payment.student);
  if (student) {
    if (payment.mode === "credit") {
      // This payment DREW from advance credit; voiding restores it.
      student.creditBalance = (student.creditBalance || 0) + payment.amount;
    } else if (payment.creditAdded) {
      // This payment PARKED an advance; voiding removes it.
      student.creditBalance = Math.max(0, (student.creditBalance || 0) - payment.creditAdded);
    }
    await student.save();
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
  const invoice = payment.invoice ? await Invoice.findById(payment.invoice) : null;
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
