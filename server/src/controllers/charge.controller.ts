import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { ChargeItem } from "../models/ChargeItem";
import { Invoice } from "../models/Invoice";
import { Student } from "../models/Student";
import { CURRENT_SESSION } from "../utils/academics";
import { logAudit, AUDIT } from "../utils/audit";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const rupees = (n: number) => `₹${Math.round(n)}`;

// ---------- the catalogue ----------

// GET /api/charges/items
export const getChargeItems = asyncHandler(async (_req, res) => {
  const items = await ChargeItem.find().sort({ name: 1 });
  res.json({ chargeItems: items });
});

// POST /api/charges/items  { name, amount }
export const createChargeItem = asyncHandler(async (req, res) => {
  const name = String(req.body.name ?? "").trim();
  const amount = Number(req.body.amount);
  if (!name) throw new ApiError(400, "An item name is required");
  if (!Number.isFinite(amount) || amount < 0) throw new ApiError(400, "Enter a valid price");

  const clash = await ChargeItem.findOne({ name }).collation({ locale: "en", strength: 2 });
  if (clash) throw new ApiError(400, `"${clash.name}" is already in the list`);

  const item = await ChargeItem.create({ name, amount });
  logAudit(req, AUDIT.FEE_SETUP, `Added chargeable item "${item.name}" at ${rupees(item.amount)}`);
  res.status(201).json({ message: "Item added", chargeItem: item });
});

// PUT /api/charges/items/:id  { name?, amount?, isActive? }
export const updateChargeItem = asyncHandler(async (req, res) => {
  const item = await ChargeItem.findById(req.params.id);
  if (!item) throw new ApiError(404, "Item not found");

  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) throw new ApiError(400, "An item name is required");
    const clash = await ChargeItem.findOne({ name, _id: { $ne: item._id } }).collation({
      locale: "en",
      strength: 2,
    });
    if (clash) throw new ApiError(400, `"${clash.name}" is already in the list`);
    item.name = name;
  }
  if (req.body.amount !== undefined) {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new ApiError(400, "Enter a valid price");
    item.amount = amount;
  }
  if (req.body.isActive !== undefined) item.isActive = !!req.body.isActive;

  await item.save();
  logAudit(req, AUDIT.FEE_SETUP, `Updated chargeable item "${item.name}" (${rupees(item.amount)})`);
  res.json({ message: "Item updated", chargeItem: item });
});

// DELETE /api/charges/items/:id
// Only removes it from the pick-list. Charges already on a bill are history and are
// deliberately untouched — a receipt must not change because a price list did.
export const deleteChargeItem = asyncHandler(async (req, res) => {
  const item = await ChargeItem.findByIdAndDelete(req.params.id);
  if (!item) throw new ApiError(404, "Item not found");
  logAudit(req, AUDIT.FEE_SETUP, `Removed chargeable item "${item.name}" from the list`);
  res.json({ message: "Item removed" });
});

// ---------- charging a student ----------

// Ad-hoc charges get their OWN invoice for the month rather than being appended to
// the month's fee bill. Two reasons, both of which bite otherwise:
//
//  1. Late fees. computeLateFee() only accrues while the fee itself is unpaid, so
//     adding a tie to a settled-but-overdue April bill would make it owing again and
//     restart the daily late fee — on April's due date. This invoice carries NO due
//     date, so no late fee can ever attach to a tie.
//  2. Fee generation. Generating a month skips a student who already has an invoice
//     for it, and undoing a month deletes that month's invoices. Both now ignore
//     invoices with no fee structure (see invoice.controller.ts), so a purchase can
//     neither block the real billing nor be wiped by re-running it.
//
// One extras invoice per student per month, accumulating items, so a tie and a book
// bought in the same month read as one line on the parent's account.
const extrasInvoiceFor = async (studentId: string, cls: string, session: string) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const period = `${y}-${String(m).padStart(2, "0")}`;

  const existing = await Invoice.findOne({
    student: studentId,
    period,
    academicYear: session,
    feeStructure: { $exists: false },
  });
  if (existing) return existing;

  return new Invoice({
    student: studentId,
    academicYear: session,
    class: cls,
    period,
    periodLabel: `Extra charges — ${MONTHS[m - 1]} ${y}`,
    // deliberately no dueDate — see above
    items: [],
    concessions: [],
  });
};

// POST /api/charges  { studentId, name, unitAmount, qty? }
export const addCharge = asyncHandler(async (req, res) => {
  const { studentId, name, unitAmount, qty } = req.body;
  const label = String(name ?? "").trim();
  const unit = Number(unitAmount);
  const count = qty === undefined || qty === null || qty === "" ? 1 : Number(qty);

  if (!label) throw new ApiError(400, "What is the charge for?");
  if (!Number.isFinite(unit) || unit <= 0) throw new ApiError(400, "Enter a price above zero");
  if (!Number.isInteger(count) || count < 1 || count > 999) {
    throw new ApiError(400, "Quantity must be a whole number between 1 and 999");
  }

  const student = await Student.findById(studentId).select("name class section session admissionNo");
  if (!student) throw new ApiError(404, "Student not found");

  const invoice = await extrasInvoiceFor(
    String(student._id),
    student.class,
    student.session || CURRENT_SESSION
  );

  const amount = Math.round(unit * count);
  invoice.items.push({
    name: label,
    amount,
    manual: true,
    qty: count,
    unitAmount: unit,
    addedBy: req.user!._id as any,
    addedAt: new Date(),
  });
  await invoice.save();

  logAudit(
    req,
    AUDIT.CHARGE,
    `Charged ${student.name} (${student.admissionNo}) ${rupees(amount)} — ${label}` +
      `${count > 1 ? ` (${count} x ${rupees(unit)})` : ""}`,
    { entity: "Invoice", entityId: String(invoice._id) }
  );
  res.status(201).json({
    message: `${label} — ${rupees(amount)} added to the bill`,
    invoice,
  });
});

// DELETE /api/charges/:invoiceId/:index  -> undo a mistaken charge
export const removeCharge = asyncHandler(async (req, res) => {
  const idx = Number(req.params.index);
  const invoice = await Invoice.findById(req.params.invoiceId);
  if (!invoice) throw new ApiError(404, "Bill not found");
  if (Number.isNaN(idx) || idx < 0 || idx >= invoice.items.length) {
    throw new ApiError(400, "That charge no longer exists");
  }

  const line = invoice.items[idx];
  // Only hand-added charges can be taken off. A tuition line came from the fee
  // structure and has to be changed there, or the bill stops matching the structure.
  if (!line.manual) {
    throw new ApiError(400, "Only an extra charge can be removed here, not a fee line");
  }

  invoice.items.splice(idx, 1);

  // If the charge was already paid for, taking it off would leave the bill overpaid.
  // The pre-save hook floors dueAmount at 0, which would silently swallow the money —
  // so hand the difference back as advance credit, where it can be seen and spent.
  const newTotal = invoice.items.reduce((s, i) => s + (i.amount || 0), 0);
  const newNet = Math.max(
    0,
    newTotal - invoice.discountAmount + invoice.fineAmount + (invoice.lateFee || 0)
  );
  let refunded = 0;
  if (invoice.paidAmount > newNet) {
    refunded = invoice.paidAmount - newNet;
    invoice.paidAmount = newNet;
    const student = await Student.findById(invoice.student);
    if (student) {
      student.creditBalance = (student.creditBalance || 0) + refunded;
      await student.save();
    }
  }

  await invoice.save();
  logAudit(
    req,
    AUDIT.CHARGE,
    `Removed charge ${rupees(line.amount)} — ${line.name} from ${invoice.periodLabel}` +
      `${refunded ? `; ${rupees(refunded)} returned as advance credit` : ""}`,
    { entity: "Invoice", entityId: String(invoice._id) }
  );
  res.json({
    message: refunded
      ? `Charge removed. ${rupees(refunded)} moved to advance credit.`
      : "Charge removed",
    refunded,
    invoice,
  });
});

// GET /api/charges/report?from=YYYY-MM-DD&to=YYYY-MM-DD
// What the extras actually brought in.
//
// Money is attributed to the lines of a bill IN THE ORDER THEY WERE ADDED, oldest
// first, rather than spread across them proportionally. That matters because an
// extras bill grows during the month: pay ₹50 for an ID card on the 3rd, then buy a
// ₹1,000 sports kit on the 20th, and a proportional split would go back and decide
// that only ₹2 of the ID card was ever paid and ₹48 of the kit was — quietly
// re-attributing money that was collected before the kit existed. Oldest-first says
// what actually happened: the ID card is paid for, the kit is not.
//
// A concession settles a line without any money arriving, so it counts towards
// `outstanding` being cleared but never towards `collected`.
export const getChargesReport = asyncHandler(async (req, res) => {
  const { from, to } = req.query as Record<string, string>;
  const fromAt = from ? new Date(`${from}T00:00:00.000Z`) : null;
  const toAt = to ? new Date(`${to}T23:59:59.999Z`) : null;
  const inWindow = (at?: Date) => {
    if (!fromAt && !toAt) return true;
    if (!at) return false; // no timestamp — can't claim it falls in a window
    const t = new Date(at).getTime();
    return (!fromAt || t >= fromAt.getTime()) && (!toAt || t <= toAt.getTime());
  };

  const invoices = await Invoice.find({ "items.manual": true })
    .select("items paidAmount discountAmount")
    .lean();

  type Row = {
    name: string;
    qty: number;
    sales: number;
    billed: number;
    collected: number;
    outstanding: number;
  };
  const byName = new Map<string, Row>();

  for (const inv of invoices) {
    // Fee lines (no addedAt) are settled first, then charges in the order they were
    // added. Every line of the bill takes part, so a charge sitting on a bill that
    // also carries tuition is still attributed correctly.
    const ordered = [...inv.items].sort(
      (a, b) => (a.addedAt ? new Date(a.addedAt).getTime() : 0) - (b.addedAt ? new Date(b.addedAt).getTime() : 0)
    );

    let paidLeft = inv.paidAmount || 0;
    let waivedLeft = inv.discountAmount || 0;

    for (const line of ordered) {
      const amount = line.amount || 0;
      const collected = Math.min(amount, Math.max(0, paidLeft));
      paidLeft -= collected;
      const waived = Math.min(amount - collected, Math.max(0, waivedLeft));
      waivedLeft -= waived;

      if (!line.manual || !inWindow(line.addedAt)) continue;

      const row = byName.get(line.name) || {
        name: line.name,
        qty: 0,
        sales: 0,
        billed: 0,
        collected: 0,
        outstanding: 0,
      };
      row.qty += line.qty || 1;
      row.sales += 1;
      row.billed += amount;
      row.collected += collected;
      row.outstanding += amount - collected - waived;
      byName.set(line.name, row);
    }
  }

  const rows = [...byName.values()]
    .map((r) => ({
      ...r,
      billed: Math.round(r.billed),
      collected: Math.round(r.collected),
      outstanding: Math.round(r.outstanding),
    }))
    .sort((a, b) => b.billed - a.billed || a.name.localeCompare(b.name));

  const totals = rows.reduce(
    (t, r) => ({
      qty: t.qty + r.qty,
      sales: t.sales + r.sales,
      billed: t.billed + r.billed,
      collected: t.collected + r.collected,
      outstanding: t.outstanding + r.outstanding,
    }),
    { qty: 0, sales: 0, billed: 0, collected: 0, outstanding: 0 }
  );

  res.json({ from: from || null, to: to || null, rows, totals });
});
