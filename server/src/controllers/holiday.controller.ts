import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Holiday } from "../models/Holiday";
import { CURRENT_SESSION } from "../utils/academics";
import { toDateKey, dateFromKey } from "../utils/attendance";
import { logAudit, AUDIT } from "../utils/audit";

// GET /api/holidays?session=
export const getHolidays = asyncHandler(async (req, res) => {
  const session = (req.query.session as string) || CURRENT_SESSION;
  const holidays = await Holiday.find({ session }).sort({ dateKey: 1 });
  res.json({ holidays });
});

// POST /api/holidays  { date, name }  (admin or teacher)
export const addHoliday = asyncHandler(async (req, res) => {
  const { date, name } = req.body;
  if (!name || !String(name).trim()) throw new ApiError(400, "A holiday name is required");
  const dateKey = toDateKey(date);

  const holiday = await Holiday.findOneAndUpdate(
    { dateKey },
    {
      dateKey,
      date: dateFromKey(dateKey),
      name: String(name).trim(),
      session: CURRENT_SESSION,
      createdBy: req.user!._id,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  logAudit(req, AUDIT.HOLIDAY, `Marked ${dateKey} as holiday — ${holiday.name}`);
  res.status(201).json({ message: "Holiday saved", holiday });
});

// DELETE /api/holidays/:dateKey
export const removeHoliday = asyncHandler(async (req, res) => {
  const dateKey = toDateKey(req.params.dateKey);
  const holiday = await Holiday.findOneAndDelete({ dateKey });
  if (!holiday) throw new ApiError(404, "No holiday on that date");
  logAudit(req, AUDIT.HOLIDAY, `Removed holiday on ${dateKey} — ${holiday.name}`);
  res.json({ message: "Holiday removed" });
});
