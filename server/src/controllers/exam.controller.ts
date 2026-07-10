import { Request } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Exam, IExam, IExamSubject } from "../models/Exam";
import { Mark } from "../models/Mark";
import { Subject } from "../models/Subject";
import { Student, IStudent } from "../models/Student";
import { Teacher, ITeacher } from "../models/Teacher";
import { Trash } from "../models/Trash";
import { CURRENT_SESSION } from "../utils/academics";
import { defaultPassMarks, defaultWeightFor, round2 } from "../utils/exams";
import { logAudit, AUDIT } from "../utils/audit";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const EXAM_TYPE_VALUES = ["unit", "halfyearly", "annual", "other"];
const normType = (t: unknown) => (EXAM_TYPE_VALUES.includes(String(t)) ? String(t) : "other");

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

// Natural roll-number order (1, 2, 10 — not 1, 10, 2), falling back to name.
const byRoll = (a: { rollNo?: string; name: string }, b: { rollNo?: string; name: string }) => {
  const na = parseInt(a.rollNo || "", 10);
  const nb = parseInt(b.rollNo || "", 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  if (!Number.isNaN(na) && Number.isNaN(nb)) return -1;
  if (Number.isNaN(na) && !Number.isNaN(nb)) return 1;
  return a.name.localeCompare(b.name);
};

// Resolve the client's [{ subject, maxMarks, passMarks? }] into stored exam subjects,
// snapshotting each subject's current name. Validates max/pass.
const buildExamSubjects = async (raw: unknown): Promise<IExamSubject[]> => {
  if (!Array.isArray(raw) || raw.length === 0) throw new ApiError(400, "Add at least one subject");
  const ids = raw.map((r: any) => r?.subject).filter(Boolean);
  const subs = await Subject.find({ _id: { $in: ids } });
  const byId = new Map(subs.map((s) => [String(s._id), s]));

  const out: IExamSubject[] = [];
  const seen = new Set<string>();
  for (const r of raw as any[]) {
    const sub = byId.get(String(r?.subject));
    if (!sub) continue;
    if (seen.has(String(sub._id))) continue;
    seen.add(String(sub._id));

    const max = Number(r.maxMarks);
    if (!Number.isFinite(max) || max <= 0) {
      throw new ApiError(400, `Max marks for ${sub.name} must be a positive number`);
    }
    let pass = Number(r.passMarks);
    if (!Number.isFinite(pass) || pass < 0) pass = defaultPassMarks(max);
    if (pass > max) pass = max;

    out.push({
      subject: sub._id as any,
      name: sub.name,
      maxMarks: Math.round(max),
      passMarks: Math.round(pass),
    });
  }
  if (!out.length) throw new ApiError(400, "None of the chosen subjects were found");
  return out;
};

// ---- Ranking ----

interface SubjectResult {
  subject: string;
  name: string;
  maxMarks: number;
  passMarks: number;
  marksObtained: number | null;
  absent: boolean;
  entered: boolean;
  passed: boolean;
}
interface StudentResult {
  student: string;
  name: string;
  admissionNo: string;
  rollNo: string;
  section: string;
  subjects: SubjectResult[];
  total: number;
  maxTotal: number;
  pct: number;
  entered: number; // subjects entered
  complete: boolean; // every subject entered
  passed: boolean; // complete AND passed every subject
  rank: number | null; // among complete students, class-wide
}

// Computes per-student results + class-wide ranks for one exam. Ranking is over all
// sections; only students with every subject entered get a rank (ties share a rank).
const computeExamResults = async (exam: IExam) => {
  const maxTotal = exam.subjects.reduce((s, x) => s + x.maxMarks, 0);

  const students = (
    await Student.find({ class: exam.class, session: exam.session, status: "active" }).select(
      "name admissionNo rollNo section"
    )
  ).sort(byRoll);

  const marks = await Mark.find({ exam: exam._id }).select("student subject marksObtained absent");
  const bySub = new Map<string, Map<string, (typeof marks)[number]>>();
  marks.forEach((m) => {
    const sid = String(m.student);
    if (!bySub.has(sid)) bySub.set(sid, new Map());
    bySub.get(sid)!.set(String(m.subject), m);
  });

  const rows: StudentResult[] = students.map((st) => {
    const sid = String(st._id);
    const sm = bySub.get(sid) || new Map();
    let total = 0;
    let entered = 0;
    let allPassed = true;

    const subjects: SubjectResult[] = exam.subjects.map((ex) => {
      const m = sm.get(String(ex.subject));
      const has = !!m;
      const absent = has ? !!m!.absent : false;
      const obtained = has && !absent && m!.marksObtained != null ? m!.marksObtained : null;
      if (has) entered += 1;
      if (obtained != null) total += obtained;
      const passed = has && !absent && (m!.marksObtained ?? 0) >= ex.passMarks;
      if (!passed) allPassed = false;
      return {
        subject: String(ex.subject),
        name: ex.name,
        maxMarks: ex.maxMarks,
        passMarks: ex.passMarks,
        marksObtained: obtained,
        absent,
        entered: has,
        passed,
      };
    });

    const complete = entered === exam.subjects.length && exam.subjects.length > 0;
    return {
      student: sid,
      name: st.name,
      admissionNo: st.admissionNo,
      rollNo: st.rollNo || "",
      section: st.section || "",
      subjects,
      total,
      maxTotal,
      pct: maxTotal > 0 ? round2((total / maxTotal) * 100) : 0,
      entered,
      complete,
      passed: complete && allPassed,
      rank: null,
    };
  });

  // Rank complete students by total (ties share a rank: 1,1,3).
  const ranked = rows
    .filter((r) => r.complete)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  let lastTotal: number | null = null;
  let lastRank = 0;
  ranked.forEach((r, i) => {
    if (lastTotal === null || r.total !== lastTotal) {
      lastRank = i + 1;
      lastTotal = r.total;
    }
    r.rank = lastRank;
  });
  const classSize = ranked.length;

  // Output order: ranked students first (by rank), then not-yet-complete by roll.
  rows.sort((a, b) => {
    if (a.complete && b.complete) return a.rank! - b.rank! || a.name.localeCompare(b.name);
    if (a.complete) return -1;
    if (b.complete) return 1;
    return byRoll(a, b);
  });

  const byStudent = new Map(rows.map((r) => [r.student, r]));
  return { maxTotal, classSize, rows, byStudent };
};

// Weighted overall/final ranking across every published exam of a class this session.
// overallPct = Σ(weight·examPct) / Σ(weight). Only students complete in ALL published
// exams are ranked (others are flagged pending).
const computeOverall = async (session: string, cls: string) => {
  const exams = await Exam.find({ session, class: cls, published: true }).sort({ createdAt: 1 });
  const students = (
    await Student.find({ class: cls, session, status: "active" }).select(
      "name admissionNo rollNo section"
    )
  ).sort(byRoll);

  if (!exams.length) {
    return { exams: [], totalWeight: 0, rows: [], classSize: 0, byStudent: new Map() };
  }

  const perExam = [] as { exam: IExam; res: Awaited<ReturnType<typeof computeExamResults>> }[];
  for (const e of exams) perExam.push({ exam: e, res: await computeExamResults(e) });
  const totalWeight = exams.reduce((s, e) => s + (e.weight || 0), 0);

  const rows = students.map((st) => {
    const sid = String(st._id);
    let weighted = 0;
    let completeAll = true;
    const breakdown = perExam.map(({ exam, res }) => {
      const row = res.byStudent.get(sid);
      const done = !!row && row.complete;
      if (!done) completeAll = false;
      if (done) weighted += (exam.weight || 0) * row!.pct;
      return {
        examId: String(exam._id),
        name: exam.name,
        type: exam.type,
        weight: exam.weight || 0,
        pct: row?.pct ?? null,
        rank: row?.rank ?? null,
        complete: done,
      };
    });
    const overallPct = completeAll && totalWeight > 0 ? round2(weighted / totalWeight) : null;
    return {
      student: sid,
      name: st.name,
      admissionNo: st.admissionNo,
      rollNo: st.rollNo || "",
      section: st.section || "",
      breakdown,
      overallPct,
      complete: completeAll,
      rank: null as number | null,
    };
  });

  const ranked = rows
    .filter((r) => r.complete)
    .sort((a, b) => b.overallPct! - a.overallPct! || a.name.localeCompare(b.name));
  let last: number | null = null;
  let lastRank = 0;
  ranked.forEach((r, i) => {
    if (last === null || r.overallPct !== last) {
      lastRank = i + 1;
      last = r.overallPct;
    }
    r.rank = lastRank;
  });
  const classSize = ranked.length;

  rows.sort((a, b) => {
    if (a.complete && b.complete) return a.rank! - b.rank! || a.name.localeCompare(b.name);
    if (a.complete) return -1;
    if (b.complete) return 1;
    return a.name.localeCompare(b.name);
  });

  const byStudent = new Map(rows.map((r) => [r.student, r]));
  return {
    exams: exams.map((e) => ({ _id: String(e._id), name: e.name, type: e.type, weight: e.weight })),
    totalWeight,
    rows,
    classSize,
    byStudent,
  };
};

// Roster of a section with each student's per-subject marks — for marks entry.
const buildEntryRoster = async (exam: IExam, section: string) => {
  const students = (
    await Student.find({
      class: exam.class,
      section,
      session: exam.session,
      status: "active",
    }).select("name admissionNo rollNo section")
  ).sort(byRoll);

  const marks = await Mark.find({
    exam: exam._id,
    student: { $in: students.map((s) => s._id) },
  }).select("student subject marksObtained absent");
  const bySub = new Map<string, Record<string, { marksObtained: number | null; absent: boolean }>>();
  marks.forEach((m) => {
    const sid = String(m.student);
    if (!bySub.has(sid)) bySub.set(sid, {});
    bySub.get(sid)![String(m.subject)] = {
      marksObtained: m.absent ? null : m.marksObtained ?? null,
      absent: !!m.absent,
    };
  });

  return {
    exam: {
      _id: String(exam._id),
      name: exam.name,
      type: exam.type,
      class: exam.class,
      session: exam.session,
      published: exam.published,
      weight: exam.weight,
      subjects: exam.subjects.map((s) => ({
        subject: String(s.subject),
        name: s.name,
        maxMarks: s.maxMarks,
        passMarks: s.passMarks,
      })),
    },
    section,
    students: students.map((s, i) => ({
      _id: String(s._id),
      name: s.name,
      admissionNo: s.admissionNo,
      rollNo: s.rollNo || String(i + 1),
      marks: bySub.get(String(s._id)) || {},
    })),
  };
};

// Upsert a single mark (shared by teacher + admin). Validates the subject belongs to
// the exam and that marks are within range. Absent unsets any prior number.
const upsertMark = async (
  exam: IExam,
  studentId: string,
  subjectId: string,
  marksObtained: unknown,
  absent: unknown,
  section: string,
  userId: unknown
) => {
  const exSub = exam.subjects.find((s) => String(s.subject) === String(subjectId));
  if (!exSub) throw new ApiError(400, "That subject isn't part of this exam");

  const isAbsent = !!absent;
  const update: any = {
    $set: {
      exam: exam._id,
      student: studentId,
      subject: subjectId,
      absent: isAbsent,
      class: exam.class,
      section,
      session: exam.session,
      markedBy: userId,
    },
  };
  if (isAbsent) {
    update.$unset = { marksObtained: "" };
  } else {
    const n = Number(marksObtained);
    if (!Number.isFinite(n) || n < 0) throw new ApiError(400, "Enter valid marks (0 or more)");
    if (n > exSub.maxMarks) throw new ApiError(400, `Marks can't exceed ${exSub.maxMarks}`);
    update.$set.marksObtained = Math.round(n * 100) / 100;
  }

  return Mark.findOneAndUpdate({ exam: exam._id, student: studentId, subject: subjectId }, update, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  });
};

const studentInSection = async (studentId: string, cls: string, section: string, session: string) => {
  const student = await Student.findById(studentId).select("class section session");
  if (!student) throw new ApiError(404, "Student not found");
  if (student.class !== cls || (student.section || "") !== section || student.session !== session) {
    throw new ApiError(400, "That student isn't in this class/section for this exam");
  }
  return student;
};

// ---------------------------------------------------------------------------
// Admin / super-admin endpoints  (/api/exams)
// ---------------------------------------------------------------------------

// GET /api/exams?session=&class=
export const listExams = asyncHandler(async (req, res) => {
  const session = String(req.query.session || CURRENT_SESSION);
  const filter: Record<string, unknown> = { session };
  if (req.query.class) filter.class = String(req.query.class);
  const exams = await Exam.find(filter).sort({ class: 1, createdAt: 1 });
  res.json({ exams });
});

// GET /api/exams/:id
export const getExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) throw new ApiError(404, "Exam not found");
  res.json({ exam });
});

// Create (or return the existing) exam for a class+session+name. Shared by admin and
// teacher so both section teachers end up entering into the same shared exam.
const createExamFor = async (req: Request, createdBy: unknown) => {
  const name = req.body.name != null ? String(req.body.name).trim() : "";
  const cls = req.body.class != null ? String(req.body.class).trim() : "";
  if (!name || !cls) throw new ApiError(400, "Exam name and class are required");
  const session = req.body.session ? String(req.body.session) : CURRENT_SESSION;

  const existing = await Exam.findOne({ session, class: cls, name });
  if (existing) return { exam: existing, existed: true };

  const type = normType(req.body.type);
  const subjects = await buildExamSubjects(req.body.subjects || []);
  const weight = Number.isFinite(Number(req.body.weight))
    ? Number(req.body.weight)
    : defaultWeightFor(type);

  const exam = await Exam.create({
    name,
    type,
    session,
    class: cls,
    weight,
    subjects,
    createdBy,
  });
  logAudit(req, AUDIT.EXAM, `Created exam "${name}" for class ${cls} (${session})`, {
    entity: "Exam",
    entityId: String(exam._id),
  });
  return { exam, existed: false };
};

// POST /api/exams  (super admin / admin)
export const createExam = asyncHandler(async (req, res) => {
  const { exam, existed } = await createExamFor(req, req.user!._id);
  res
    .status(existed ? 200 : 201)
    .json({ message: existed ? "This exam already exists" : "Exam created", exam, existed });
});

// PUT /api/exams/:id  (super admin / admin) — edit definition (name/type/weight/subjects)
export const updateExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) throw new ApiError(404, "Exam not found");

  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) throw new ApiError(400, "Exam name is required");
    const clash = await Exam.findOne({
      _id: { $ne: exam._id },
      session: exam.session,
      class: exam.class,
      name,
    });
    if (clash) throw new ApiError(400, "Another exam for this class already uses that name");
    exam.name = name;
  }
  if (req.body.type !== undefined) exam.type = normType(req.body.type);
  if (req.body.weight !== undefined && Number.isFinite(Number(req.body.weight))) {
    exam.weight = Math.max(0, Number(req.body.weight));
  }
  if (req.body.subjects !== undefined) {
    exam.subjects = await buildExamSubjects(req.body.subjects);
  }

  await exam.save();
  logAudit(req, AUDIT.EXAM, `Updated exam "${exam.name}" (class ${exam.class})`, {
    entity: "Exam",
    entityId: String(exam._id),
  });
  res.json({ message: "Exam updated", exam });
});

// POST /api/exams/:id/publish  { published }  (super admin / admin only — the gate
// that makes results visible to parents)
export const setExamPublish = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) throw new ApiError(404, "Exam not found");
  const publish = !!req.body.published;
  exam.published = publish;
  exam.publishedAt = publish ? new Date() : undefined;
  exam.publishedBy = publish ? (req.user!._id as any) : undefined;
  await exam.save();
  logAudit(
    req,
    AUDIT.EXAM,
    `${publish ? "Published" : "Unpublished"} exam "${exam.name}" (class ${exam.class})`,
    { entity: "Exam", entityId: String(exam._id) }
  );
  res.json({ message: publish ? "Results published to parents" : "Results hidden from parents", exam });
});

// DELETE /api/exams/:id  -> recycle bin (super admin / admin). Snapshots the exam AND
// all its marks so a restore brings everything back exactly.
export const deleteExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) throw new ApiError(404, "Exam not found");

  const marks = await Mark.find({ exam: exam._id });
  const data: any = exam.toObject();
  data.__marks = marks.map((m) => m.toObject());

  await Trash.create({
    kind: "Exam",
    originalId: exam._id,
    label: `${exam.name} — class ${exam.class} (${exam.session})`,
    data,
    deletedBy: req.user?._id,
    deletedByName: req.user?.name,
  });
  await Mark.deleteMany({ exam: exam._id });
  await exam.deleteOne();

  logAudit(
    req,
    AUDIT.EXAM,
    `Deleted exam "${exam.name}" (class ${exam.class}) with ${marks.length} mark(s) — recoverable from recycle bin`
  );
  res.json({ message: "Exam moved to recycle bin" });
});

// GET /api/exams/:id/results  (super admin / admin) — full class-wide ranking + rows
export const getExamResults = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) throw new ApiError(404, "Exam not found");
  const { maxTotal, classSize, rows } = await computeExamResults(exam);
  const completed = rows.filter((r) => r.complete).length;
  res.json({
    exam: {
      _id: String(exam._id),
      name: exam.name,
      type: exam.type,
      class: exam.class,
      session: exam.session,
      published: exam.published,
      weight: exam.weight,
      subjects: exam.subjects,
    },
    meta: { maxTotal, classSize, total: rows.length, completed, pending: rows.length - completed },
    rows,
  });
});

// GET /api/exams/overall?session=&class=  (super admin / admin) — weighted final rank
export const getOverallResults = asyncHandler(async (req, res) => {
  const session = String(req.query.session || CURRENT_SESSION);
  const cls = String(req.query.class || "");
  if (!cls) throw new ApiError(400, "class is required");
  const { exams, totalWeight, rows, classSize } = await computeOverall(session, cls);
  res.json({ session, class: cls, exams, totalWeight, classSize, rows });
});

// GET /api/exams/:id/entry?section=  (super admin / admin) — roster to enter/override
export const getExamEntryAdmin = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) throw new ApiError(404, "Exam not found");
  const section = String(req.query.section || "");
  if (!section) throw new ApiError(400, "section is required");
  res.json(await buildEntryRoster(exam, section));
});

// POST /api/exams/:id/marks  (super admin / admin) — enter/override a mark (any section)
export const markOneAdmin = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) throw new ApiError(404, "Exam not found");
  const { studentId, subjectId, marksObtained, absent } = req.body;
  const student = await studentInSection(studentId, exam.class, String(req.body.section || ""), exam.session);
  const mark = await upsertMark(
    exam,
    studentId,
    subjectId,
    marksObtained,
    absent,
    student.section || "",
    req.user!._id
  );
  res.json({ mark });
});

// DELETE /api/exams/:id/marks  { studentId, subjectId }  (super admin / admin)
export const clearMarkAdmin = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) throw new ApiError(404, "Exam not found");
  const { studentId, subjectId } = { ...req.query, ...req.body } as Record<string, string>;
  await Mark.deleteOne({ exam: exam._id, student: studentId, subject: subjectId });
  res.json({ message: "Cleared" });
});

// ---------------------------------------------------------------------------
// Teacher endpoints  (/api/teacher/*  — role: teacher)
// ---------------------------------------------------------------------------

// GET /api/teacher/exams  — exams for the classes this teacher is class-teacher of
export const teacherListExams = asyncHandler(async (req, res) => {
  const teacher = await teacherForUser(req);
  const classes = [
    ...new Set(
      teacher.assignments
        .filter((a) => a.session === CURRENT_SESSION)
        .map((a) => a.class)
    ),
  ];
  const exams = classes.length
    ? await Exam.find({ session: CURRENT_SESSION, class: { $in: classes } }).sort({ class: 1, createdAt: 1 })
    : [];
  res.json({ exams, assignments: teacher.assignments.filter((a) => a.session === CURRENT_SESSION) });
});

// POST /api/teacher/exams  — teacher creates (or reuses) an exam for their class
export const teacherCreateExam = asyncHandler(async (req, res) => {
  const teacher = await teacherForUser(req);
  const cls = req.body.class != null ? String(req.body.class).trim() : "";
  const assignedToClass = teacher.assignments.some(
    (a) => a.class === cls && a.session === CURRENT_SESSION
  );
  if (!assignedToClass) throw new ApiError(403, `You are not a class-teacher of class ${cls}`);
  const { exam, existed } = await createExamFor(req, req.user!._id);
  res
    .status(existed ? 200 : 201)
    .json({ message: existed ? "This exam already exists — you can enter marks now" : "Exam created", exam, existed });
});

// GET /api/teacher/exams/:id/entry?section=  — roster of the teacher's section
export const getExamEntryTeacher = asyncHandler(async (req, res) => {
  const teacher = await teacherForUser(req);
  const exam = await Exam.findById(req.params.id);
  if (!exam) throw new ApiError(404, "Exam not found");
  const section = String(req.query.section || "");
  if (!isAssigned(teacher, exam.class, section)) {
    throw new ApiError(403, `You are not the class-teacher of ${exam.class}-${section}`);
  }
  res.json(await buildEntryRoster(exam, section));
});

// POST /api/teacher/marks  { examId, studentId, subjectId, marksObtained, absent, section }
export const markOneTeacher = asyncHandler(async (req, res) => {
  const teacher = await teacherForUser(req);
  const exam = await Exam.findById(req.body.examId);
  if (!exam) throw new ApiError(404, "Exam not found");
  if (exam.published) {
    throw new ApiError(400, "This exam is published. Ask the admin to unlock it before editing marks.");
  }
  const section = String(req.body.section || "");
  if (!isAssigned(teacher, exam.class, section)) {
    throw new ApiError(403, `You are not the class-teacher of ${exam.class}-${section}`);
  }
  const { studentId, subjectId, marksObtained, absent } = req.body;
  await studentInSection(studentId, exam.class, section, exam.session);
  const mark = await upsertMark(exam, studentId, subjectId, marksObtained, absent, section, req.user!._id);
  res.json({ mark });
});

// DELETE /api/teacher/marks  { examId, studentId, subjectId, section }
export const clearMarkTeacher = asyncHandler(async (req, res) => {
  const teacher = await teacherForUser(req);
  const body = { ...req.query, ...req.body } as Record<string, string>;
  const exam = await Exam.findById(body.examId);
  if (!exam) throw new ApiError(404, "Exam not found");
  if (exam.published) {
    throw new ApiError(400, "This exam is published. Ask the admin to unlock it before editing marks.");
  }
  if (!isAssigned(teacher, exam.class, body.section || "")) {
    throw new ApiError(403, "You are not the class-teacher of this section");
  }
  await Mark.deleteOne({ exam: exam._id, student: body.studentId, subject: body.subjectId });
  res.json({ message: "Cleared" });
});

// ---------------------------------------------------------------------------
// Parent portal helper (published results only) — used by portal.controller
// ---------------------------------------------------------------------------

export const resultsForStudents = async (students: IStudent[]) => {
  const out = [];
  for (const st of students) {
    const session = st.session || CURRENT_SESSION;
    const exams = await Exam.find({ class: st.class, session, published: true }).sort({ createdAt: 1 });

    const examResults = [];
    for (const e of exams) {
      const { maxTotal, classSize, byStudent } = await computeExamResults(e);
      const row = byStudent.get(String(st._id));
      examResults.push({
        examId: String(e._id),
        name: e.name,
        type: e.type,
        weight: e.weight,
        subjects:
          row?.subjects ||
          e.subjects.map((s) => ({
            subject: String(s.subject),
            name: s.name,
            maxMarks: s.maxMarks,
            passMarks: s.passMarks,
            marksObtained: null,
            absent: false,
            entered: false,
            passed: false,
          })),
        total: row?.total ?? 0,
        maxTotal,
        pct: row?.pct ?? 0,
        rank: row?.rank ?? null,
        classSize,
        complete: row?.complete ?? false,
        passed: row?.passed ?? false,
      });
    }

    let overall = null;
    if (exams.length) {
      const ov = await computeOverall(session, st.class);
      const orow = ov.byStudent.get(String(st._id));
      overall = orow
        ? { pct: orow.overallPct, rank: orow.rank, classSize: ov.classSize, complete: orow.complete }
        : null;
    }

    out.push({
      student: {
        _id: String(st._id),
        name: st.name,
        admissionNo: st.admissionNo,
        class: st.class,
        section: st.section || "",
        rollNo: st.rollNo || "",
        session,
      },
      exams: examResults,
      overall,
    });
  }
  return out;
};
