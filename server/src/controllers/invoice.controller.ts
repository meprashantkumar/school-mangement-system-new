import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Invoice } from "../models/Invoice";
import { FeeStructure, IFeeStructure } from "../models/FeeStructure";
import { Student } from "../models/Student";
import { syncInvoiceLateFee } from "../utils/lateFee";
import { logAudit, AUDIT } from "../utils/audit";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Generates the given month's invoices for one fee structure. IDEMPOTENT: a student
// who already has an invoice for this (structure, period) is skipped — so the same
// month for the same class can never be generated twice / duplicated.
async function generateForStructure(
  structure: IFeeStructure,
  m: number,
  y: number,
  dueDate?: string
) {
  const period = `${y}-${String(m).padStart(2, "0")}`;
  const periodLabel = `${MONTHS[m - 1]} ${y}`;
  // Scope to the structure's academic year too — otherwise, if two batches of the
  // same class briefly co-exist (a not-yet-promoted class), both would be billed.
  const students = await Student.find({
    class: structure.class,
    session: structure.academicYear,
    status: "active",
  });

  let created = 0;
  let skipped = 0;
  for (const student of students) {
    const exists = await Invoice.findOne({
      student: student._id,
      feeStructure: structure._id,
      period,
    });
    if (exists) {
      skipped += 1;
      continue;
    }

    // Mandatory items for all; optional items only if the student opted in.
    const opted = student.optedServices || [];
    const items = structure.items
      .filter((i) => !i.optional || opted.includes(i.name))
      .map((i) => ({ name: i.name, amount: i.amount }));

    if (items.length === 0) {
      skipped += 1;
      continue;
    }

    const invoice = new Invoice({
      student: student._id,
      feeStructure: structure._id,
      academicYear: structure.academicYear,
      class: structure.class,
      period,
      periodLabel,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      items,
      concessions: [],
    });
    try {
      await invoice.save();
      created += 1;
    } catch (err: any) {
      // Unique index (student, feeStructure, period) — a concurrent run already
      // created this one. Treat as skipped rather than duplicating.
      if (err?.code === 11000) skipped += 1;
      else throw err;
    }
  }

  return { created, skipped, total: students.length, period, periodLabel };
}

// POST /api/invoices/generate  { feeStructureId, month (1-12), year, dueDate? }
// Generates one class's month (single fee structure).
export const generateInvoices = asyncHandler(async (req, res) => {
  const { feeStructureId, month, year, dueDate } = req.body;
  const m = Number(month);
  const y = Number(year);
  if (!m || m < 1 || m > 12 || !y) {
    throw new ApiError(400, "Please provide a valid month and year");
  }

  const structure = await FeeStructure.findById(feeStructureId);
  if (!structure) throw new ApiError(404, "Fee structure not found");

  const { created, skipped, total, periodLabel } = await generateForStructure(structure, m, y, dueDate);

  const message = `Generated ${created} invoice(s) for ${periodLabel} (Class ${structure.class})${
    skipped ? `, skipped ${skipped} already generated` : ""
  }`;
  if (created) logAudit(req, AUDIT.FEE_GENERATION, message);

  res.json({ message, created, skipped, totalStudents: total });
});

// POST /api/invoices/generate-bulk  { month (1-12), year, dueDate? }
// Generates the chosen month for EVERY fee structure (all classes) in one go.
// Classes already generated for that month are skipped automatically (no duplicates).
export const generateBulkInvoices = asyncHandler(async (req, res) => {
  const { month, year, dueDate } = req.body;
  const m = Number(month);
  const y = Number(year);
  if (!m || m < 1 || m > 12 || !y) {
    throw new ApiError(400, "Please provide a valid month and year");
  }

  const structures = await FeeStructure.find().sort({ class: 1 });
  if (structures.length === 0) {
    throw new ApiError(400, "No fee structures found. Create fee structures first.");
  }

  let totalCreated = 0;
  let totalSkipped = 0;
  const results = [];
  for (const s of structures) {
    const r = await generateForStructure(s, m, y, dueDate);
    totalCreated += r.created;
    totalSkipped += r.skipped;
    results.push({
      structureId: s._id,
      structureName: s.name,
      class: s.class,
      created: r.created,
      skipped: r.skipped,
      total: r.total,
    });
  }

  const periodLabel = `${MONTHS[m - 1]} ${y}`;
  const message = `${periodLabel}: generated ${totalCreated} invoice(s) across ${structures.length} class(es)${
    totalSkipped ? `, skipped ${totalSkipped} already generated` : ""
  }`;
  if (totalCreated) logAudit(req, AUDIT.FEE_GENERATION, `Bulk generation — ${message}`);

  res.json({ message, periodLabel, totalCreated, totalSkipped, results });
});

// GET /api/invoices/summary?session=&class=
// Everything generated, grouped by session (academic year) + month + class + structure.
export const getInvoiceSummary = asyncHandler(async (req, res) => {
  const { session, class: className } = req.query as Record<string, string>;
  const match: Record<string, unknown> = {};
  if (session) match.academicYear = session;
  if (className) match.class = className;

  const runs = await Invoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          academicYear: "$academicYear",
          period: "$period",
          periodLabel: "$periodLabel",
          class: "$class",
          feeStructure: "$feeStructure",
        },
        count: { $sum: 1 },
        totalNet: { $sum: "$netAmount" },
        totalPaid: { $sum: "$paidAmount" },
        totalDue: { $sum: "$dueAmount" },
      },
    },
    {
      $lookup: {
        from: "feestructures",
        localField: "_id.feeStructure",
        foreignField: "_id",
        as: "fs",
      },
    },
    { $sort: { "_id.period": -1, "_id.class": 1 } },
  ]);

  const formatted = runs.map((r) => ({
    academicYear: r._id.academicYear,
    period: r._id.period,
    periodLabel: r._id.periodLabel,
    class: r._id.class,
    structureName: r.fs?.[0]?.name || "—",
    count: r.count,
    totalNet: r.totalNet,
    totalPaid: r.totalPaid,
    totalDue: r.totalDue,
  }));

  res.json({ runs: formatted });
});

// DELETE /api/invoices/run?period=&class=&session=
// Deletes a generated run (all invoices for one class in one month) — for undoing a
// mistaken generation. Invoices that already have a payment are KEPT (skipped) so no
// collected money / receipt is ever lost.
export const deleteInvoiceRun = asyncHandler(async (req, res) => {
  const { period, class: className, session } = req.query as Record<string, string>;
  if (!period || !className) throw new ApiError(400, "period and class are required");

  const filter: Record<string, unknown> = { period, class: className };
  if (session) filter.academicYear = session;

  // Keep any invoice that has real activity — a payment OR a manual adjustment
  // (concession / fine / accrued late fee) — so nothing hand-entered is lost.
  const invoices = await Invoice.find(filter).select("_id paidAmount discountAmount fineAmount lateFee");
  const deletable = invoices
    .filter(
      (i) =>
        (i.paidAmount || 0) === 0 &&
        (i.discountAmount || 0) === 0 &&
        (i.fineAmount || 0) === 0 &&
        (i.lateFee || 0) === 0
    )
    .map((i) => i._id);
  const withPayments = invoices.length - deletable.length;

  let deleted = 0;
  if (deletable.length) {
    const r = await Invoice.deleteMany({ _id: { $in: deletable } });
    deleted = r.deletedCount || 0;
  }

  if (deleted) {
    logAudit(
      req,
      AUDIT.FEE_GENERATION,
      `Deleted generated fee for Class ${className} · ${period} (${deleted} invoice(s))`
    );
  }

  res.json({
    message: `Deleted ${deleted} invoice(s)${
      withPayments ? `; kept ${withPayments} with payments or adjustments` : ""
    }`,
    deleted,
    skipped: withPayments,
  });
});

// GET /api/invoices?status=&class=&student=
export const getInvoices = asyncHandler(async (req, res) => {
  const { status, class: className, student } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (className) filter.class = className;
  if (student) filter.student = student;

  const invoices = await Invoice.find(filter)
    .populate("student", "name admissionNo class section parentName parentPhone parentEmail")
    .sort({ createdAt: -1 });
  res.json({ invoices });
});

export const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id).populate("student");
  if (!invoice) throw new ApiError(404, "Invoice not found");
  res.json({ invoice });
});

// GET /api/invoices/student/:studentId
export const getStudentInvoices = asyncHandler(async (req, res) => {
  const invoices = await Invoice.find({ student: req.params.studentId })
    .populate("student", "name admissionNo class section")
    .sort({ createdAt: -1 });
  for (const inv of invoices) await syncInvoiceLateFee(inv); // keep late fees current
  res.json({ invoices });
});

// POST /api/invoices/:id/concession  { reason, amount }
export const applyConcession = asyncHandler(async (req, res) => {
  const { reason, amount } = req.body;
  if (!reason || !amount) throw new ApiError(400, "Reason and amount are required");
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw new ApiError(404, "Invoice not found");

  invoice.concessions.push({ reason, amount: Number(amount) });
  await invoice.save();
  logAudit(
    req,
    AUDIT.ADJUSTMENT,
    `Concession ₹${Number(amount)} on ${invoice.periodLabel} (Class ${invoice.class}) — ${reason}`
  );
  res.json({ message: "Concession applied", invoice });
});

// DELETE /api/invoices/:id/concession/:index  -> undo a mistaken concession
export const removeConcession = asyncHandler(async (req, res) => {
  const idx = Number(req.params.index);
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw new ApiError(404, "Invoice not found");
  if (Number.isNaN(idx) || idx < 0 || idx >= invoice.concessions.length) {
    throw new ApiError(400, "That concession no longer exists");
  }
  const removed = invoice.concessions[idx];
  invoice.concessions.splice(idx, 1);
  await invoice.save();
  logAudit(
    req,
    AUDIT.ADJUSTMENT,
    `Removed concession ₹${removed.amount} on ${invoice.periodLabel} (Class ${invoice.class})`
  );
  res.json({ message: "Concession removed", invoice });
});

// POST /api/invoices/:id/fine  { amount }  (absolute fine amount; 0 to waive)
export const applyFine = asyncHandler(async (req, res) => {
  const { amount } = req.body;
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw new ApiError(404, "Invoice not found");

  const fine = Number(amount);
  if (!Number.isFinite(fine) || fine < 0) {
    throw new ApiError(400, "Fine must be 0 or a positive amount");
  }
  invoice.fineAmount = fine;
  await invoice.save();
  logAudit(
    req,
    AUDIT.ADJUSTMENT,
    `Fine set to ₹${invoice.fineAmount} on ${invoice.periodLabel} (Class ${invoice.class})`
  );
  res.json({ message: "Fine updated", invoice });
});
