import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Teacher, IAssignment } from "../models/Teacher";
import { User } from "../models/User";
import { CURRENT_SESSION } from "../utils/academics";
import { logAudit, AUDIT } from "../utils/audit";
import { moveToTrash } from "./trash.controller";

const GENDERS = ["Male", "Female", "Other"];

// Normalise incoming [{class, section}] into current-session assignments,
// dropping blanks and de-duping within the same teacher.
const normaliseAssignments = (raw: unknown): IAssignment[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: IAssignment[] = [];
  for (const a of raw) {
    const cls = a?.class != null ? String(a.class).trim() : "";
    const section = a?.section != null ? String(a.section).trim() : "";
    if (!cls || !section) continue;
    const key = `${cls}|${section}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ class: cls, section, session: CURRENT_SESSION });
  }
  return out;
};

// A class+section may only have one class-teacher per session. Throws (naming the
// owner) if any requested assignment is already held by another active teacher.
const assertAssignmentsFree = async (assignments: IAssignment[], excludeId?: string) => {
  for (const a of assignments) {
    const clash = await Teacher.findOne({
      _id: { $ne: excludeId },
      isActive: true,
      assignments: { $elemMatch: { class: a.class, section: a.section, session: CURRENT_SESSION } },
    });
    if (clash) {
      throw new ApiError(
        400,
        `Class ${a.class}-${a.section} is already the class of ${clash.name}. Remove it there first.`
      );
    }
  }
};

// GET /api/teachers?search=
export const getTeachers = asyncHandler(async (req, res) => {
  const { search } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { designation: { $regex: search, $options: "i" } },
    ];
  }
  const teachers = await Teacher.find(filter).sort({ name: 1 });
  res.json({ teachers });
});

// POST /api/teachers
export const createTeacher = asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) throw new ApiError(400, "Name and email are required");

  const normalisedEmail = String(email).toLowerCase().trim();
  const exists = await Teacher.findOne({ email: normalisedEmail });
  if (exists) throw new ApiError(400, "A teacher with this email already exists");

  const assignments = normaliseAssignments(req.body.assignments);
  await assertAssignmentsFree(assignments);

  // If a login already exists with this email, link it.
  const existingUser = await User.findOne({ email: normalisedEmail });

  const teacher = await Teacher.create({
    name: String(name).trim(),
    email: normalisedEmail,
    phone: req.body.phone,
    gender: GENDERS.includes(req.body.gender) ? req.body.gender : "",
    designation: req.body.designation,
    employeeCode: req.body.employeeCode,
    joiningDate: req.body.joiningDate || undefined,
    assignments,
    user: existingUser?._id,
  });

  // Upgrade an existing parent login to teacher immediately.
  if (existingUser && existingUser.role === "parent") {
    existingUser.role = "teacher";
    await existingUser.save({ validateBeforeSave: false });
  }

  logAudit(req, AUDIT.TEACHER, `Added teacher ${teacher.name} (${teacher.email})`, {
    entity: "Teacher",
    entityId: String(teacher._id),
  });
  res.status(201).json({ message: "Teacher added", teacher });
});

// PUT /api/teachers/:id
export const updateTeacher = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) throw new ApiError(404, "Teacher not found");

  if (req.body.assignments !== undefined) {
    const assignments = normaliseAssignments(req.body.assignments);
    await assertAssignmentsFree(assignments, String(teacher._id));
    teacher.assignments = assignments;
  }

  const fields = ["name", "phone", "designation", "employeeCode", "joiningDate", "isActive"] as const;
  fields.forEach((f) => {
    if (req.body[f] !== undefined) (teacher as any)[f] = req.body[f];
  });
  if (req.body.gender !== undefined) {
    teacher.gender = GENDERS.includes(req.body.gender) ? req.body.gender : "";
  }

  await teacher.save();
  logAudit(req, AUDIT.TEACHER, `Updated teacher ${teacher.name} (${teacher.email})`, {
    entity: "Teacher",
    entityId: String(teacher._id),
  });
  res.json({ message: "Teacher updated", teacher });
});

// DELETE /api/teachers/:id  -> recycle bin (restorable). Also reverts the linked
// login back to "parent" so repurposing a parent's email by mistake is undoable.
export const deleteTeacher = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) throw new ApiError(404, "Teacher not found");
  const { name, email } = teacher;

  const user = await User.findOne({ email });
  if (user && user.role === "teacher") {
    user.role = "parent";
    await user.save({ validateBeforeSave: false });
  }

  await moveToTrash(req, "Teacher", teacher, `${name} (${email})`);
  logAudit(req, AUDIT.TEACHER, `Deleted teacher ${name} (${email}) — recoverable from recycle bin`);
  res.json({ message: "Teacher moved to recycle bin" });
});

// POST /api/teachers/import  { teachers: [...] }
// Upserts by email (safe to re-run). An optional class+section column adds one
// initial assignment (only if that section is free).
export const importTeachers = asyncHandler(async (req, res) => {
  const rows = req.body.teachers;
  if (!Array.isArray(rows)) {
    throw new ApiError(400, "Expected a JSON body of the form { teachers: [...] }");
  }

  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const email = row.email != null ? String(row.email).toLowerCase().trim() : "";
    try {
      if (!row.name || !email) {
        errors.push(`Row ${i + 1}: name and email are required`);
        continue;
      }

      // Optional single assignment from class+section columns.
      let assignments: IAssignment[] | undefined;
      const cls = row.class != null ? String(row.class).trim() : "";
      const section = row.section != null ? String(row.section).trim() : "";
      if (cls && section) {
        assignments = normaliseAssignments([{ class: cls, section }]);
        await assertAssignmentsFree(assignments); // skip row on clash via catch below
      }

      // Only include fields actually present in the row, so a partial CSV never
      // blanks existing values on an update.
      const has = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";
      const doc: Record<string, unknown> = { name: String(row.name).trim() };
      if (has(row.phone)) doc.phone = String(row.phone);
      if (GENDERS.includes(row.gender)) doc.gender = row.gender;
      if (has(row.designation)) doc.designation = row.designation;
      if (has(row.employeeCode)) doc.employeeCode = String(row.employeeCode);
      if (assignments) doc.assignments = assignments;

      const existing = await Teacher.findOne({ email });
      if (existing) {
        Object.assign(existing, doc);
        await existing.save();
        updated += 1;
      } else {
        await Teacher.create({ email, ...doc });
        inserted += 1;
      }
    } catch (err: any) {
      errors.push(`Row ${i + 1} (${email || "?"}): ${err.message}`);
    }
  }

  if (inserted || updated) {
    logAudit(req, AUDIT.TEACHER, `Imported teachers: ${inserted} added, ${updated} updated`);
  }

  res.json({
    message: `Imported ${inserted} new, updated ${updated}${
      errors.length ? `, ${errors.length} error(s)` : ""
    }.`,
    inserted,
    updated,
    errors,
  });
});
