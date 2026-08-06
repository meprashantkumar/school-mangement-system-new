// Academic session + class helpers shared by student promotion logic.

// Where a school starts if it has never set its session: the year this build was
// cut. (Indian academic year runs Apr–Mar, so 2026 belongs to session "2026-27".)
// The session a school is ACTUALLY in is a setting they move on their own promotion
// day — read it with currentSession() from utils/session, never from here.
export const DEFAULT_SESSION = "2026-27";

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

// "10" reads as "Class 10"; "Nursery" is already its own name.
export const classLabel = (cls: string): string => (/^\d/.test(cls) ? `Class ${cls}` : cls);

// Returns the next class up, or null if there is none (Class 12 → graduated).
export const nextClass = (cls: string): string | null => {
  const idx = CLASSES.indexOf(cls);
  if (idx === -1 || idx === CLASSES.length - 1) return null;
  return CLASSES[idx + 1];
};

// The ladder as far as a particular school goes. A school that teaches up to
// Class 8 has no Class 9, so nothing should ever promote a child into one.
// An unrecognised value means "the whole ladder", which is the old behaviour.
export const classesUpTo = (highestClass: string): string[] => {
  const top = CLASSES.indexOf(highestClass);
  return top === -1 ? CLASSES : CLASSES.slice(0, top + 1);
};

// Like nextClass, but stops at the school's own last class: passing that one means
// the child has finished school, not that they move up. Returns null in that case.
export const nextClassWithin = (cls: string, highestClass: string): string | null => {
  const ladder = classesUpTo(highestClass);
  const idx = ladder.indexOf(cls);
  if (idx === -1) return nextClass(cls); // a class outside this school's ladder — leave as before
  if (idx === ladder.length - 1) return null; // the last class: passed out
  return ladder[idx + 1];
};

// Is this the class a student passes out of at this school?
export const isFinalClass = (cls: string, highestClass: string): boolean => {
  const ladder = classesUpTo(highestClass);
  return ladder.length > 0 && ladder[ladder.length - 1] === cls;
};

// A session, written the one way the whole app stores it. Accepts what a school's own
// spreadsheet or another system's backup is likely to say — "2026-2027", "2026/27",
// stray spaces — and returns "2026-27", or null if it is not a session at all.
// Getting this wrong is invisible and expensive: a student stamped "2025-2026"
// appears in the student list but on no register and in no fee run, because both are
// keyed on the session.
export const normalizeSession = (value: unknown): string | null => {
  const raw = String(value ?? "").trim().replace(/\s+/g, "");
  const shape = /^(\d{4})[-/](\d{2}|\d{4})$/.exec(raw);
  if (!shape) return null;
  const start = Number(shape[1]);
  const endsIn = shape[2].length === 4 ? Number(shape[2]) : null;
  // The second half must be the year after the first — "2026-72" is a typo, not a
  // session, and "2026-2027" is the same year written long.
  if (endsIn !== null && endsIn !== start + 1) return null;
  if (endsIn === null && Number(shape[2]) !== (start + 1) % 100) return null;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
};

// The one canonical class name for whatever a file calls it: "class 5", "CLASS 5",
// "5th", " 5 ", "NURSERY", "lkg". Returns null when it is not a class at all.
// A file that said "Class 5" used to create a class literally named "Class 5", which
// then matched no fee structure, no register and no timetable.
export const normalizeClass = (value: unknown): string | null => {
  const raw = String(value ?? "")
    .trim()
    .replace(/^class\s*/i, "")
    .replace(/^(\d+)(st|nd|rd|th)$/i, "$1")
    .trim();
  if (!raw) return null;
  return CLASSES.find((c) => c.toLowerCase() === raw.toLowerCase()) ?? null;
};

// The academic year a calendar date belongs to. The Indian school year runs April to
// March, so 10 Aug 2026 and 15 Feb 2027 are both "2026-27".
export const sessionForDate = (dateKey: string): string | null => {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(dateKey || ""));
  if (!m) return null;
  const year = Number(m[1]);
  const start = Number(m[2]) >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
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
