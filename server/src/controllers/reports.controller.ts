import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Invoice } from "../models/Invoice";
import { Payment } from "../models/Payment";
import { Student } from "../models/Student";
import { CLASSES, CURRENT_SESSION, prevSession } from "../utils/academics";
import { runLateFeeSweep } from "../utils/lateFee";
import { logAudit, AUDIT } from "../utils/audit";
import { env } from "../config/env";
import { sendMail } from "../config/mailer";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// GET /api/reports/defaulters?search=&class=
export const getDefaulters = asyncHandler(async (req, res) => {
  await runLateFeeSweep(); // make sure overdue late fees are up to date first

  const { search, class: className } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { dueAmount: { $gt: 0 } };
  if (className) filter.class = className;
  if (search) {
    const ids = (
      await Student.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { admissionNo: { $regex: search, $options: "i" } },
          { parentName: { $regex: search, $options: "i" } },
          { parentPhone: { $regex: search, $options: "i" } },
        ],
      }).select("_id")
    ).map((s) => s._id);
    filter.student = { $in: ids };
  }

  const defaulters = await Invoice.find(filter)
    .populate("student", "name admissionNo class section parentName parentPhone parentEmail")
    .sort({ dueAmount: -1 });
  res.json({ defaulters });
});

// GET /api/reports/collection?from=&to=&mode=&search=&page=&limit=
// Paginated payments list; the summary totals are computed over the FULL filtered
// set (not just the current page).
export const getCollectionReport = asyncHandler(async (req, res) => {
  const { from, to, mode, search } = req.query as Record<string, string>;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 30));

  const filter: Record<string, unknown> = { voided: { $ne: true } };
  if (mode) filter.mode = mode;
  if (from || to) {
    // IST day boundaries so a day's totals match the IST dates shown in the UI
    // (a payment at 7 PM IST belongs to that day, not the next UTC day).
    const range: Record<string, Date> = {};
    if (from) range.$gte = new Date(`${from}T00:00:00.000+05:30`);
    if (to) range.$lte = new Date(`${to}T23:59:59.999+05:30`);
    filter.createdAt = range;
  }
  if (search) {
    const ids = (
      await Student.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { admissionNo: { $regex: search, $options: "i" } },
        ],
      }).select("_id")
    ).map((s) => s._id);
    filter.$or = [{ receiptNo: { $regex: search, $options: "i" } }, { student: { $in: ids } }];
  }

  // Summary across the whole filtered set.
  const grouped = await Payment.aggregate([
    { $match: filter },
    { $group: { _id: "$mode", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);
  const byMode: Record<string, number> = {};
  let total = 0;
  let count = 0;
  grouped.forEach((g) => {
    byMode[g._id] = g.amount;
    total += g.amount;
    count += g.count;
  });

  const payments = await Payment.find(filter)
    .populate("student", "name admissionNo class")
    .populate("collectedBy", "name")
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  res.json({
    payments,
    summary: { total, count, byMode },
    total: count,
    page,
    pages: Math.max(1, Math.ceil(count / limit)),
    limit,
  });
});

// GET /api/reports/analytics?session=&class=
// Charts + counts for the analytics page: monthly collection, class distribution,
// and student movement (new admissions, left, passed/promoted, failed/retained,
// graduated) for the chosen academic year (Apr–Mar) and optional class.
export const getAnalytics = asyncHandler(async (req, res) => {
  const { class: className } = req.query as Record<string, string>;
  let { session } = req.query as Record<string, string>;

  if (!session) {
    const sessions: string[] = await Student.distinct("session");
    sessions.sort();
    session = sessions[sessions.length - 1] || CURRENT_SESSION;
  }

  const startYear = parseInt(session.split("-")[0], 10) || new Date().getFullYear();
  // Academic year window: Apr 1 (startYear) .. Mar 31 (startYear + 1).
  const windowStart = new Date(startYear, 3, 1, 0, 0, 0);
  const windowEnd = new Date(startYear + 1, 2, 31, 23, 59, 59);
  const classMatch = className ? { class: className } : {};

  // ---- Monthly collection (Apr..Mar of the selected year) ----
  const pipeline: any[] = [
    { $match: { voided: { $ne: true }, createdAt: { $gte: windowStart, $lte: windowEnd } } },
  ];
  if (className) {
    pipeline.push(
      { $lookup: { from: "students", localField: "student", foreignField: "_id", as: "stu" } },
      { $unwind: "$stu" },
      { $match: { "stu.class": className } }
    );
  }
  pipeline.push({
    $group: {
      _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } },
      amount: { $sum: "$amount" },
    },
  });
  const rows = await Payment.aggregate(pipeline);
  const amtByKey = new Map<string, number>();
  rows.forEach((r) => amtByKey.set(`${r._id.y}-${r._id.m}`, r.amount));

  const monthlyCollection = [];
  for (let i = 0; i < 12; i++) {
    const monthIndex = (3 + i) % 12; // Apr .. Mar
    const year = monthIndex >= 3 ? startYear : startYear + 1;
    monthlyCollection.push({
      label: `${MONTHS_SHORT[monthIndex]} ${String(year).slice(2)}`,
      amount: amtByKey.get(`${year}-${monthIndex + 1}`) || 0,
    });
  }

  // ---- Passed (promoted) vs failed (retained), derived from enrollment history ----
  const prev = prevSession(session);
  const advanced = await Student.find({ session, ...classMatch }).select("class enrollmentHistory");
  let promoted = 0;
  let retained = 0;
  for (const s of advanced) {
    const last = s.enrollmentHistory[s.enrollmentHistory.length - 1];
    if (last && last.session === prev) {
      const from = CLASSES.indexOf(last.class);
      const to = CLASSES.indexOf(s.class);
      if (from !== -1 && to !== -1) {
        if (to > from) promoted += 1;
        else if (to === from) retained += 1;
      }
    }
  }

  const [totalActive, newAdmissions, leftSchool, graduated] = await Promise.all([
    Student.countDocuments({ status: "active", ...classMatch }),
    Student.countDocuments({ dateOfAdmission: { $gte: windowStart, $lte: windowEnd }, ...classMatch }),
    Student.countDocuments({
      status: "left",
      exitReason: { $not: { $regex: "Graduated", $options: "i" } },
      exitDate: { $gte: windowStart, $lte: windowEnd },
      ...classMatch,
    }),
    Student.countDocuments({
      status: "left",
      exitReason: { $regex: "Graduated", $options: "i" },
      exitDate: { $gte: windowStart, $lte: windowEnd },
      ...classMatch,
    }),
  ]);

  // ---- Class distribution (all active students, ordered by the class ladder) ----
  const dist = await Student.aggregate([
    { $match: { status: "active" } },
    { $group: { _id: "$class", count: { $sum: 1 } } },
  ]);
  const distMap = new Map<string, number>();
  dist.forEach((d) => distMap.set(d._id, d.count));
  const classDistribution = CLASSES.map((c) => ({ class: c, count: distMap.get(c) || 0 })).filter(
    (c) => c.count > 0
  );

  res.json({
    session,
    monthlyCollection,
    stats: { totalActive, newAdmissions, leftSchool, promoted, retained, graduated },
    classDistribution,
  });
});

// POST /api/reports/reminder/:invoiceId  -> email the parent about dues
export const sendReminder = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.invoiceId).populate("student");
  if (!invoice) throw new ApiError(404, "Invoice not found");

  const student = invoice.student as any;
  const email = student?.parentEmail;
  if (!email) throw new ApiError(400, "No parent email on file for this student");

  await sendMail(
    email,
    "School Fee Reminder",
    `<div style="font-family:Arial,sans-serif">
      <h2 style="color:#2C6FE6">${env.schoolName} — Fee Reminder</h2>
      <p>Dear ${student.parentName || "Parent"},</p>
      <p>This is a gentle reminder that an amount of <strong>₹${invoice.dueAmount}</strong>
      is due for <strong>${student.name}</strong> (Class ${student.class}).</p>
      <p>Please clear the dues at your earliest convenience. You can pay online through the parent portal or at the school counter.</p>
      <p>Thank you,<br/>${env.schoolName}</p>
    </div>`
  );

  logAudit(req, AUDIT.REMINDER, `Reminder sent to ${student.name}'s parent`);
  res.json({ message: "Reminder sent" });
});

// POST /api/reports/remind-all -> email every defaulting parent (one mail per parent,
// summing all their children's dues). Students without a parent email are skipped.
export const remindAllDefaulters = asyncHandler(async (req, res) => {
  await runLateFeeSweep();

  const invoices = await Invoice.find({ dueAmount: { $gt: 0 } }).populate(
    "student",
    "name class parentName parentEmail"
  );

  // Aggregate dues per parent email.
  type Defaulter = {
    name: string;
    total: number;
    children: { name: string; class: string; due: number }[];
  };
  const byEmail = new Map<string, Defaulter>();
  let noEmail = 0;
  for (const inv of invoices) {
    const s = inv.student as any;
    if (!s?.parentEmail) {
      noEmail += 1;
      continue;
    }
    let entry = byEmail.get(s.parentEmail);
    if (!entry) {
      entry = { name: s.parentName || "Parent", total: 0, children: [] };
      byEmail.set(s.parentEmail, entry);
    }
    entry.total += inv.dueAmount;
    entry.children.push({ name: s.name, class: s.class, due: inv.dueAmount });
  }

  const sends = [...byEmail.entries()].map(([email, e]) => {
    const rows = e.children
      .map(
        (c) =>
          `<tr><td style="padding:4px 8px">${c.name} (Class ${c.class})</td><td style="padding:4px 8px;text-align:right">₹${c.due}</td></tr>`
      )
      .join("");
    return sendMail(
      email,
      "School Fee Reminder",
      `<div style="font-family:Arial,sans-serif">
        <h2 style="color:#2C6FE6">${env.schoolName} — Fee Reminder</h2>
        <p>Dear ${e.name},</p>
        <p>The following fees are currently due:</p>
        <table style="border-collapse:collapse">${rows}</table>
        <p style="margin-top:8px"><strong>Total due: ₹${e.total}</strong></p>
        <p>Please clear the dues via the parent portal or at the school counter.</p>
        <p>Thank you,<br/>${env.schoolName}</p>
      </div>`
    );
  });

  const results = await Promise.allSettled(sends);
  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;

  if (sent) logAudit(req, AUDIT.REMINDER, `Bulk reminder sent to ${sent} parent(s)`);

  res.json({
    message: `Reminders sent to ${sent} parent(s)${
      failed ? `, ${failed} failed` : ""
    }${noEmail ? `, ${noEmail} invoice(s) skipped (no parent email)` : ""}`,
    sent,
    failed,
    skipped: noEmail,
  });
});
