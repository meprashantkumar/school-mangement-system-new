import { asyncHandler } from "../utils/asyncHandler";
import { AuditLog } from "../models/AuditLog";

const DAY_MS = 24 * 60 * 60 * 1000;

// GET /api/audit?range=today|yesterday|7d|30d&from=&to=&action=&page=&limit=
// Paginated audit trail. Explicit from/to (calendar) wins over a range preset.
export const getAuditLogs = asyncHandler(async (req, res) => {
  const { range, from, to, action } = req.query as Record<string, string>;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));

  const filter: Record<string, unknown> = {};
  if (action) filter.action = action;

  let start: Date | undefined;
  let end: Date | undefined;

  if (from || to) {
    if (from) start = new Date(from);
    if (to) end = new Date(`${to}T23:59:59.999`);
  } else if (range && range !== "all") {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (range === "today") {
      start = startOfToday;
    } else if (range === "yesterday") {
      start = new Date(startOfToday.getTime() - DAY_MS);
      end = new Date(startOfToday.getTime() - 1);
    } else if (range === "7d") {
      start = new Date(now.getTime() - 7 * DAY_MS);
    } else if (range === "30d") {
      start = new Date(now.getTime() - 30 * DAY_MS);
    }
  }

  if (start || end) {
    const r: Record<string, Date> = {};
    if (start) r.$gte = start;
    if (end) r.$lte = end;
    filter.createdAt = r;
  }

  const [total, logs] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  res.json({
    logs,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit,
  });
});
