import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Invoice } from "../models/Invoice";
import { FeeStructure, IFeeStructure } from "../models/FeeStructure";
import { Student } from "../models/Student";
import { syncInvoiceLateFee } from "../utils/lateFee";
import { createPayment } from "../utils/collection";
import { logAudit, AUDIT } from "../utils/audit";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Generates the given month's invoices for one fee structure. IDEMPOTENT: a student
// who already has an invoice for this (structure, period) is skipped — so the same
// month for the same class can never be generated twice / duplicated.
// `includeItems` (optional) restricts the month to just those fee heads by name —
// so a class set up once with its full fee menu can be billed selectively (e.g.
// Tuition + Transport every month, Exam Fee only in exam months). When omitted or
// empty, every item in the structure is billed (the original behaviour).
async function generateForStructure(
  structure: IFeeStructure,
  m: number,
  y: number,
  dueDate?: string,
  includeItems?: string[]
) {
  const include = includeItems?.length
    ? new Set(includeItems.map((n) => String(n).trim().toLowerCase()))
    : null;
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
    // One invoice per student per month, PERIOD — not per structure. If the class
    // ever ends up with two structures for the same session (e.g. one created
    // instead of edited), checking by structure would bill the student once per
    // structure, double-counting shared items like Transport. Any existing invoice
    // for this month in this session means the student is already billed: skip.
    const exists = await Invoice.findOne({
      student: student._id,
      period,
      academicYear: structure.academicYear,
    });
    if (exists) {
      skipped += 1;
      continue;
    }

    // Mandatory items for all; optional items only if the student opted in.
    // A per-student override (e.g. a custom Transport fee) wins over the class amount.
    const opted = student.optedServices || [];
    const overrides = new Map((student.serviceFees || []).map((f) => [f.name, f.amount]));
    const items = structure.items
      .filter((i) => !include || include.has(i.name.trim().toLowerCase()))
      .filter((i) => !i.optional || opted.includes(i.name))
      .map((i) => ({
        name: i.name,
        amount: i.optional && overrides.has(i.name) ? Number(overrides.get(i.name)) : i.amount,
      }));

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
    let saved = false;
    try {
      await invoice.save();
      created += 1;
      saved = true;
    } catch (err: any) {
      // Unique index (student, feeStructure, period) — a concurrent run already
      // created this one. Treat as skipped rather than duplicating.
      if (err?.code === 11000) skipped += 1;
      else throw err;
    }

    // Auto-settle from the student's advance credit (e.g. a prepaid year): draw
    // down onto this fresh invoice and record it as a "credit" payment.
    if (saved && (student.creditBalance || 0) > 0 && invoice.dueAmount > 0) {
      const use = Math.min(student.creditBalance, invoice.dueAmount);
      if (use > 0) {
        await createPayment({
          student: student._id,
          invoice: invoice._id,
          allocations: [
            {
              invoice: invoice._id,
              period: invoice.period,
              periodLabel: invoice.periodLabel,
              amount: use,
            },
          ],
          amount: use,
          mode: "credit",
          note: "Auto-applied from advance credit",
        });
        invoice.paidAmount += use;
        await invoice.save();
        student.creditBalance -= use;
        await student.save();
      }
    }
  }

  return { created, skipped, total: students.length, period, periodLabel };
}

// POST /api/invoices/generate  { feeStructureId, month (1-12), year, dueDate? }
// Generates one class's month (single fee structure).
export const generateInvoices = asyncHandler(async (req, res) => {
  const { feeStructureId, month, year, dueDate, includeItems } = req.body;
  const m = Number(month);
  const y = Number(year);
  if (!m || m < 1 || m > 12 || !y) {
    throw new ApiError(400, "Please provide a valid month and year");
  }
  if (includeItems !== undefined && !Array.isArray(includeItems)) {
    throw new ApiError(400, "includeItems must be a list of fee names");
  }
  if (Array.isArray(includeItems) && includeItems.length === 0) {
    throw new ApiError(400, "Select at least one fee to include in this month");
  }

  const structure = await FeeStructure.findById(feeStructureId);
  if (!structure) throw new ApiError(404, "Fee structure not found");

  const { created, skipped, total, periodLabel } = await generateForStructure(
    structure,
    m,
    y,
    dueDate,
    includeItems
  );

  const message = `Generated ${created} invoice(s) for ${periodLabel} (Class ${structure.class})${
    skipped ? `, skipped ${skipped} already generated` : ""
  }`;
  if (created) {
    logAudit(
      req,
      AUDIT.FEE_GENERATION,
      `${message}${includeItems?.length ? ` — fees: ${includeItems.join(", ")}` : ""}`
    );
  }

  res.json({ message, created, skipped, totalStudents: total });
});

// POST /api/invoices/generate-bulk  { month (1-12), year, dueDate?, includeItems?, classes? }
// Generates the chosen month for every fee structure, or just the classes named in
// `classes` — so a fee that only applies to some classes (an Exam Fee in a month
// when only Class 2 sits an exam) can be billed to those classes alone.
// Classes already generated for that month are skipped automatically (no duplicates).
export const generateBulkInvoices = asyncHandler(async (req, res) => {
  const { month, year, dueDate, includeItems, classes } = req.body;
  const m = Number(month);
  const y = Number(year);
  if (!m || m < 1 || m > 12 || !y) {
    throw new ApiError(400, "Please provide a valid month and year");
  }
  if (includeItems !== undefined && !Array.isArray(includeItems)) {
    throw new ApiError(400, "includeItems must be a list of fee names");
  }
  if (Array.isArray(includeItems) && includeItems.length === 0) {
    throw new ApiError(400, "Select at least one fee to include in this month");
  }
  if (classes !== undefined && !Array.isArray(classes)) {
    throw new ApiError(400, "classes must be a list of class names");
  }
  const classList = Array.isArray(classes)
    ? [...new Set(classes.map((c: unknown) => String(c ?? "").trim()).filter(Boolean))]
    : null;
  if (classList && classList.length === 0) {
    throw new ApiError(400, "Select at least one class to generate for");
  }

  // Omitting `classes` keeps the original behaviour: every class that has a structure.
  const structures = await FeeStructure.find(
    classList ? { class: { $in: classList } } : {}
  ).sort({ class: 1 });
  if (structures.length === 0) {
    throw new ApiError(
      400,
      classList
        ? `No fee structure exists for ${classList.join(", ")}. Create it in Fee Setup first.`
        : "No fee structures found. Create fee structures first."
    );
  }

  let totalCreated = 0;
  let totalSkipped = 0;
  const results = [];
  for (const s of structures) {
    const r = await generateForStructure(s, m, y, dueDate, includeItems);
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
  if (totalCreated) {
    logAudit(
      req,
      AUDIT.FEE_GENERATION,
      `Bulk generation — ${message}${
        classList ? ` — classes: ${classList.join(", ")}` : ""
      }${includeItems?.length ? ` — fees: ${includeItems.join(", ")}` : ""}`
    );
  }

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
// Deletes a generated run — all invoices for one class in one month, or, when
// class is omitted, the ENTIRE month across every class (undo a whole bulk
// generation in one go). Invoices that already have a payment or a manual
// adjustment are KEPT (skipped) so no collected money / receipt is ever lost.
export const deleteInvoiceRun = asyncHandler(async (req, res) => {
  const { period, class: className, session } = req.query as Record<string, string>;
  if (!period) throw new ApiError(400, "period is required");

  const filter: Record<string, unknown> = { period };
  if (className) filter.class = className;
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
      className
        ? `Deleted generated fee for Class ${className} · ${period} (${deleted} invoice(s))`
        : `Undid the whole fee generation for ${period} — all classes (${deleted} invoice(s))`
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
  const student = await Student.findById(req.params.studentId).select("creditBalance");
  res.json({ invoices, creditBalance: student?.creditBalance || 0 });
});

// POST /api/invoices/:id/concession  { reason, amount }
export const applyConcession = asyncHandler(async (req, res) => {
  const { reason, amount } = req.body;
  const amt = Number(amount);
  if (!reason || !amt || amt <= 0) {
    throw new ApiError(400, "Reason and a valid amount are required");
  }
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw new ApiError(404, "Invoice not found");

  // A concession can't discount more than what's actually billable (guards against
  // a mistyped extra zero zeroing out a big invoice).
  const maxAddable = Math.max(
    0,
    invoice.totalAmount + invoice.fineAmount + (invoice.lateFee || 0) - invoice.discountAmount
  );
  if (amt > maxAddable) {
    throw new ApiError(400, `Concession can't exceed the remaining billable amount (₹${maxAddable})`);
  }

  invoice.concessions.push({ reason, amount: amt });
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
