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
