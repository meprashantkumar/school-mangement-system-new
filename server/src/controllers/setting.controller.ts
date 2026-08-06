import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { logAudit, AUDIT } from "../utils/audit";
import { getSchoolSetting } from "../models/SchoolSetting";
import { CLASSES, classLabel, classesUpTo, nextSession } from "../utils/academics";
import { currentSession, setCachedSession } from "../utils/session";
import { Student } from "../models/Student";
import { Teacher } from "../models/Teacher";
import { FeeStructure } from "../models/FeeStructure";
import { Holiday } from "../models/Holiday";
import { Admission } from "../models/Admission";
import { Exam } from "../models/Exam";
import { ClassTimetable } from "../models/ClassTimetable";

const SESSION_FORM = /^\d{4}-\d{2}$/;

// What still has to be done before a session is ready to run. The office sees this
// both before switching (so they know what is coming) and after (as a to-do list),
// because a session with no class teachers and no fee structures looks broken even
// though nothing is wrong.
const readinessFor = async (session: string) => {
  const [students, classTeachers, structures, holidays] = await Promise.all([
    Student.countDocuments({ session, status: "active" }),
    Teacher.countDocuments({ isActive: true, "assignments.session": session }),
    FeeStructure.countDocuments({ academicYear: session }),
    Holiday.countDocuments({ session }),
  ]);
  return { session, students, classTeachers, structures, holidays };
};

// GET /api/settings
export const getSettings = asyncHandler(async (_req, res) => {
  const setting = await getSchoolSetting();
  const session = setting.currentSession;
  res.json({
    highestClass: setting.highestClass,
    classes: classesUpTo(setting.highestClass),
    currentSession: session,
    nextSession: nextSession(session),
    readiness: await readinessFor(session),
  });
});

// GET /api/settings/session-readiness?session=2027-28
// A dry run: what would the school find if it moved to this session right now?
export const getSessionReadiness = asyncHandler(async (req, res) => {
  const session = String(req.query.session || "").trim();
  if (!SESSION_FORM.test(session)) throw new ApiError(400, 'A session looks like "2027-28"');
  res.json({ readiness: await readinessFor(session), currentSession: currentSession() });
});

// Records stamped with a session since a given moment. Starting a session is a
// setting, so putting it back costs nothing — but anything ENTERED while the wrong
// year was running belongs to that year and stays there. The office has to be told
// which, or the undo looks like it lost their work.
const enteredSince = async (session: string, since?: Date) => {
  const when = since ? { $gte: since } : undefined;
  const stamp = when ? { createdAt: when } : {};
  const [students, admissions, exams, holidays, timetables] = await Promise.all([
    Student.countDocuments({ session, ...stamp }),
    Admission.countDocuments({ session, ...stamp }),
    Exam.countDocuments({ session, ...stamp }),
    Holiday.countDocuments({ session, ...stamp }),
    ClassTimetable.countDocuments({ session, ...stamp }),
  ]);
  return { students, admissions, exams, holidays, timetables };
};

// GET /api/settings/session-undo  -> can the last session change be put back, and
// what was entered in the meantime?
export const getSessionUndo = asyncHandler(async (_req, res) => {
  const setting = await getSchoolSetting();
  if (!setting.previousSession) {
    res.json({ canUndo: false });
    return;
  }
  res.json({
    canUndo: true,
    from: setting.currentSession,
    back: setting.previousSession,
    changedAt: setting.sessionChangedAt,
    entered: await enteredSince(setting.currentSession, setting.sessionChangedAt),
  });
});

// POST /api/settings/session-undo -> go back to the session in use before the last
// change. Nothing is deleted either way; this only moves which year the school reads.
export const undoSessionChange = asyncHandler(async (req, res) => {
  const setting = await getSchoolSetting();
  if (!setting.previousSession) {
    throw new ApiError(400, "There is no session change to undo.");
  }

  const leaving = setting.currentSession;
  const back = setting.previousSession;
  const entered = await enteredSince(leaving, setting.sessionChangedAt);

  // Swap them, so pressing undo again returns — the office is never stuck.
  setting.currentSession = back;
  setting.previousSession = leaving;
  setting.sessionChangedAt = new Date();
  setting.updatedBy = req.user?._id;
  await setting.save();
  setCachedSession(setting.currentSession);

  logAudit(req, AUDIT.STUDENT, `Session change undone: back to ${back} (from ${leaving})`);

  const stranded = Object.values(entered).reduce((a, b) => a + b, 0);
  res.json({
    message:
      `Back to ${back}.` +
      (stranded
        ? ` ${stranded} record(s) entered while ${leaving} was running still belong to ${leaving} and stay hidden until you start it again.`
        : ""),
    currentSession: setting.currentSession,
    previousSession: setting.previousSession,
    entered,
    highestClass: setting.highestClass,
    classes: classesUpTo(setting.highestClass),
    nextSession: nextSession(setting.currentSession),
    readiness: await readinessFor(setting.currentSession),
  });
});

// PUT /api/settings  { highestClass?, currentSession? }
export const updateSettings = asyncHandler(async (req, res) => {
  const setting = await getSchoolSetting();
  const changes: string[] = [];

  if (req.body.highestClass !== undefined) {
    const highestClass = String(req.body.highestClass);
    if (!CLASSES.includes(highestClass)) throw new ApiError(400, "Choose a class from the list");

    // Lowering it while children sit in a class above the new limit would strand
    // them: nothing would promote them and nothing would pass them out.
    const stranded = await Student.countDocuments({
      status: "active",
      class: { $nin: classesUpTo(highestClass) },
    });
    if (stranded > 0) {
      throw new ApiError(
        400,
        `${stranded} student(s) are still studying above ${classLabel(highestClass)}. Move or pass them out first, then lower this.`
      );
    }
    if (setting.highestClass !== highestClass) {
      changes.push(
        `highest class ${classLabel(setting.highestClass)} -> ${classLabel(highestClass)}`
      );
      setting.highestClass = highestClass;
    }
  }

  if (req.body.currentSession !== undefined) {
    const session = String(req.body.currentSession).trim();
    if (!SESSION_FORM.test(session)) throw new ApiError(400, 'A session looks like "2027-28"');
    if (setting.currentSession !== session) {
      changes.push(`session ${setting.currentSession} -> ${session}`);
      // Remember where we came from so the change can be put back with one click.
      setting.previousSession = setting.currentSession;
      setting.sessionChangedAt = new Date();
      setting.currentSession = session;
    }
  }

  if (!changes.length) {
    res.json({ message: "Nothing to change.", ...(await payload()) });
    return;
  }

  setting.updatedBy = req.user?._id;
  await setting.save();
  // Every request reads the session from memory, so the cache has to move with it.
  setCachedSession(setting.currentSession);
  logAudit(req, AUDIT.STUDENT, `School settings updated: ${changes.join("; ")}`);

  res.json({
    message: `Saved — ${changes.join("; ")}.`,
    ...(await payload()),
  });

  async function payload() {
    const s = await getSchoolSetting();
    return {
      highestClass: s.highestClass,
      classes: classesUpTo(s.highestClass),
      currentSession: s.currentSession,
      nextSession: nextSession(s.currentSession),
      readiness: await readinessFor(s.currentSession),
    };
  }
});
