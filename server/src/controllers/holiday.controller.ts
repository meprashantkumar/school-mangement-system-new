import { randomUUID } from "crypto";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Holiday } from "../models/Holiday";
import { Attendance } from "../models/Attendance";
import { CURRENT_SESSION } from "../utils/academics";
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

// GET /api/holidays?session=
// Returns the flat list (each day, as before) plus a `groups` summary so a 45-day
// break shows as one line in the UI instead of 45.
export const getHolidays = asyncHandler(async (req, res) => {
  const session = (req.query.session as string) || CURRENT_SESSION;
  const holidays = await Holiday.find({ session }).sort({ dateKey: 1 });

  const byGroup = new Map<string, { groupId: string; name: string; from: string; to: string; days: number }>();
  for (const h of holidays) {
    if (!h.groupId) continue;
    const g = byGroup.get(h.groupId);
    if (!g) {
      byGroup.set(h.groupId, {
        groupId: h.groupId,
        name: h.name,
        from: h.dateKey,
        to: h.dateKey,
        days: 1,
      });
    } else {
      // holidays are sorted by dateKey, so the last one seen is the end
      g.to = h.dateKey;
      g.days += 1;
    }
  }

  res.json({ holidays, groups: [...byGroup.values()] });
});

// POST /api/holidays
//   { date, name }                  -> one day   (office or a teacher)
//   { from, to, name, confirm? }    -> a break   (office only)
export const addHoliday = asyncHandler(async (req, res) => {
  const { date, from, to, name, confirm } = req.body;
  if (!name || !String(name).trim()) throw new ApiError(400, "A holiday name is required");
  const label = String(name).trim();

  // ---- one day: unchanged behaviour, still available to a class teacher --------
  if (!from && !to) {
    const dateKey = toDateKey(date);
    const holiday = await Holiday.findOneAndUpdate(
      { dateKey },
      {
        dateKey,
        date: dateFromKey(dateKey),
        name: label,
        session: CURRENT_SESSION,
        createdBy: req.user!._id,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    logAudit(req, AUDIT.HOLIDAY, `Marked ${dateKey} as holiday — ${holiday.name}`);
    return res.status(201).json({ message: "Holiday saved", holiday });
  }

  // ---- a range ---------------------------------------------------------------
  // Closing the school for weeks is an office decision. A teacher can still shut
  // a single day (see above) — that is the "heavy rain today" case.
  if (req.user!.role !== "superadmin" && req.user!.role !== "admin") {
    throw new ApiError(403, "Only the office can mark a multi-day holiday");
  }

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

  // Days already marked as a holiday keep the name they have — dateKey is unique,
  // and silently renaming someone else's Diwali to "Summer Vacation" would be worse
  // than skipping it.
  const existing = await Holiday.find({ dateKey: { $in: workingKeys } }).select("dateKey name");
  const existingKeys = new Set(existing.map((h) => h.dateKey));
  const newKeys = workingKeys.filter((k) => !existingKeys.has(k));

  // Attendance already taken on a day that is about to stop counting. Report it and
  // let the office decide, rather than deleting a teacher's work unasked.
  const clashes: string[] = await Attendance.distinct("dateKey", { dateKey: { $in: newKeys } });
  if (clashes.length && !confirm) {
    return res.status(409).json({
      needsConfirmation: true,
      message:
        `Attendance has already been taken on ${clashes.length} day(s) in this range. ` +
        `Marking the holiday keeps those records but stops the days counting towards attendance.`,
      clashes: clashes.sort(),
      wouldCreate: newKeys.length,
      skippedSundays: sundays.length,
      skippedExisting: existing.map((h) => ({ dateKey: h.dateKey, name: h.name })),
    });
  }

  const groupId = randomUUID();
  if (newKeys.length) {
    await Holiday.insertMany(
      newKeys.map((dateKey) => ({
        dateKey,
        date: dateFromKey(dateKey),
        name: label,
        session: CURRENT_SESSION,
        groupId,
        createdBy: req.user!._id,
      }))
    );
    logAudit(
      req,
      AUDIT.HOLIDAY,
      `Marked ${fromKey} to ${toKey} as holiday — ${label} (${newKeys.length} day(s)` +
        `${sundays.length ? `, ${sundays.length} Sunday(s) skipped` : ""}` +
        `${existing.length ? `, ${existing.length} already a holiday` : ""})`
    );
  }

  res.status(201).json({
    message:
      `${label}: ${newKeys.length} day(s) marked` +
      `${sundays.length ? `, ${sundays.length} Sunday(s) already weekly off` : ""}` +
      `${existing.length ? `, ${existing.length} already a holiday` : ""}`,
    groupId: newKeys.length ? groupId : null,
    created: newKeys.length,
    skippedSundays: sundays.length,
    skippedExisting: existing.map((h) => ({ dateKey: h.dateKey, name: h.name })),
    attendanceAlreadyTaken: clashes.sort(),
  });
});

// DELETE /api/holidays/group/:groupId — removes a whole multi-day break at once.
// Declared before /:dateKey in the router, or "group" is read as a date.
export const removeHolidayGroup = asyncHandler(async (req, res) => {
  const groupId = String(req.params.groupId || "");
  const days = await Holiday.find({ groupId }).select("dateKey name");
  if (!days.length) throw new ApiError(404, "No holiday break found");

  const name = days[0].name;
  await Holiday.deleteMany({ groupId });
  logAudit(
    req,
    AUDIT.HOLIDAY,
    `Removed the holiday break "${name}" — ${days.length} day(s) from ${days[0].dateKey}`
  );
  res.json({ message: `Removed "${name}" (${days.length} day(s))`, removed: days.length });
});

// DELETE /api/holidays/:dateKey
export const removeHoliday = asyncHandler(async (req, res) => {
  const dateKey = toDateKey(req.params.dateKey);
  const holiday = await Holiday.findOneAndDelete({ dateKey });
  if (!holiday) throw new ApiError(404, "No holiday on that date");
  logAudit(req, AUDIT.HOLIDAY, `Removed holiday on ${dateKey} — ${holiday.name}`);
  res.json({ message: "Holiday removed" });
});
