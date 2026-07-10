import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Staff } from "../models/Staff";
import { Teacher } from "../models/Teacher";
import { StaffAttendance } from "../models/StaffAttendance";
import { Holiday } from "../models/Holiday";
import { toDateKey, dateFromKey, isSundayKey } from "../utils/attendance";
import { logAudit, AUDIT } from "../utils/audit";
import { moveToTrash } from "./trash.controller";

const GENDERS = ["Male", "Female", "Other"];
const todayKey = () => new Date().toISOString().slice(0, 10);

// ---------- Staff CRUD (non-teaching employees) ----------

// GET /api/staff?search=
export const getStaff = asyncHandler(async (req, res) => {
  const { search } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { category: { $regex: search, $options: "i" } },
      { designation: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
    ];
  }
  const staff = await Staff.find(filter).sort({ category: 1, name: 1 });
  res.json({ staff });
});

// POST /api/staff
export const createStaff = asyncHandler(async (req, res) => {
  const { name, category } = req.body;
  if (!name) throw new ApiError(400, "Name is required");
  const staff = await Staff.create({
    name: String(name).trim(),
    category: category || "Other",
    designation: req.body.designation,
    phone: req.body.phone,
    gender: GENDERS.includes(req.body.gender) ? req.body.gender : "",
    employeeCode: req.body.employeeCode,
    joiningDate: req.body.joiningDate || undefined,
  });
  logAudit(req, AUDIT.STAFF, `Added staff ${staff.name} (${staff.category})`, {
    entity: "Staff",
    entityId: String(staff._id),
  });
  res.status(201).json({ message: "Staff added", staff });
});

// PUT /api/staff/:id
export const updateStaff = asyncHandler(async (req, res) => {
  const staff = await Staff.findById(req.params.id);
  if (!staff) throw new ApiError(404, "Staff not found");
  const fields = ["name", "category", "designation", "phone", "employeeCode", "joiningDate", "isActive"] as const;
  fields.forEach((f) => {
    if (req.body[f] !== undefined) (staff as any)[f] = req.body[f];
  });
  if (req.body.gender !== undefined) staff.gender = GENDERS.includes(req.body.gender) ? req.body.gender : "";
  await staff.save();
  logAudit(req, AUDIT.STAFF, `Updated staff ${staff.name}`, { entity: "Staff", entityId: String(staff._id) });
  res.json({ message: "Staff updated", staff });
});

// DELETE /api/staff/:id  -> recycle bin (restorable)
export const deleteStaff = asyncHandler(async (req, res) => {
  const staff = await Staff.findById(req.params.id);
  if (!staff) throw new ApiError(404, "Staff not found");
  const { name, category } = staff;
  await moveToTrash(req, "Staff", staff, `${name} (${category})`);
  logAudit(req, AUDIT.STAFF, `Deleted staff ${name} (${category}) — recoverable from recycle bin`);
  res.json({ message: "Staff moved to recycle bin" });
});

// POST /api/staff/import  { staff: [...] }
// Upserts by (name + category) so re-importing an exported sheet updates rows
// instead of creating duplicates. Only fields present in a row are written, so a
// partial sheet never blanks existing values.
export const importStaff = asyncHandler(async (req, res) => {
  const rows = req.body.staff;
  if (!Array.isArray(rows)) throw new ApiError(400, "Expected { staff: [...] }");
  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];
  const has = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    try {
      if (!has(row.name)) {
        errors.push(`Row ${i + 1}: name is required`);
        continue;
      }
      const name = String(row.name).trim();
      const category = has(row.category) ? String(row.category).trim() : "Other";

      const doc: Record<string, unknown> = {};
      if (has(row.designation)) doc.designation = String(row.designation).trim();
      if (has(row.phone)) doc.phone = String(row.phone);
      if (GENDERS.includes(row.gender)) doc.gender = row.gender;
      if (has(row.employeeCode)) doc.employeeCode = String(row.employeeCode);

      const existing = await Staff.findOne({ name, category });
      if (existing) {
        Object.assign(existing, doc);
        await existing.save();
        updated += 1;
      } else {
        await Staff.create({ name, category, ...doc });
        inserted += 1;
      }
    } catch (err: any) {
      errors.push(`Row ${i + 1}: ${err.message}`);
    }
  }
  if (inserted || updated) {
    logAudit(req, AUDIT.STAFF, `Imported staff: ${inserted} added, ${updated} updated`);
  }
  res.json({
    message: `Imported ${inserted} new, updated ${updated}${errors.length ? `, ${errors.length} error(s)` : ""}.`,
    inserted,
    updated,
    errors,
  });
});

// ---------- Staff attendance (teachers + non-teaching staff) ----------

const roundPct = (present: number, absent: number): number | null => {
  const total = present + absent;
  return total > 0 ? Math.round((present / total) * 100) : null;
};

// Per-person present/absent up to a day, excluding Sundays and named holidays.
const computeStaffRates = async (uptoKey: string) => {
  const holidayKeys = (await Holiday.find().select("dateKey")).map((h) => h.dateKey);
  const rows = await StaffAttendance.aggregate([
    { $match: { dateKey: { $lte: uptoKey, $nin: holidayKeys } } },
    { $match: { $expr: { $ne: [{ $dayOfWeek: "$date" }, 1] } } },
    {
      $group: {
        _id: "$person",
        present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
      },
    },
  ]);
  const map = new Map<string, { present: number; absent: number }>();
  rows.forEach((r) => map.set(String(r._id), { present: r.present, absent: r.absent }));
  return map;
};

const buildStaffRoster = async (dateKey: string) => {
  const holiday = await Holiday.findOne({ dateKey });
  const dayInfo = { sunday: isSundayKey(dateKey), holiday: !!holiday, holidayName: holiday?.name || null };

  const [teachers, staff] = await Promise.all([
    Teacher.find({ isActive: true }).select("name designation"),
    Staff.find({ isActive: true }).select("name category designation"),
  ]);

  const people = [
    ...teachers.map((t) => ({
      _id: String(t._id),
      kind: "teacher" as const,
      name: t.name,
      category: "Teaching",
      role: t.designation || "Teacher",
    })),
    ...staff.map((s) => ({
      _id: String(s._id),
      kind: "staff" as const,
      name: s.name,
      category: s.category || "Other",
      role: s.designation || s.category || "Staff",
    })),
  ].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const records = await StaffAttendance.find({ dateKey }).select("person status");
  const statusById = new Map(records.map((r) => [String(r.person), r.status]));
  const rates = await computeStaffRates(dateKey);

  let present = 0;
  let absent = 0;
  const pctValues: number[] = [];
  const list = people.map((p) => {
    const status = statusById.get(p._id) || null;
    if (status === "present") present += 1;
    else if (status === "absent") absent += 1;
    const r = rates.get(p._id) || { present: 0, absent: 0 };
    const pct = roundPct(r.present, r.absent);
    if (pct !== null) pctValues.push(pct);
    return { ...p, status, present: r.present, absent: r.absent, pct };
  });

  const total = list.length;
  const avgPct = pctValues.length ? Math.round(pctValues.reduce((a, b) => a + b, 0) / pctValues.length) : null;
  return {
    date: dateKey,
    dayInfo,
    people: list,
    counts: { present, absent, unmarked: total - present - absent, total, avgPct },
  };
};

// GET /api/staff/attendance?date=
export const getStaffRoster = asyncHandler(async (req, res) => {
  const dateKey = toDateKey(req.query.date || todayKey());
  res.json(await buildStaffRoster(dateKey));
});

// POST /api/staff/attendance  { personId, personKind, date, status }
export const markStaffOne = asyncHandler(async (req, res) => {
  const { personId, personKind, date, status } = req.body;
  if (status !== "present" && status !== "absent") throw new ApiError(400, "status must be present/absent");
  if (personKind !== "teacher" && personKind !== "staff") throw new ApiError(400, "Invalid personKind");
  const dateKey = toDateKey(date);
  if (isSundayKey(dateKey)) throw new ApiError(400, "That day is a Sunday (weekly off)");
  if (await Holiday.exists({ dateKey })) throw new ApiError(400, "That day is a holiday");

  const exists =
    personKind === "teacher" ? await Teacher.exists({ _id: personId }) : await Staff.exists({ _id: personId });
  if (!exists) throw new ApiError(404, "Person not found");

  const attendance = await StaffAttendance.findOneAndUpdate(
    { person: personId, dateKey },
    {
      person: personId,
      personKind,
      dateKey,
      date: dateFromKey(dateKey),
      status,
      markedBy: req.user!._id,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  res.json({ attendance });
});

// DELETE /api/staff/attendance  { personId, date }  -> back to "not marked"
export const clearStaffOne = asyncHandler(async (req, res) => {
  const { personId, date } = { ...req.query, ...req.body } as Record<string, string>;
  const dateKey = toDateKey(date);
  await StaffAttendance.deleteOne({ person: personId, dateKey });
  res.json({ message: "Cleared" });
});

// POST /api/staff/attendance/bulk  { date, status }  (marks all active people)
export const markStaffBulk = asyncHandler(async (req, res) => {
  const { date, status } = req.body;
  if (status !== "present" && status !== "absent") throw new ApiError(400, "status must be present/absent");
  const dateKey = toDateKey(date);
  if (isSundayKey(dateKey)) throw new ApiError(400, "That day is a Sunday (weekly off)");
  if (await Holiday.exists({ dateKey })) throw new ApiError(400, "That day is a holiday");

  const [teachers, staff] = await Promise.all([
    Teacher.find({ isActive: true }).select("_id"),
    Staff.find({ isActive: true }).select("_id"),
  ]);
  const people = [
    ...teachers.map((t) => ({ id: t._id, kind: "teacher" as const })),
    ...staff.map((s) => ({ id: s._id, kind: "staff" as const })),
  ];

  const ops = people.map((p) => ({
    updateOne: {
      filter: { person: p.id, dateKey },
      update: {
        $set: {
          person: p.id,
          personKind: p.kind,
          dateKey,
          date: dateFromKey(dateKey),
          status,
          markedBy: req.user!._id,
        },
      },
      upsert: true,
    },
  }));
  if (ops.length) await StaffAttendance.bulkWrite(ops);
  logAudit(req, AUDIT.ATTENDANCE, `Marked ${people.length} staff ${status} on ${dateKey}`);
  res.json({ message: `Marked ${people.length} employee(s) ${status}`, count: people.length });
});
