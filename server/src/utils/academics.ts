// Academic session + class helpers shared by student promotion logic.

// The default session used for brand-new students and legacy records without one.
// (Indian academic year runs Apr–Mar, so 2026 belongs to session "2026-27".)
export const CURRENT_SESSION = "2026-27";

// Ordered ladder of classes. `nextClass` walks one step up this ladder.
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

// Returns the next class up, or null if there is none (Class 12 → graduated).
export const nextClass = (cls: string): string | null => {
  const idx = CLASSES.indexOf(cls);
  if (idx === -1 || idx === CLASSES.length - 1) return null;
  return CLASSES[idx + 1];
};

// "2025-26" -> "2026-27". Falls back gracefully if the format is unexpected.
export const nextSession = (session: string): string => {
  const start = parseInt(session.split("-")[0], 10);
  if (Number.isNaN(start)) return session;
  const nextStart = start + 1;
  const nextEnd = String((nextStart + 1) % 100).padStart(2, "0");
  return `${nextStart}-${nextEnd}`;
};

// "2026-27" -> "2025-26".
export const prevSession = (session: string): string => {
  const start = parseInt(session.split("-")[0], 10);
  if (Number.isNaN(start)) return session;
  const prevStart = start - 1;
  return `${prevStart}-${String((prevStart + 1) % 100).padStart(2, "0")}`;
};
