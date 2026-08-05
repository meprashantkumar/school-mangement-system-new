import { randomUUID } from "crypto";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Holiday } from "../models/Holiday";
import { Attendance } from "../models/Attendance";
import { CURRENT_SESSION, CLASSES } from "../utils/academics";
import { toDateKey, dateFromKey, isSundayKey } from "../utils/attendance";
import { logAudit, AUDIT } from "../utils/audit";

// A whole summer vacation is ~45 days. The cap is here to catch a mistyped year
// (2026 -> 2027 would otherwise silently create 365 rows), not to limit real breaks.
const MAX_RANGE_DAYS = 200;

/** Every day key from `from` to `to` inclusive. */
const daysBetween = (from: string, to: string): string[] => {
  const keys: string[] = [];
  const end = dateFromKey(to).getTime();
  for (let d = dateFromKey(from); d.getTime() <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
};

// The scope of one holiday action: either the whole school, or a specific set of
// classes. `[""]` means whole school — one row, applying to everyone, and it is also
// the only scope that gives the staff the day off.
//
// Ticking every class one by one is NOT the same thing as a whole-school holiday, so
// the caller has to say which it means: send no `classes` for the whole school.
const scopeFromBody = (classes: unknown): string[] => {
  if (!Array.isArray(classes) || classes.length === 0) return [""];
  const picked = [...new Set(classes.map((c) => String(c).trim()).filter(Boolean))];
  const unknown = picked.filter((c) => !CLASSES.includes(c));
  if (unknown.length) throw new ApiError(400, `Unknown class: ${unknown.join(", ")}`);
  if (!picked.length) return [""];
  // Keep them in ladder order so the summary reads "Class 10, Class 12".
  return CLASSES.filter((c) => picked.includes(c));
};

const scopeLabel = (classes: string[]): string =>
  classes.includes("") ? "the whole school" : classes.map((c) => `Class ${c}`).join(", ");

// GET /api/holidays?session=
// Returns the flat list (one row per day per class, as stored) plus a `groups`
// summary, so a 45-day break shows as one line in the UI instead of 45 — or 90 if it
// was declared for two classes.
export const getHolidays = asyncHandler(async (req, res) => {
  const session = (req.query.session as string) || CURRENT_SESSION;
  const holidays = await Holiday.find({ session }).sort({ dateKey: 1, class: 1 });

  type Group = {
    groupId: string;
    name: string;
    from: string;
    to: string;
    days: number;
    classes: string[];
  };
  const byGroup = new Map<string, Group & { dayKeys: Set<string>; classSet: Set<string> }>();
  for (const h of holidays) {
    if (!h.groupId) continue;
    let g = byGroup.get(h.groupId);
    if (!g) {
      g = {
        groupId: h.groupId,
        name: h.name,
        from: h.dateKey,
        to: h.dateKey,
        days: 0,
        classes: [],
        dayKeys: new Set(),
        classSet: new Set(),
      };
      byGroup.set(h.groupId, g);
    }
    // holidays are sorted by dateKey, so the last one seen is the end
    g.to = h.dateKey;
    g.dayKeys.add(h.dateKey);
    g.classSet.add(h.class || "");
  }

  const groups: Group[] = [...byGroup.values()].map((g) => ({
    groupId: g.groupId,
    name: g.name,
    from: g.from,
    to: g.to,
    // Distinct days, not row count — a 5-day break for 3 classes is 15 rows but 5 days.
    days: g.dayKeys.size,
    classes: CLASSES.filter((c) => g.classSet.has(c)).concat(g.classSet.has("") ? [""] : []),
  }));

  res.json({ holidays, groups });
});

// POST /api/holidays
//   { date, name, classes? }                 -> one day   (office, or a teacher)
//   { from, to, name, classes?, confirm? }   -> a break   (office only)
// `classes` omitted or empty = the whole school.
export const addHoliday = asyncHandler(async (req, res) => {
  const { date, from, to, name, classes, confirm } = req.body;
  if (!name || !String(name).trim()) throw new ApiError(400, "A holiday name is required");
  const label = String(name).trim();
  const scope = scopeFromBody(classes);
  const perClass = !scope.includes("");

  // Naming a specific class is an office decision — a class teacher's Holiday button
  // closes the school for the day, which is the "heavy rain" case it exists for.
  const isOffice = req.user!.role === "superadmin" || req.user!.role === "admin";
  if (perClass && !isOffice) {
    throw new ApiError(403, "Only the office can give one class a holiday");
  }

  // ---- one day ---------------------------------------------------------------
  if (!from && !to) {
    const dateKey = toDateKey(date);

    // Several classes on one day is still one action, so it gets a group id and reads
    // back as a single line. A plain whole-school day stays a bare holiday, as before.
    const groupId = scope.length > 1 ? randomUUID() : undefined;
    await Holiday.bulkWrite(
      scope.map((cls) => ({
        updateOne: {
          filter: { dateKey, class: cls },
          update: {
            $set: {
              dateKey,
              date: dateFromKey(dateKey),
              name: label,
              session: CURRENT_SESSION,
              class: cls,
              createdBy: req.user!._id,
              ...(groupId ? { groupId } : {}),
            },
          },
          upsert: true,
        },
      }))
    );

    const saved = await Holiday.find({ dateKey, class: { $in: scope } }).sort({ class: 1 });
    logAudit(req, AUDIT.HOLIDAY, `Marked ${dateKey} as holiday for ${scopeLabel(scope)} — ${label}`);
    return res.status(201).json({
      message: perClass ? `${label} — ${scopeLabel(scope)}` : "Holiday saved",
      holiday: saved[0],
      holidays: saved,
      groupId: groupId || null,
      classes: scope,
    });
  }

  // ---- a range ---------------------------------------------------------------
  // Closing the school for weeks is an office decision. A teacher can still shut
  // a single day (see above) — that is the "heavy rain today" case.
  if (!isOffice) throw new ApiError(403, "Only the office can mark a multi-day holiday");

  const fromKey = toDateKey(from);
  const toKey = toDateKey(to);
  if (fromKey > toKey) throw new ApiError(400, "The start date must come before the end date");

  const allKeys = daysBetween(fromKey, toKey);
  if (allKeys.length > MAX_RANGE_DAYS) {
    throw new ApiError(
      400,
      `That range is ${allKeys.length} days long. Check the dates — the limit is ${MAX_RANGE_DAYS}.`
    );
  }

  // Sundays are already weekly offs, computed rather than stored, so storing them
  // would add rows that change nothing.
  const sundays = allKeys.filter(isSundayKey);
  const workingKeys = allKeys.filter((k) => !isSundayKey(k));

  // A (day, class) pair that is already a holiday keeps the name it has — silently
  // renaming someone else's Diwali to "Summer Vacation" would be worse than skipping
  // it. Note this is per scope: a whole-school Diwali does not stop Class 10 getting
  // its own break on the same day, and vice versa.
  const existing = await Holiday.find({
    dateKey: { $in: workingKeys },
    class: { $in: scope },
  }).select("dateKey name class");
  const taken = new Set(existing.map((h) => `${h.dateKey}|${h.class || ""}`));

  const pending: { dateKey: string; class: string }[] = [];
  for (const dateKey of workingKeys) {
    for (const cls of scope) {
      if (!taken.has(`${dateKey}|${cls}`)) pending.push({ dateKey, class: cls });
    }
  }
  const newDays = [...new Set(pending.map((p) => p.dateKey))];

  // Attendance already taken on a day that is about to stop counting. Report it and
  // let the office decide, rather than deleting a teacher's work unasked. Scoped:
  // giving Class 10 a break says nothing about attendance taken in Class 9.
  const clashes: string[] = await Attendance.distinct("dateKey", {
    dateKey: { $in: newDays },
    ...(perClass ? { class: { $in: scope } } : {}),
  });
  if (clashes.length && !confirm) {
    return res.status(409).json({
      needsConfirmation: true,
      message:
        `Attendance has already been taken on ${clashes.length} day(s) in this range. ` +
        `Marking the holiday keeps those records but stops the days counting towards attendance.`,
      clashes: clashes.sort(),
      wouldCreate: newDays.length,
      skippedSundays: sundays.length,
      skippedExisting: existing.map((h) => ({
        dateKey: h.dateKey,
        name: h.name,
        class: h.class || "",
      })),
      classes: scope,
    });
  }

  const groupId = randomUUID();
  if (pending.length) {
    await Holiday.insertMany(
      pending.map((p) => ({
        dateKey: p.dateKey,
        date: dateFromKey(p.dateKey),
        name: label,
        session: CURRENT_SESSION,
        class: p.class,
        groupId,
        createdBy: req.user!._id,
      }))
    );
    logAudit(
      req,
      AUDIT.HOLIDAY,
      `Marked ${fromKey} to ${toKey} as holiday for ${scopeLabel(scope)} — ${label} ` +
        `(${newDays.length} day(s)` +
        `${sundays.length ? `, ${sundays.length} Sunday(s) skipped` : ""}` +
        `${existing.length ? `, ${existing.length} already a holiday` : ""})`
    );
  }

  res.status(201).json({
    message:
      `${label}: ${newDays.length} day(s) marked` +
      `${perClass ? ` for ${scopeLabel(scope)}` : ""}` +
      `${sundays.length ? `, ${sundays.length} Sunday(s) already weekly off` : ""}` +
      `${existing.length ? `, ${existing.length} already a holiday` : ""}`,
    groupId: pending.length ? groupId : null,
    created: newDays.length,
    createdRows: pending.length,
    classes: scope,
    skippedSundays: sundays.length,
    skippedExisting: existing.map((h) => ({
      dateKey: h.dateKey,
      name: h.name,
      class: h.class || "",
    })),
    attendanceAlreadyTaken: clashes.sort(),
  });
});

// DELETE /api/holidays/group/:groupId — removes a whole break, every day and every
// class of it, at once. Declared before /:dateKey in the router, or "group" is read
// as a date.
export const removeHolidayGroup = asyncHandler(async (req, res) => {
  const groupId = String(req.params.groupId || "");
  const rows = await Holiday.find({ groupId }).select("dateKey name class").sort({ dateKey: 1 });
  if (!rows.length) throw new ApiError(404, "No holiday break found");

  const name = rows[0].name;
  const days = new Set(rows.map((r) => r.dateKey)).size;
  await Holiday.deleteMany({ groupId });
  logAudit(req, AUDIT.HOLIDAY, `Removed the holiday break "${name}" — ${days} day(s) from ${rows[0].dateKey}`);
  res.json({ message: `Removed "${name}" (${days} day(s))`, removed: days, removedRows: rows.length });
});

// DELETE /api/holidays/:dateKey?class=
// No `class` means the whole-school holiday on that day; `class=10` means the one
// that applies to Class 10 only. Removing one never touches the other.
export const removeHoliday = asyncHandler(async (req, res) => {
  const dateKey = toDateKey(req.params.dateKey);
  const cls = String(req.query.class || "").trim();
  if (cls && !CLASSES.includes(cls)) throw new ApiError(400, `Unknown class: ${cls}`);
  // A class teacher can clear the day they closed; only the office manages the
  // per-class ones, matching who is allowed to create them.
  if (cls && req.user!.role !== "superadmin" && req.user!.role !== "admin") {
    throw new ApiError(403, "Only the office can remove a class holiday");
  }

  const holiday = await Holiday.findOneAndDelete({ dateKey, class: cls });
  if (!holiday) {
    throw new ApiError(404, cls ? `No Class ${cls} holiday on that date` : "No holiday on that date");
  }
  logAudit(
    req,
    AUDIT.HOLIDAY,
    `Removed holiday on ${dateKey} for ${scopeLabel([cls])} — ${holiday.name}`
  );
  res.json({ message: "Holiday removed" });
});
