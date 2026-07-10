import { ApiError } from "./ApiError";

// Attendance & holidays use a "YYYY-MM-DD" day key (like invoices use "YYYY-MM"),
// which sidesteps timezone drift entirely.

// Accepts "YYYY-MM-DD" (or a longer ISO string) and returns the day key.
export const toDateKey = (input: unknown): string => {
  const m = String(input ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) throw new ApiError(400, "A valid date (YYYY-MM-DD) is required");
  return `${m[1]}-${m[2]}-${m[3]}`;
};

// Start-of-day Date (UTC) for a day key — used for sorting and $dayOfWeek.
export const dateFromKey = (dateKey: string): Date => new Date(`${dateKey}T00:00:00.000Z`);

// Sunday is the weekly off (computed, never stored). getUTCDay(): 0 = Sunday.
export const isSundayKey = (dateKey: string): boolean => dateFromKey(dateKey).getUTCDay() === 0;
