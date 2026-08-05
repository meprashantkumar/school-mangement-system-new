import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { TimetableConfig, DEFAULT_PERIODS, IPeriodSlot } from "../models/TimetableConfig";
import { ClassTimetable, ITimetableSlot } from "../models/ClassTimetable";
import { ExamTimetable } from "../models/ExamTimetable";
import { Exam } from "../models/Exam";
import { Teacher } from "../models/Teacher";
import { Student } from "../models/Student";
import { Holiday } from "../models/Holiday";
import { CURRENT_SESSION } from "../utils/academics";
import { toDateKey, dateFromKey, isSundayKey } from "../utils/attendance";
import { findChildren } from "../utils/children";
import { teacherForUser } from "../utils/teacherForUser";
import { logAudit, AUDIT } from "../utils/audit";

const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

const OID = /^[0-9a-fA-F]{24}$/;
const asOid = (v: unknown) => (typeof v === "string" && OID.test(v) ? v : undefined);

// ---- Bell-schedule config (single school-wide document) ---------------------

async function ensureConfig() {
  let cfg = await TimetableConfig.findOne();
  if (!cfg) cfg = await TimetableConfig.create({ periods: DEFAULT_PERIODS, workingDays: [1, 2, 3, 4, 5, 6] });
  return cfg;
}

// GET /api/timetable/config  (any staff / teacher)
export const getConfig = asyncHandler(async (_req, res) => {
  const config = await ensureConfig();
  res.json({ config });
});

// PUT /api/timetable/config  { periods, workingDays }  (admin)
export const updateConfig = asyncHandler(async (req, res) => {
  const config = await ensureConfig();
  if (Array.isArray(req.body.periods)) {
    config.periods = req.body.periods.map(
      (p: any, i: number): IPeriodSlot => ({
        period: Number.isFinite(Number(p.period)) ? Number(p.period) : i + 1,
        label: String(p.label || `Period ${i + 1}`),
        start: String(p.start || ""),
        end: String(p.end || ""),
        isBreak: !!p.isBreak,
      })
    );
  }
  if (Array.isArray(req.body.workingDays)) {
    config.workingDays = req.body.workingDays
      .map((d: any) => Number(d))
      .filter((d: number) => d >= 1 && d <= 7);
  }
  config.updatedBy = req.user?._id as any;
  await config.save();
  logAudit(req, AUDIT.TIMETABLE, "Updated the timetable period schedule");
  res.json({ message: "Timetable schedule saved", config });
});

// ---- Class timetable --------------------------------------------------------

// GET /api/timetable/class?class=&section=&session=  (staff)
export const getClassTimetable = asyncHandler(async (req, res) => {
  const cls = String(req.query.class || "").trim();
  const section = String(req.query.section || "").trim();
  const session = String(req.query.session || CURRENT_SESSION).trim();
  if (!cls || !section) throw new ApiError(400, "Class and section are required");
  const timetable = await ClassTimetable.findOne({ class: cls, section, session });
  res.json({ timetable: timetable || { class: cls, section, session, slots: [] } });
});

// PUT /api/timetable/class  { class, section, session, slots: [...] }  (admin)
export const saveClassTimetable = asyncHandler(async (req, res) => {
  const cls = String(req.body.class || "").trim();
  const section = String(req.body.section || "").trim();
  const session = String(req.body.session || CURRENT_SESSION).trim();
  if (!cls || !section) throw new ApiError(400, "Class and section are required");

  const slots: ITimetableSlot[] = Array.isArray(req.body.slots)
    ? req.body.slots
        .filter((s: any) => s && (s.subjectName || s.subject || s.teacherName))
        .map((s: any) => ({
          day: Number(s.day),
          period: Number(s.period),
          subject: asOid(s.subject) as any,
          subjectName: String(s.subjectName || "").trim(),
          teacher: asOid(s.teacher) as any,
          teacherName: String(s.teacherName || "").trim(),
          room: String(s.room || "").trim(),
        }))
        .filter((s: ITimetableSlot) => Number.isFinite(s.day) && Number.isFinite(s.period))
    : [];

  const timetable = await ClassTimetable.findOneAndUpdate(
    { class: cls, section, session },
    { $set: { slots, updatedBy: req.user?._id } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  // Warn (don't block) if a teacher is double-booked across classes at the same time.
  const warnings: string[] = [];
  const teacherSlots = slots.filter((s) => s.teacher);
  if (teacherSlots.length) {
    const others = await ClassTimetable.find({
      session,
      _id: { $ne: timetable._id },
      "slots.teacher": { $in: teacherSlots.map((s) => s.teacher) },
    });
    for (const s of teacherSlots) {
      for (const o of others) {
        const hit = o.slots.find(
          (x) => String(x.teacher) === String(s.teacher) && x.day === s.day && x.period === s.period
        );
        if (hit) {
          const msg = `${s.teacherName || "A teacher"} is also assigned to ${o.class}-${o.section} at the same time (Day ${s.day}, Period ${s.period}).`;
          if (!warnings.includes(msg)) warnings.push(msg);
        }
      }
    }
  }

  logAudit(req, AUDIT.TIMETABLE, `Saved timetable for ${cls}-${section} (${session})`);
  res.json({ message: "Timetable saved", timetable, warnings });
});

// GET /api/timetable/busy?session=&excludeClass=&excludeSection=  (staff)
// Which teachers are already booked in each day+period across every OTHER class,
// so the editor can hide them and prevent a clash before it's created.
export const getBusyTeachers = asyncHandler(async (req, res) => {
  const session = String(req.query.session || CURRENT_SESSION).trim();
  const exClass = String(req.query.excludeClass || "").trim();
  const exSection = String(req.query.excludeSection || "").trim();

  const tts = await ClassTimetable.find({ session });
  const busy: Record<string, string[]> = {};
  for (const tt of tts) {
    if (tt.class === exClass && tt.section === exSection) continue; // the one being edited
    for (const s of tt.slots) {
      if (!s.teacher) continue;
      const k = `${s.day}_${s.period}`;
      (busy[k] ||= []).push(String(s.teacher));
    }
  }
  res.json({ busy });
});

// ---- Substitution board (free-teacher / cover finder) -----------------------

// GET /api/timetable/substitution?date=YYYY-MM-DD&session=  (staff)
// For the given date's weekday: which teachers are FREE each period (to cover an
// absent teacher) and which are BUSY (with their class + subject). Read-only —
// nothing is stored. Sundays and named holidays return working:false.
export const getSubstitutionBoard = asyncHandler(async (req, res) => {
  const dateKey = toDateKey(req.query.date || new Date().toISOString());
  const session = String(req.query.session || CURRENT_SESSION).trim();
  const dow = dateFromKey(dateKey).getUTCDay(); // 0=Sun..6=Sat
  const iso = dow === 0 ? 7 : dow; // 1=Mon..7=Sun (matches slot.day)
  const weekdayLabel = WEEKDAY_NAMES[dow];

  const config = await ensureConfig();

  // Is it a working day? Sunday / non-working weekday / named holiday → nothing to cover.
  let working = config.workingDays.includes(iso) && !isSundayKey(dateKey);
  let reason: string | null = null;
  if (isSundayKey(dateKey)) reason = "Sunday — weekly off";
  else if (!config.workingDays.includes(iso)) reason = `${weekdayLabel} is not a working day`;
  // Only a school-wide holiday closes the board. One class being off (board exams,
  // say) leaves everyone else teaching — and frees up that class's teachers to cover,
  // which is exactly what this screen is for, so those slots are dropped below.
  const holidays = await Holiday.find({ dateKey }).select("name class");
  const schoolHoliday = holidays.find((h) => !h.class);
  const classesOff = holidays.filter((h) => h.class).map((h) => h.class);
  if (schoolHoliday) {
    working = false;
    reason = `Holiday — ${schoolHoliday.name}`;
  }

  const teachers = await Teacher.find({ isActive: true }).select("name designation").sort({ name: 1 });
  const teacherList = teachers.map((t) => ({
    _id: t._id,
    name: t.name,
    designation: t.designation || "",
  }));

  if (!working) {
    return res.json({
      date: dateKey, weekday: iso, weekdayLabel, working: false, reason,
      periods: [], teachers: teacherList, grid: [], classesOnHoliday: [],
    });
  }

  // Every teacher-slot scheduled on this weekday, across all classes.
  const tts = await ClassTimetable.find({ session });
  type Busy = {
    teacher: string; teacherName: string; class: string; section: string;
    subjectName: string; period: number;
  };
  const offToday = new Set(classesOff);
  const busyAll: Busy[] = [];
  for (const tt of tts) {
    if (offToday.has(tt.class)) continue; // that class is on holiday — its periods aren't running
    for (const s of tt.slots) {
      if (s.day !== iso || !s.teacher) continue;
      busyAll.push({
        teacher: String(s.teacher), teacherName: s.teacherName,
        class: tt.class, section: tt.section, subjectName: s.subjectName, period: s.period,
      });
    }
  }

  // Only the periods actually running today (handles the shorter Saturday cleanly).
  const activePeriods = [...new Set(busyAll.map((b) => b.period))].sort((a, b) => a - b);
  const labelOf = (p: number) => config.periods.find((x) => x.period === p)?.label || `Period ${p}`;

  const grid = activePeriods.map((p) => {
    const busy = busyAll.filter((b) => b.period === p);
    const busyIds = new Set(busy.map((b) => b.teacher));
    const free = teacherList.filter((t) => !busyIds.has(String(t._id)));
    return { period: p, label: labelOf(p), busy, free };
  });

  res.json({
    date: dateKey, weekday: iso, weekdayLabel, working: true, reason: null,
    periods: activePeriods.map((p) => ({ period: p, label: labelOf(p) })),
    teachers: teacherList,
    grid,
    // Classes off today, so the screen can explain why their teachers look free.
    classesOnHoliday: [...offToday],
  });
});

// ---- Teacher timetable (derived from class timetables) ----------------------

async function buildTeacherTimetable(teacherId: string, session: string) {
  const tts = await ClassTimetable.find({ session, "slots.teacher": teacherId });
  const entries: Array<{
    day: number;
    period: number;
    class: string;
    section: string;
    subjectName: string;
    room?: string;
  }> = [];
  for (const tt of tts) {
    for (const s of tt.slots) {
      if (String(s.teacher) === String(teacherId)) {
        entries.push({
          day: s.day,
          period: s.period,
          class: tt.class,
          section: tt.section,
          subjectName: s.subjectName,
          room: s.room,
        });
      }
    }
  }
  return entries;
}

// GET /api/timetable/teacher?teacherId=&session=  (staff — view any teacher)
export const getTeacherTimetableAdmin = asyncHandler(async (req, res) => {
  const teacherId = String(req.query.teacherId || "").trim();
  const session = String(req.query.session || CURRENT_SESSION).trim();
  if (!asOid(teacherId)) throw new ApiError(400, "A valid teacher is required");
  const teacher = await Teacher.findById(teacherId).select("name email");
  const entries = await buildTeacherTimetable(teacherId, session);
  res.json({ teacher, session, entries });
});

// GET /api/teacher/timetable  (the logged-in teacher's own schedule)
export const getMyTeacherTimetable = asyncHandler(async (req, res) => {
  const teacher = await teacherForUser(req);
  const session = String(req.query.session || CURRENT_SESSION).trim();
  const [config, entries] = await Promise.all([
    ensureConfig(),
    buildTeacherTimetable(String(teacher._id), session),
  ]);
  res.json({ session, entries, config });
});

// ---- Exam timetable (date sheet) --------------------------------------------

// GET /api/timetable/exam?examId=  (staff) — returns the saved date sheet plus the
// exam's subjects so the editor can seed a row per subject.
export const getExamTimetable = asyncHandler(async (req, res) => {
  const examId = String(req.query.examId || "").trim();
  if (!asOid(examId)) throw new ApiError(400, "A valid exam is required");
  const exam = await Exam.findById(examId);
  if (!exam) throw new ApiError(404, "Exam not found");
  const examTimetable = await ExamTimetable.findOne({ exam: exam._id });
  res.json({ exam, examTimetable: examTimetable || { exam: exam._id, papers: [] } });
});

// PUT /api/timetable/exam  { examId, papers: [...] }  (admin)
export const saveExamTimetable = asyncHandler(async (req, res) => {
  const examId = String(req.body.examId || "").trim();
  if (!asOid(examId)) throw new ApiError(400, "A valid exam is required");
  const exam = await Exam.findById(examId);
  if (!exam) throw new ApiError(404, "Exam not found");

  const papers = Array.isArray(req.body.papers)
    ? req.body.papers
        .filter((p: any) => p && (p.subjectName || p.subject))
        .map((p: any) => ({
          subject: asOid(p.subject) as any,
          subjectName: String(p.subjectName || "").trim(),
          date: String(p.date || "").trim(),
          startTime: String(p.startTime || "").trim(),
          endTime: String(p.endTime || "").trim(),
          note: String(p.note || "").trim(),
        }))
    : [];

  const examTimetable = await ExamTimetable.findOneAndUpdate(
    { exam: exam._id },
    {
      $set: {
        session: exam.session,
        class: exam.class,
        examName: exam.name,
        papers,
        updatedBy: req.user?._id,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  logAudit(req, AUDIT.TIMETABLE, `Saved exam date sheet for ${exam.name} (${exam.class}, ${exam.session})`);
  res.json({ message: "Exam date sheet saved", examTimetable });
});

// ---- Parent / student portal ------------------------------------------------

// GET /api/portal/timetable  — each child's weekly class timetable.
export const getMyTimetable = asyncHandler(async (req, res) => {
  const students = await findChildren(req.user!);
  const config = await ensureConfig();
  const items = [];
  for (const s of students) {
    const timetable =
      s.section && s.session
        ? await ClassTimetable.findOne({ class: s.class, section: s.section, session: s.session })
        : null;
    items.push({
      student: { _id: s._id, name: s.name, class: s.class, section: s.section || "", session: s.session },
      slots: timetable?.slots || [],
    });
  }
  res.json({ config, items });
});

// GET /api/portal/exam-timetable  — date sheets for each child's class.
export const getMyExamTimetable = asyncHandler(async (req, res) => {
  const students = await findChildren(req.user!);
  const items = [];
  for (const s of students) {
    const sheets = await ExamTimetable.find({ class: s.class, session: s.session })
      .sort({ createdAt: -1 })
      .limit(20);
    items.push({
      student: { _id: s._id, name: s.name, class: s.class, section: s.section || "", session: s.session },
      exams: sheets
        .filter((sh) => sh.papers.length > 0)
        .map((sh) => ({ examName: sh.examName, papers: sh.papers })),
    });
  }
  res.json({ items });
});
