import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Subject } from "../models/Subject";
import { logAudit, AUDIT } from "../utils/audit";
import { moveToTrash } from "./trash.controller";

// GET /api/subjects?class=  (any staff — teachers pick from this list too)
export const getSubjects = asyncHandler(async (req, res) => {
  const cls = req.query.class ? String(req.query.class) : "";
  const filter: Record<string, unknown> = {};
  // Match subjects tagged for this class OR left untagged ("all classes") — an
  // empty applicableClasses means "available everywhere" (per the Subjects UI).
  if (cls) filter.$or = [{ applicableClasses: cls }, { applicableClasses: { $size: 0 } }];
  const subjects = await Subject.find(filter).sort({ order: 1, name: 1 });
  res.json({ subjects });
});

// POST /api/subjects  (super admin)
export const createSubject = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) throw new ApiError(400, "Subject name is required");

  const clean = String(name).trim();
  const exists = await Subject.findOne({ name: new RegExp(`^${clean}$`, "i") });
  if (exists) throw new ApiError(400, "A subject with this name already exists");

  const subject = await Subject.create({
    name: clean,
    code: req.body.code || undefined,
    applicableClasses: Array.isArray(req.body.applicableClasses) ? req.body.applicableClasses : [],
    order: Number.isFinite(req.body.order) ? req.body.order : 0,
  });
  logAudit(req, AUDIT.SUBJECT, `Added subject ${subject.name}`, {
    entity: "Subject",
    entityId: String(subject._id),
  });
  res.status(201).json({ message: "Subject added", subject });
});

// PUT /api/subjects/:id  (super admin)
export const updateSubject = asyncHandler(async (req, res) => {
  const subject = await Subject.findById(req.params.id);
  if (!subject) throw new ApiError(404, "Subject not found");

  if (req.body.name !== undefined) {
    const clean = String(req.body.name).trim();
    if (!clean) throw new ApiError(400, "Subject name is required");
    const clash = await Subject.findOne({
      _id: { $ne: subject._id },
      name: new RegExp(`^${clean}$`, "i"),
    });
    if (clash) throw new ApiError(400, "Another subject already uses this name");
    subject.name = clean;
  }
  if (req.body.code !== undefined) subject.code = req.body.code || undefined;
  if (Array.isArray(req.body.applicableClasses)) subject.applicableClasses = req.body.applicableClasses;
  if (req.body.order !== undefined && Number.isFinite(Number(req.body.order))) {
    subject.order = Number(req.body.order);
  }
  if (req.body.isActive !== undefined) subject.isActive = !!req.body.isActive;

  await subject.save();
  logAudit(req, AUDIT.SUBJECT, `Updated subject ${subject.name}`, {
    entity: "Subject",
    entityId: String(subject._id),
  });
  res.json({ message: "Subject updated", subject });
});

// DELETE /api/subjects/:id  -> recycle bin (restorable). Past exams keep their own
// snapshot of the name + marks, so deleting a subject never breaks old results.
export const deleteSubject = asyncHandler(async (req, res) => {
  const subject = await Subject.findById(req.params.id);
  if (!subject) throw new ApiError(404, "Subject not found");
  const name = subject.name;
  await moveToTrash(req, "Subject", subject, name);
  logAudit(req, AUDIT.SUBJECT, `Deleted subject ${name} — recoverable from recycle bin`);
  res.json({ message: "Subject moved to recycle bin" });
});

// POST /api/subjects/import  { subjects: [{ name, code?, classes? }] }  (super admin)
// `classes` is a semicolon/comma separated list, e.g. "9;10;11;12". Upserts by name.
export const importSubjects = asyncHandler(async (req, res) => {
  const rows = req.body.subjects;
  if (!Array.isArray(rows)) throw new ApiError(400, "Expected { subjects: [...] }");

  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    try {
      const name = row.name != null ? String(row.name).trim() : "";
      if (!name) {
        errors.push(`Row ${i + 1}: name is required`);
        continue;
      }
      const classes = String(row.classes || row.applicableClasses || "")
        .split(/[;,]/)
        .map((c: string) => c.trim())
        .filter(Boolean);

      const existing = await Subject.findOne({ name: new RegExp(`^${name}$`, "i") });
      if (existing) {
        if (row.code != null && String(row.code).trim()) existing.code = String(row.code).trim();
        if (classes.length) existing.applicableClasses = classes;
        await existing.save();
        updated += 1;
      } else {
        await Subject.create({
          name,
          code: row.code ? String(row.code).trim() : undefined,
          applicableClasses: classes,
          order: Number.isFinite(Number(row.order)) ? Number(row.order) : 0,
        });
        inserted += 1;
      }
    } catch (err: any) {
      errors.push(`Row ${i + 1}: ${err.message}`);
    }
  }

  if (inserted || updated) {
    logAudit(req, AUDIT.SUBJECT, `Imported subjects: ${inserted} added, ${updated} updated`);
  }
  res.json({
    message: `Imported ${inserted} new, updated ${updated}${errors.length ? `, ${errors.length} error(s)` : ""}.`,
    inserted,
    updated,
    errors,
  });
});
