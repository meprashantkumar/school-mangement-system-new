// Shared academic constants used by student records and fee structures.
// Keeping class/section values identical everywhere ensures invoice generation
// (which matches student.class to structure.class) always lines up.

export const CLASSES = [
  "Nursery",
  "LKG",
  "UKG",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
];

export const SECTIONS = ["A", "B", "C", "D", "E", "F", "G"];

// Social categories offered on the admission form / student record.
export const CATEGORIES = ["General", "OBC", "SC", "ST", "EWS", "Other"];

// ISO weekday (1=Mon … 7=Sun) used by timetables. Sunday is off by default.
export const WEEKDAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 7, short: "Sun", long: "Sunday" },
];

export const weekdayShort = (d: number) => WEEKDAYS.find((w) => w.value === d)?.short || "";
export const weekdayLong = (d: number) => WEEKDAYS.find((w) => w.value === d)?.long || "";

// The active academic session (keep in sync with the server's utils/academics.ts).
export const CURRENT_SESSION = "2026-27";

// Non-teaching staff roles (keep in sync with the server's STAFF_CATEGORIES).
export const STAFF_CATEGORIES = [
  "Driver",
  "Conductor",
  "Peon",
  "Guard",
  "Clerk",
  "Cook",
  "Operator",
  "Gardener",
  "Cleaner",
  "Accountant",
  "Librarian",
  "Nurse",
  "Other",
];

// Exam types + their default weights in the weighted overall/final ranking
// (keep in sync with the server's utils/exams.ts).
export const EXAM_TYPES = [
  { value: "unit", label: "Unit Test", weight: 10 },
  { value: "halfyearly", label: "Half-Yearly Exam", weight: 40 },
  { value: "annual", label: "Annual Exam", weight: 50 },
  { value: "other", label: "Other", weight: 10 },
];

export const examTypeLabel = (t: string) =>
  EXAM_TYPES.find((x) => x.value === t)?.label || "Exam";

export const defaultWeightFor = (t: string) =>
  EXAM_TYPES.find((x) => x.value === t)?.weight ?? 10;

export const PASS_PERCENT = 33;
export const defaultPassMarks = (max: number) => Math.ceil((max * PASS_PERCENT) / 100);

// Display "Class 5" for numeric classes, leave "Nursery"/"LKG"/etc as-is.
export const classLabel = (c: string) => (/^\d/.test(c) ? `Class ${c}` : c);

// Next class up the ladder, or null for Class 12 (no next → graduates).
export const nextClass = (cls: string): string | null => {
  const idx = CLASSES.indexOf(cls);
  if (idx === -1 || idx === CLASSES.length - 1) return null;
  return CLASSES[idx + 1];
};

// "2025-26" -> "2026-27" (best-effort; returns input if it can't parse).
export const nextSession = (session: string): string => {
  const start = parseInt(session.split("-")[0], 10);
  if (Number.isNaN(start)) return session;
  return `${start + 1}-${String((start + 2) % 100).padStart(2, "0")}`;
};

// "2026-27" -> "2025-26".
export const prevSession = (session: string): string => {
  const start = parseInt(session.split("-")[0], 10);
  if (Number.isNaN(start)) return session;
  return `${start - 1}-${String(start % 100).padStart(2, "0")}`;
};

// A short list of academic sessions (newest first) for filter dropdowns.
export const recentSessions = (): string[] => {
  const cur = CURRENT_SESSION;
  return [nextSession(cur), cur, prevSession(cur), prevSession(prevSession(cur))];
};
