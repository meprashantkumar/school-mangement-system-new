import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { logAudit, AUDIT } from "../utils/audit";
import { FeeHead } from "../models/FeeHead";
import { FeeStructure, StructureItem } from "../models/FeeStructure";
import { moveToTrash } from "./trash.controller";

/* ---------------- Fee Heads ---------------- */

export const getFeeHeads = asyncHandler(async (_req, res) => {
  const feeHeads = await FeeHead.find().sort({ createdAt: -1 });
  res.json({ feeHeads });
});

export const createFeeHead = asyncHandler(async (req, res) => {
  const { name, description, optional } = req.body;
  if (!name) throw new ApiError(400, "Name is required");
  const feeHead = await FeeHead.create({ name, description, optional: !!optional });
  logAudit(req, AUDIT.FEE_SETUP, `Created fee head "${feeHead.name}"${feeHead.optional ? " (optional)" : ""}`);
  res.status(201).json({ message: "Fee head created", feeHead });
});

export const updateFeeHead = asyncHandler(async (req, res) => {
  const feeHead = await FeeHead.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!feeHead) throw new ApiError(404, "Fee head not found");
  logAudit(req, AUDIT.FEE_SETUP, `Updated fee head "${feeHead.name}"`);
  res.json({ message: "Fee head updated", feeHead });
});

export const deleteFeeHead = asyncHandler(async (req, res) => {
  const feeHead = await FeeHead.findById(req.params.id);
  if (!feeHead) throw new ApiError(404, "Fee head not found");
  const name = feeHead.name;
  await moveToTrash(req, "FeeHead", feeHead, name);
  logAudit(req, AUDIT.FEE_SETUP, `Deleted fee head "${name}" — recoverable from recycle bin`);
  res.json({ message: "Fee head moved to recycle bin" });
});

/* ---------------- Fee Structures ---------------- */

export const getFeeStructures = asyncHandler(async (_req, res) => {
  const structures = await FeeStructure.find().sort({ createdAt: -1 });
  res.json({ structures });
});

export const getFeeStructure = asyncHandler(async (req, res) => {
  const structure = await FeeStructure.findById(req.params.id);
  if (!structure) throw new ApiError(404, "Fee structure not found");
  res.json({ structure });
});

export const createFeeStructure = asyncHandler(async (req, res) => {
  const { name, class: className, academicYear, items } = req.body;
  if (!name || !className || !academicYear) {
    throw new ApiError(400, "Name, class and academic year are required");
  }
  const structure = await FeeStructure.create({
    name,
    class: className,
    academicYear,
    items: items || [],
  });
  logAudit(req, AUDIT.FEE_SETUP, `Created fee structure "${structure.name}" for Class ${structure.class}`);
  res.status(201).json({ message: "Fee structure created", structure });
});

export const updateFeeStructure = asyncHandler(async (req, res) => {
  const structure = await FeeStructure.findById(req.params.id);
  if (!structure) throw new ApiError(404, "Fee structure not found");

  const { name, class: className, academicYear, items } = req.body;
  if (name !== undefined) structure.name = name;
  if (className !== undefined) structure.class = className;
  if (academicYear !== undefined) structure.academicYear = academicYear;
  if (items !== undefined) structure.items = items;

  await structure.save();
  logAudit(req, AUDIT.FEE_SETUP, `Updated fee structure "${structure.name}" (Class ${structure.class})`);
  res.json({ message: "Fee structure updated", structure });
});

// Create/update many class structures for one academic year in a single request.
// Upsert keyed on class + academicYear: existing classes are updated (name kept),
// missing ones are created with an auto-name. Classes not sent are left untouched
// (unticking in the UI just skips a class — it never deletes an existing structure).
export const bulkUpsertFeeStructures = asyncHandler(async (req, res) => {
  const { academicYear, rows } = req.body as {
    academicYear?: string;
    rows?: { class?: string; name?: string; items?: StructureItem[] }[];
  };
  if (!academicYear) throw new ApiError(400, "Academic year is required");
  if (!Array.isArray(rows) || rows.length === 0) throw new ApiError(400, "No classes to save");

  let created = 0;
  let updated = 0;
  const touched: string[] = [];

  for (const row of rows) {
    const className = String(row.class || "").trim();
    if (!className) continue;

    const items = (row.items || [])
      .filter((i) => i && i.name && String(i.name).trim() && Number(i.amount) > 0)
      .map((i) => ({ name: i.name, amount: Number(i.amount), optional: !!i.optional }));
    if (items.length === 0) continue; // don't create empty structures

    let structure = await FeeStructure.findOne({ class: className, academicYear });
    if (structure) {
      structure.items = items as StructureItem[];
      if (row.name) structure.name = row.name;
      await structure.save();
      updated++;
    } else {
      const label = /^\d/.test(className) ? `Class ${className}` : className;
      await FeeStructure.create({
        name: row.name || `${label} Fees ${academicYear}`,
        class: className,
        academicYear,
        items,
      });
      created++;
    }
    touched.push(className);
  }

  logAudit(
    req,
    AUDIT.FEE_SETUP,
    `Bulk fee setup (${academicYear}): ${created} created, ${updated} updated — ${touched.join(", ") || "none"}`
  );
  res.json({
    message: `Saved ${created + updated} class structure(s) (${created} new, ${updated} updated)`,
    created,
    updated,
  });
});

export const deleteFeeStructure = asyncHandler(async (req, res) => {
  const structure = await FeeStructure.findById(req.params.id);
  if (!structure) throw new ApiError(404, "Fee structure not found");
  const label = `${structure.name} (Class ${structure.class})`;
  await moveToTrash(req, "FeeStructure", structure, label);
  logAudit(req, AUDIT.FEE_SETUP, `Deleted fee structure "${label}" — recoverable from recycle bin`);
  res.json({ message: "Fee structure moved to recycle bin" });
});
