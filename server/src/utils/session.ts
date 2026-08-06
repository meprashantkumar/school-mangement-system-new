import { DEFAULT_SESSION } from "./academics";

// Which academic session is the school in right now?
//
// This is read on nearly every request — the class roster, the attendance
// percentage, exams, the timetable, a teacher's own classes — so it is held in
// memory and returned synchronously. Making it async would mean threading an await
// through fifty call sites for a value that changes once a year.
//
// The cache is filled from the database at boot (primeCurrentSession) and updated
// whenever the setting is saved. Until then it falls back to the build's default,
// which is what every school ran on before the session became a setting — so a
// process that somehow serves a request before priming behaves exactly as it used
// to rather than guessing.
let cached = DEFAULT_SESSION;

export const currentSession = (): string => cached;

// Called at boot, and again by the settings controller after a change.
export const setCachedSession = (session: string): void => {
  if (session && session.trim()) cached = session.trim();
};

export const primeCurrentSession = async (): Promise<string> => {
  try {
    // Imported here rather than at the top: the model imports academics, and
    // pulling it in at module load would tangle the two on startup.
    const { getSchoolSetting } = await import("../models/SchoolSetting");
    const setting = await getSchoolSetting();
    setCachedSession(setting.currentSession);
    console.log(`[session] running session is ${cached}`);
  } catch (err: any) {
    // A school that cannot read its setting should still start, on the old value.
    console.error(`[session] could not read the current session, using ${cached}:`, err?.message || err);
  }
  return cached;
};
