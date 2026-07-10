import { Types } from "mongoose";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Attendance } from "../models/Attendance";
import { Holiday } from "../models/Holiday";
import { Student } from "../models/Student";
import { Teacher, ITeacher } from "../models/Teacher";
import { CURRENT_SESSION } from "../utils/academics";
import { toDateKey, dateFromKey, isSundayKey } from "../utils/attendance";
import { logAudit, AUDIT } from "../utils/audit";
import { Request } from "express";

const todayKey = () => new Date().toISOString().slice(0, 10);

// The teacher record for the logged-in user (matched by email, like parents).
const teacherForUser = async (req: Request): Promise<ITeacher> => {
  const teacher = await Teacher.findOne({ email: req.user!.email, isActive: true });
  if (!teacher) throw new ApiError(403, "No teacher profile is linked to your account");
  return teacher;
};

const isAssigned = (teacher: ITeacher, cls: string, section: string) =>
  teacher.assignments.some(
    (a) => a.class === cls && a.section === section && a.session === CURRENT_SESSION
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

// Per-student present/absent tallies for the session up to (and including) a day,
// excluding Sundays and named holidays. Returns a map by student id.
const computeRates = async (cls: string, section: string, uptoKey: string) => {
  const holidayKeys = (await Holiday.find({ session: CURRENT_SESSION }).select("dateKey")).map(
    (h) => h.dateKey
  );

  const rows = await Attendance.aggregate([
    {
      $match: {
        class: cls,
        section,
        session: CURRENT_SESSION,
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
const buildRoster = async (cls: string, section: string, dateKey: string) => {
  const holiday = await Holiday.findOne({ dateKey });
  const dayInfo = {
    sunday: isSundayKey(dateKey),
    holiday: !!holiday,
    holidayName: holiday?.name || null,
  };

  const students = (
    await Student.find({
      class: cls,
      section,
      session: CURRENT_SESSION,
      status: "active",
    }).select("name admissionNo rollNo class section gender")
  ).sort(byRoll);

  const dayRecords = await Attendance.find({
    class: cls,
    section,
    session: CURRENT_SESSION,
    dateKey,
  }).select("student status");
  const statusById = new Map(dayRecords.map((r) => [String(r.student), r.status]));

  const rates = await computeRates(cls, section, dateKey);

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
    assignments: teacher.assignments.filter((a) => a.session === CURRENT_SESSION),
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
  if (await Holiday.exists({ dateKey })) throw new ApiError(400, "That day is a holiday");

  const attendance = await Attendance.findOneAndUpdate(
    { student: student._id, dateKey },
    {
      student: student._id,
      class: student.class,
      section: student.section || "",
      session: CURRENT_SESSION,
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
  if (await Holiday.exists({ dateKey })) throw new ApiError(400, "That day is a holiday");

  const filter: Record<string, unknown> = {
    class: cls,
    section,
    session: CURRENT_SESSION,
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
          session: CURRENT_SESSION,
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
export const getRosterAdmin = asyncHandler(async (req, res) => {
  const cls = String(req.query.class || "");
  const section = String(req.query.section || "");
  if (!cls || !section) throw new ApiError(400, "class and section are required");
  const dateKey = toDateKey(req.query.date || todayKey());
  res.json(await buildRoster(cls, section, dateKey));
});
