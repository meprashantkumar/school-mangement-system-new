import { Types } from "mongoose";
import { currentSession } from "../utils/session";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Attendance } from "../models/Attendance";
import { Holiday } from "../models/Holiday";
import { Student } from "../models/Student";
import { ITeacher } from "../models/Teacher";

import { toDateKey, dateFromKey, isSundayKey } from "../utils/attendance";
import { teacherForUser } from "../utils/teacherForUser";
import { logAudit, AUDIT } from "../utils/audit";
import { Request } from "express";

const todayKey = () => new Date().toISOString().slice(0, 10);

const isAssigned = (teacher: ITeacher, cls: string, section: string) =>
  teacher.assignments.some(
    (a) => a.class === cls && a.section === section && a.session === currentSession()
  );

const assertAssigned = (teacher: ITeacher, cls: string, section: string) => {
  if (!isAssigned(teacher, cls, section)) {
    throw new ApiError(403, `You are not the class-teacher of ${cls}-${section}`);
  }
};

const roundPct = (present: number, absent: number): number | null => {
  const total = present + absent;
  return total > 0 ? Math.round((present / total) * 100) : null;
};

// Holidays that apply to one class: the whole-school ones (class "") plus any
// declared for that class alone. Every holiday lookup in here goes through this, so
// a Class 10 break never changes Class 9's numbers.
const holidayScopeFor = (cls: string) => ({ $in: ["", cls] });

// Per-student present/absent tallies for the session up to (and including) a day,
// excluding Sundays and named holidays. Returns a map by student id.
const computeRates = async (
  cls: string,
  section: string,
  uptoKey: string,
  session: string = currentSession()
) => {
  const holidayKeys = (
    await Holiday.find({ session, class: holidayScopeFor(cls) }).select("dateKey")
  ).map((h) => h.dateKey);

  const rows = await Attendance.aggregate([
    {
      $match: {
        class: cls,
        section,
        session,
        dateKey: { $lte: uptoKey, $nin: holidayKeys },
      },
    },
    { $match: { $expr: { $ne: [{ $dayOfWeek: "$date" }, 1] } } }, // drop Sundays (1 = Sun, UTC)
    {
      $group: {
        _id: "$student",
        present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
      },
    },
  ]);

  const map = new Map<string, { present: number; absent: number }>();
  rows.forEach((r) => map.set(String(r._id), { present: r.present, absent: r.absent }));
  return map;
};

// Natural roll-number order (1, 2, 10 — not 1, 10, 2), falling back to name.
const byRoll = (a: { rollNo?: string; name: string }, b: { rollNo?: string; name: string }) => {
  const na = parseInt(a.rollNo || "", 10);
  const nb = parseInt(b.rollNo || "", 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  if (!Number.isNaN(na) && Number.isNaN(nb)) return -1;
  if (Number.isNaN(na) && !Number.isNaN(nb)) return 1;
  return a.name.localeCompare(b.name);
};

// Builds the roster for a class+section on a given day: each active student with
// that day's status, their running % (green/red is decided on the client), the
// day's info (holiday/Sunday), and headline counts.
// `session` defaults to the year the school is running. Passing an earlier one is
// how the office looks back at a finished year (admin only) — see the note on the
// roster below for why a past year cannot be read from the students collection.
const buildRoster = async (
  cls: string,
  section: string,
  dateKey: string,
  session: string = currentSession()
) => {
  const past = session !== currentSession();

  // "" sorts before any class name, so a whole-school holiday wins the label on a day
  // that happens to have both.
  const holiday = await Holiday.findOne({ dateKey, class: holidayScopeFor(cls) }).sort({ class: 1 });
  const dayInfo = {
    sunday: isSundayKey(dateKey),
    holiday: !!holiday,
    holidayName: holiday?.name || null,
    // Which holiday this is, so the UI can say "Class 5 only" and delete the right row.
    holidayClass: holiday ? holiday.class || "" : null,
    holidayScope: (holiday ? (holiday.class ? "class" : "school") : null) as
      | "class"
      | "school"
      | null,
  };

  // For the running year the roster is simply who is in the class now. For a FINISHED
  // year it cannot be: a child who sat in 9-A last year has "Class 10" on their record
  // today, and someone who has since left or passed out would vanish from the register
  // they were actually on. The only faithful record of who was in that class is the
  // attendance itself, so a past year is assembled from those rows — which also means
  // it includes children who have since left.
  const students = past
    ? (
        await Student.find({
          _id: { $in: await Attendance.distinct("student", { class: cls, section, session }) },
        }).select("name admissionNo rollNo class section gender")
      ).sort(byRoll)
    : (
        await Student.find({
          class: cls,
          section,
          session,
          status: "active",
        }).select("name admissionNo rollNo class section gender")
      ).sort(byRoll);

  const dayRecords = await Attendance.find({
    class: cls,
    section,
    session,
    dateKey,
  }).select("student status");
  const statusById = new Map(dayRecords.map((r) => [String(r.student), r.status]));

  const rates = await computeRates(cls, section, dateKey, session);

  let present = 0;
  let absent = 0;
  const pctValues: number[] = [];

  const list = students.map((s) => {
    const id = String(s._id);
    const status = statusById.get(id) || null;
    if (status === "present") present += 1;
    else if (status === "absent") absent += 1;

    const r = rates.get(id) || { present: 0, absent: 0 };
    const pct = roundPct(r.present, r.absent);
    if (pct !== null) pctValues.push(pct);

    return {
      _id: id,
      name: s.name,
      admissionNo: s.admissionNo,
      rollNo: s.rollNo || "",
      status,
      present: r.present,
      absent: r.absent,
      pct,
    };
  });

  const total = list.length;
  const classAvgPct = pctValues.length
    ? Math.round(pctValues.reduce((a, b) => a + b, 0) / pctValues.length)
    : null;

  return {
    class: cls,
    section,
    date: dateKey,
    session,
    // A finished year is history: it can be read but never marked, and the screen
    // needs to know so it doesn't offer buttons that would be refused.
    readOnly: past,
    dayInfo,
    students: list,
    counts: { present, absent, unmarked: total - present - absent, total, classAvgPct },
  };
};

// ---- Teacher endpoints (role: teacher) ----

// GET /api/teacher/me
export const getMyClasses = asyncHandler(async (req, res) => {
  const teacher = await teacherForUser(req);
  res.json({
    teacher: { name: teacher.name, email: teacher.email, designation: teacher.designation },
    assignments: teacher.assignments.filter((a) => a.session === currentSession()),
  });
});

// GET /api/teacher/attendance?class=&section=&date=
export const getMyRoster = asyncHandler(async (req, res) => {
  const teacher = await teacherForUser(req);
  const cls = String(req.query.class || "");
  const section = String(req.query.section || "");
  assertAssigned(teacher, cls, section);
  const dateKey = toDateKey(req.query.date || todayKey());
  res.json(await buildRoster(cls, section, dateKey));
});

// POST /api/teacher/attendance  { studentId, date, status }
export const markOne = asyncHandler(async (req, res) => {
  const teacher = await teacherForUser(req);
  const { studentId, date, status } = req.body;
  if (status !== "present" && status !== "absent") {
    throw new ApiError(400, "status must be 'present' or 'absent'");
  }
  const dateKey = toDateKey(date);

  const student = await Student.findById(studentId).select("name class section");
  if (!student) throw new ApiError(404, "Student not found");
  assertAssigned(teacher, student.class, student.section || "");

  if (isSundayKey(dateKey)) throw new ApiError(400, "That day is a Sunday (weekly off)");
  if (await Holiday.exists({ dateKey, class: holidayScopeFor(student.class) })) {
    throw new ApiError(400, "That day is a holiday");
  }

  const attendance = await Attendance.findOneAndUpdate(
    { student: student._id, dateKey },
    {
      student: student._id,
      class: student.class,
      section: student.section || "",
      session: currentSession(),
      dateKey,
      date: dateFromKey(dateKey),
      status,
      markedBy: req.user!._id,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  res.json({ attendance });
});

// DELETE /api/teacher/attendance  { studentId, date }  -> back to "not marked"
export const clearOne = asyncHandler(async (req, res) => {
  const teacher = await teacherForUser(req);
  const { studentId, date } = { ...req.query, ...req.body } as Record<string, string>;
  const dateKey = toDateKey(date);
  const student = await Student.findById(studentId).select("class section");
  if (!student) throw new ApiError(404, "Student not found");
  assertAssigned(teacher, student.class, student.section || "");
  await Attendance.deleteOne({ student: student._id, dateKey });
  res.json({ message: "Cleared" });
});

// POST /api/teacher/attendance/bulk  { class, section, date, status, studentIds? }
export const markBulk = asyncHandler(async (req, res) => {
  const teacher = await teacherForUser(req);
  const { class: cls, section, date, status, studentIds } = req.body;
  if (status !== "present" && status !== "absent") {
    throw new ApiError(400, "status must be 'present' or 'absent'");
  }
  assertAssigned(teacher, cls, section);
  const dateKey = toDateKey(date);
  if (isSundayKey(dateKey)) throw new ApiError(400, "That day is a Sunday (weekly off)");
  if (await Holiday.exists({ dateKey, class: holidayScopeFor(cls) })) {
    throw new ApiError(400, "That day is a holiday");
  }

  const filter: Record<string, unknown> = {
    class: cls,
    section,
    session: currentSession(),
    status: "active",
  };
  if (Array.isArray(studentIds) && studentIds.length) {
    filter._id = { $in: studentIds.map((id: string) => new Types.ObjectId(id)) };
  }
  const students = await Student.find(filter).select("_id");

  const ops = students.map((s) => ({
    updateOne: {
      filter: { student: s._id, dateKey },
      update: {
        $set: {
          student: s._id,
          class: cls,
          section,
          session: currentSession(),
          dateKey,
          date: dateFromKey(dateKey),
          status,
          markedBy: req.user!._id,
        },
      },
      upsert: true,
    },
  }));
  if (ops.length) await Attendance.bulkWrite(ops);

  logAudit(
    req,
    AUDIT.ATTENDANCE,
    `Marked ${students.length} student(s) ${status} in ${cls}-${section} on ${dateKey}`
  );
  res.json({ message: `Marked ${students.length} student(s) ${status}`, count: students.length });
});

// ---- Admin endpoint (read-only) ----

// GET /api/teachers/attendance?class=&section=&date=
// GET /api/teachers/attendance/sessions -> years a register was actually kept for.
// Not the sessions students are in: once a class is promoted nobody is left in last
// year, so that list would hide exactly the history the office is looking for.
export const getAttendanceSessions = asyncHandler(async (_req, res) => {
  const sessions: string[] = await Attendance.distinct("session");
  const running = currentSession();
  if (!sessions.includes(running)) sessions.push(running);
  sessions.sort().reverse();
  res.json({ sessions, currentSession: running });
});

export const getRosterAdmin = asyncHandler(async (req, res) => {
  const cls = String(req.query.class || "");
  const section = String(req.query.section || "");
  if (!cls || !section) throw new ApiError(400, "class and section are required");
  const dateKey = toDateKey(req.query.date || todayKey());

  // The office may look back at a finished year — a scholarship form or a parent
  // asking about last year needs the register that was actually kept. Teachers get
  // no such option: their assignments are per session, so last year's class is not
  // theirs to read.
  const asked = String(req.query.session || "").trim();
  if (asked && !/^\d{4}-\d{2}$/.test(asked)) {
    throw new ApiError(400, 'A session looks like "2026-27"');
  }
  res.json(await buildRoster(cls, section, dateKey, asked || currentSession()));
});
