import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import {
  classLabel,
  classesUpTo,
  nextClass,
  nextClassWithin,
  normalizeClass,
  normalizeSession,
} from "../utils/academics";
import { getSchoolSetting } from "../models/SchoolSetting";
import { currentSession } from "../utils/session";
import { logAudit, AUDIT } from "../utils/audit";
import { Student, IStudent } from "../models/Student";
import { User } from "../models/User";
import { PromotionRun } from "../models/PromotionRun";
import { moveToTrash } from "./trash.controller";

// GET /api/students?search=&class=&section=&session=&status=&parentName=
export const getStudents = asyncHandler(async (req, res) => {
  const { search, class: className, section, session, status, parentName } = req.query as Record<
    string,
    string
  >;

  const filter: Record<string, unknown> = {};
  if (className) filter.class = className;
  if (section) filter.section = section;
  if (session) filter.session = session;
  if (status) filter.status = status;
  if (parentName) filter.parentName = { $regex: parentName, $options: "i" };
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { admissionNo: { $regex: search, $options: "i" } },
      { parentPhone: { $regex: search, $options: "i" } },
    ];
  }

  // Sort by createdAt with _id as a tiebreaker — _id is unique, so pages stay
  // deterministic even when many students share the same createdAt (bulk imports).
  const sort = { createdAt: -1 as const, _id: -1 as const };

  // Full list (export / promotion roster) — bypasses pagination.
  if ((req.query.all as string) === "1") {
    const students = await Student.find(filter).sort(sort);
    res.json({ students, total: students.length, page: 1, pages: 1, limit: students.length });
    return;
  }

  // Filters are applied first (across the whole DB), then the result is paginated,
  // so searching/filtering always finds matches — not just within the current page.
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const [total, students] = await Promise.all([
    Student.countDocuments(filter),
    Student.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  res.json({ students, total, page, pages: Math.max(1, Math.ceil(total / limit)), limit });
});

// GET /api/students/sessions -> distinct sessions present, newest first
export const getSessions = asyncHandler(async (_req, res) => {
  const sessions: string[] = await Student.distinct("session");
  sessions.sort().reverse();
  res.json({ sessions });
});

// GET /api/students/:id
export const getStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) throw new ApiError(404, "Student not found");
  res.json({ student });
});

// POST /api/students
export const createStudent = asyncHandler(async (req, res) => {
  const { admissionNo, parentEmail } = req.body;

  const exists = await Student.findOne({ admissionNo });
  if (exists) throw new ApiError(400, "A student with this admission number already exists");

  // Link to a parent login account if one exists with the given email.
  let parent = undefined;
  if (parentEmail) {
    const parentUser = await User.findOne({ email: parentEmail });
    if (parentUser) parent = parentUser._id;
  }

  const student = await Student.create({ ...req.body, parent });
  logAudit(req, AUDIT.STUDENT, `Added student ${student.name} (${student.admissionNo})`, {
    entity: "Student",
    entityId: String(student._id),
  });
  res.status(201).json({ message: "Student added", student });
});

// PUT /api/students/:id
export const updateStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) throw new ApiError(404, "Student not found");

  const fields = [
    "name",
    "dateOfAdmission",
    "dateOfBirth",
    "session",
    "class",
    "section",
    "rollNo",
    "gender",
    "category",
    "parentName",
    "motherName",
    "parentPhone",
    "parentEmail",
    "address",
    "optedServices",
    "serviceFees",
    "status",
  ] as const;

  fields.forEach((field) => {
    if (req.body[field] !== undefined) (student as any)[field] = req.body[field];
  });

  await student.save();
  logAudit(req, AUDIT.STUDENT, `Updated student ${student.name} (${student.admissionNo})`, {
    entity: "Student",
    entityId: String(student._id),
  });
  res.json({ message: "Student updated", student });
});

// POST /api/students/:id/leave  { date?, reason? }
// Marks a student as having left school. Date/reason are optional.
export const markStudentLeft = asyncHandler(async (req, res) => {
  const { date, reason } = req.body;
  const student = await Student.findById(req.params.id);
  if (!student) throw new ApiError(404, "Student not found");

  student.status = "left";
  student.exitDate = date ? new Date(date) : new Date();
  student.exitReason = reason || undefined;
  await student.save();
  logAudit(
    req,
    AUDIT.STUDENT,
    `Marked ${student.name} (${student.admissionNo}) as left${reason ? ` — ${reason}` : ""}`
  );
  res.json({ message: "Student marked as left school", student });
});

// POST /api/students/:id/rejoin -> undo "left" (in case it was a mistake)
export const rejoinStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) throw new ApiError(404, "Student not found");

  student.status = "active";
  student.exitDate = undefined;
  student.exitReason = undefined;
  await student.save();
  logAudit(req, AUDIT.STUDENT, `Reactivated ${student.name} (${student.admissionNo})`);
  res.json({ message: "Student reactivated", student });
});

// POST /api/students/readmit  { ids: [], class, session, section?, keepRollNo? }
// Brings finished students back into the school in a higher class — the case a
// school creates for itself by adding Class 11 and 12 after its Class 10 batch has
// already passed out. It is a re-enrolment, not an undo: the passing-out year stays
// in their history, the admission number stays theirs, and their fee ledger follows
// them, so a re-admitted child is the same person on paper as before.
export const readmitStudents = asyncHandler(async (req, res) => {
  const { ids, section } = req.body;
  const cls = req.body.class;
  if (!Array.isArray(ids) || ids.length === 0) throw new ApiError(400, "Select at least one student");
  if (!cls || !req.body.session) throw new ApiError(400, "A class and a session are required");

  // A re-admission into something that is not a session leaves the child on no
  // register, in no fee run and on no report — the same trap the settings screen and
  // the import both guard, so it is guarded here too.
  const session = normalizeSession(req.body.session);
  if (!session) {
    throw new ApiError(400, 'A session looks like "2027-28" — four digits, then the next year.');
  }

  const { highestClass } = await getSchoolSetting();
  if (!classesUpTo(highestClass).includes(String(cls))) {
    throw new ApiError(
      400,
      `${classLabel(String(cls))} is beyond ${classLabel(highestClass)}, the last class this school teaches. Raise that setting first.`
    );
  }

  const students = await Student.find({ _id: { $in: ids } });
  let readmitted = 0;
  const skipped: string[] = [];

  for (const s of students) {
    if (s.status === "active") {
      skipped.push(`${s.name} is already studying here`);
      continue;
    }
    // Keep where they were before this re-admission, so the record still shows the
    // class they passed out of and the year they did it.
    s.enrollmentHistory.push({ session: s.session, class: s.class, section: s.section });
    s.session = session;
    s.class = String(cls);
    if (section !== undefined) s.section = section || undefined;
    s.status = "active";
    s.exitDate = undefined;
    s.exitReason = undefined;
    await s.save();
    readmitted += 1;
  }

  if (readmitted) {
    logAudit(
      req,
      AUDIT.STUDENT,
      `Re-admitted ${readmitted} student(s) into ${classLabel(String(cls))} for ${session}`
    );
  }

  // Same hidden-register trap as promotion: a child re-admitted into a year the school
  // has not started sits in a class no register will show until it does.
  const running = currentSession();
  const sessionWarning =
    readmitted > 0 && session !== running
      ? `These students are now in ${session}, but the school is still running ${running}. ` +
        `Their class registers and timetables stay hidden until you start ${session} ` +
        `(Students -> Promote Class -> Start new session).`
      : undefined;

  res.json({
    message: `Re-admitted ${readmitted} student(s) into ${classLabel(String(cls))} (${session})${
      skipped.length ? `, ${skipped.length} skipped` : ""
    }.`,
    readmitted,
    skipped,
    sessionWarning,
  });
});

// POST /api/students/promote
// { fromSession, fromClass, fromSection?, toSession, failedIds?: string[] }
//
// Advances active students sitting in (fromSession, fromClass[, fromSection]) into the
// next class for `toSession`, preserving their section. The prior position is archived
// in enrollmentHistory (previous-session data is never erased).
//
// Because the source is keyed by `fromSession`, promoting e.g. 1B -> 2B (new session)
// never picks up the old 2B students (still on the previous session) who are due to go
// to 3B — so the two 2B batches don't merge.
//
// Failed students repeat the same class in the new session. Passing the school's
// HIGHEST class means finishing school — those students are marked "passed", not
// promoted into a class the school does not teach.
export const promoteStudents = asyncHandler(async (req, res) => {
  const { fromSession, fromClass, fromSection, toSession, failedIds = [] } = req.body;

  if (!fromSession || !fromClass || !toSession) {
    throw new ApiError(400, "fromSession, fromClass and toSession are required");
  }
  if (fromSession === toSession) {
    throw new ApiError(400, "The target session must be different from the current session");
  }

  // A school that stops at Class 10 must not send its Class 10 into a Class 11.
  const { highestClass } = await getSchoolSetting();
  const running = currentSession();
  const promotedClass = nextClassWithin(fromClass, highestClass); // null = they have finished

  const filter: Record<string, unknown> = {
    session: fromSession,
    class: fromClass,
    status: "active",
  };
  if (fromSection) filter.section = fromSection;

  const students = await Student.find(filter);
  const failedSet = new Set((failedIds as string[]).map(String));

  let promoted = 0;
  let retained = 0;
  let passedOut = 0;
  const entries: {
    student: any;
    prevSession: string;
    prevClass: string;
    prevSection?: string;
    prevStatus: string;
  }[] = [];

  for (const s of students) {
    // Snapshot the exact position BEFORE promotion so the run can be undone.
    entries.push({
      student: s._id,
      prevSession: s.session,
      prevClass: s.class,
      prevSection: s.section,
      prevStatus: s.status,
    });

    // Archive the current position before changing anything.
    s.enrollmentHistory.push({ session: s.session, class: s.class, section: s.section });

    const failed = failedSet.has(String(s._id));

    if (failed) {
      // Repeat the same class in the new session.
      s.session = toSession;
      retained += 1;
    } else if (promotedClass) {
      // Advance to the next class in the new session (section unchanged).
      s.session = toSession;
      s.class = promotedClass;
      promoted += 1;
    } else {
      // They passed the last class this school teaches, so they have finished here.
      s.status = "passed";
      s.exitDate = new Date();
      s.exitReason = `Passed out of ${classLabel(fromClass)} (${fromSession})`;
      passedOut += 1;
    }

    await s.save();
  }

  const parts = promoted ? [`${promoted} promoted`] : [];
  if (retained) parts.push(`${retained} retained`);
  if (passedOut) parts.push(`${passedOut} passed out`);
  if (!parts.length) parts.push("0 promoted");

  const message = students.length
    ? `${classLabel(fromClass)}${fromSection ? " " + fromSection : ""}: ${parts.join(", ")} for ${toSession}.`
    : `No active students found in ${classLabel(fromClass)}${fromSection ? " " + fromSection : ""} for session ${fromSession}.`;

  // Registers, timetables and a teacher's own classes are all read for the session
  // the school says it is running. Promoting children into a later one without
  // moving that leaves their new class invisible — the roster comes back empty and
  // attendance cannot be marked — so say so rather than let it be discovered on a
  // Monday morning.
  // A retained child moves into the new session too — they simply keep their class —
  // so their register is just as hidden. Keying this on promotions alone meant a class
  // where everybody repeated the year slipped into the new session in total silence.
  const sessionWarning =
    promoted + retained > 0 && toSession !== running
      ? `These students are now in ${toSession}, but the school is still running ${running}. ` +
        `Their class registers and timetables stay hidden until you start ${toSession} ` +
        `(Students -> Promote Class -> Start new session).`
      : undefined;

  let runId: string | undefined;
  if (students.length) {
    const run = await PromotionRun.create({
      fromSession,
      fromClass,
      fromSection: fromSection || undefined,
      toSession,
      summary: message,
      entries,
      by: req.user?._id,
      byName: req.user?.name,
    });
    runId = String(run._id);
    logAudit(req, AUDIT.PROMOTION, message);
  }

  res.json({
    message,
    promoted,
    retained,
    passedOut,
    isFinalClass: promotedClass === null,
    highestClass,
    currentSession: running,
    sessionWarning,
    matched: students.length,
    runId,
  });
});

// GET /api/students/promote/runs -> recent promotion runs (for the undo list)
export const getPromotionRuns = asyncHandler(async (_req, res) => {
  const runs = await PromotionRun.find().sort({ createdAt: -1 }).limit(20);
  res.json({ runs });
});

// POST /api/students/promote/undo/:runId -> roll a whole promotion batch back
export const undoPromotion = asyncHandler(async (req, res) => {
  const run = await PromotionRun.findById(req.params.runId);
  if (!run) throw new ApiError(404, "Promotion run not found");
  if (run.undone) throw new ApiError(400, "This promotion has already been undone");

  // Undoing puts children back exactly where they were — which is a problem if the
  // school has LOWERED its last class since. A school that passed Class 10 out and
  // then became a middle school would get three active Class 10 students back, and
  // nothing could promote or pass them out again. Say so instead, and name the way
  // out: the undo still works the moment the setting is put back.
  const { highestClass } = await getSchoolSetting();
  const allowed = classesUpTo(highestClass);
  const stranded = [...new Set(run.entries.map((e) => e.prevClass))].filter(
    (c) => !allowed.includes(c)
  );
  if (stranded.length) {
    throw new ApiError(
      400,
      `This promotion would put students back into ${stranded
        .map(classLabel)
        .join(", ")}, which is above ${classLabel(
        highestClass
      )} — the last class this school now teaches. Raise that setting first, then undo.`
    );
  }

  let reverted = 0;
  for (const e of run.entries) {
    const s = await Student.findById(e.student);
    if (!s) continue;
    s.session = e.prevSession;
    s.class = e.prevClass;
    s.section = e.prevSection;
    s.status = e.prevStatus as any;
    // Graduated students had exit info stamped by the promotion — clear it.
    if (e.prevStatus === "active") {
      s.exitDate = undefined;
      s.exitReason = undefined;
    }
    // Remove the enrollmentHistory entry this promotion pushed (the matching last one).
    const hist = s.enrollmentHistory;
    for (let i = hist.length - 1; i >= 0; i--) {
      if (hist[i].session === e.prevSession && hist[i].class === e.prevClass) {
        hist.splice(i, 1);
        break;
      }
    }
    await s.save();
    reverted += 1;
  }

  run.undone = true;
  await run.save();
  logAudit(req, AUDIT.PROMOTION, `Undid promotion: ${run.summary} (${reverted} students restored)`);
  res.json({ message: `Promotion undone — ${reverted} student(s) restored`, reverted });
});

// Runs jobs a few at a time. The import used to await a findOne and a create for
// every single row, so a 341-student file meant 682 round trips one after another —
// about a minute against a hosted database, and proportionally worse for a whole
// school. The rows don't depend on each other, so a small pool turns that minute
// into seconds while leaving the connection pool room to breathe.
const inPool = async <T>(items: T[], size: number, job: (item: T, index: number) => Promise<void>) => {
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) await job(items[i], i);
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
};

// A money amount as a person writes it: "1,200", "₹900", "Rs. 450", " 700 ". Returns
// null when it is not a number at all, so the caller can SAY so rather than store
// nothing and leave the office to discover a missing bus fare months later.
const parseAmount = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value ?? "")
    .trim()
    .replace(/^(rs\.?|inr)\s*/i, "")
    .replace(/[₹\s]/g, "")
    .replace(/,/g, "");
  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
};

// Turns one imported row into the fields to store. `create` is the whole student;
// `update` holds only what the file actually supplied, so refreshing an existing
// record fills in and corrects things without blanking out anything the file is
// silent about (a CSV without a mother's-name column must not erase it).
//
// `fatal` is a reason the row cannot be stored at all; `problems` are things worth
// telling the office about that do not stop the child being imported. Silence was the
// old failure: an unreadable fee simply vanished.
const shapeImportRow = (row: any, school: { highestClass: string; allowed: string[] }) => {
  const genders = ["Male", "Female", "Other"];
  const statuses = ["active", "left", "passed", "inactive"];
  const given = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";
  const problems: string[] = [];
  let fatal: string | null = null;

  const create: Record<string, unknown> = {};
  const update: Record<string, unknown> = {};
  const both = (key: string, value: unknown) => {
    create[key] = value;
    update[key] = value;
  };

  both("admissionNo", String(row.admissionNo).trim());
  both("name", String(row.name).trim());

  // The class has to be one this school actually teaches, stored under the one name
  // the rest of the app uses. A file saying "Class 5" used to create a class called
  // "Class 5" that matched no fee structure and no register; a file saying "12" in a
  // school that stops at Class 10 used to leave a child nothing could ever promote,
  // and blocked the school from saving its own settings afterwards.
  const cls = normalizeClass(row.class);
  if (!cls) {
    fatal = `"${String(row.class).trim()}" is not a class this school has`;
  } else if (!school.allowed.includes(cls)) {
    fatal = `${classLabel(cls)} is beyond ${classLabel(
      school.highestClass
    )}, the last class this school teaches`;
  } else {
    both("class", cls);
  }

  for (const key of [
    "section", "rollNo", "category", "parentName", "motherName",
    "parentPhone", "parentEmail", "address",
  ]) {
    if (given(row[key])) both(key, String(row[key]).trim());
    else create[key] = undefined;
  }

  // Likewise the session: written the app's one way, or not at all. A file is allowed
  // to leave it out — the child then joins the year the school is running, which is
  // what a fresh import wants.
  if (given(row.session)) {
    const session = normalizeSession(row.session);
    if (!session) {
      fatal = fatal || `"${String(row.session).trim()}" is not a session (it looks like "2026-27")`;
    } else {
      both("session", session);
    }
  } else {
    create.session = undefined;
  }

  create.gender = "";
  if (genders.includes(row.gender)) both("gender", row.gender);

  create.status = "active";
  if (statuses.includes(row.status)) both("status", row.status);

  for (const key of ["dateOfAdmission", "dateOfBirth"] as const) {
    create[key] = undefined;
    if (!given(row[key])) continue;
    const d = new Date(row[key]);
    if (!Number.isNaN(d.getTime())) both(key, d);
  }

  // optedServices may arrive as an array (JSON) or a ";"/","-joined string (CSV).
  const hasOpted = Array.isArray(row.optedServices) || given(row.optedServices);
  const opted: string[] = Array.isArray(row.optedServices)
    ? row.optedServices.map((s: unknown) => String(s).trim()).filter(Boolean)
    : typeof row.optedServices === "string" && row.optedServices.trim()
    ? row.optedServices.split(/[;,]/).map((s: string) => s.trim()).filter(Boolean)
    : [];
  create.optedServices = opted;
  if (hasOpted) update.optedServices = opted;

  // Per-student amount overrides for opted services (e.g. a longer bus route).
  // Only kept for services the student actually opted into; the model's pre-save
  // hook prunes any stragglers too.
  // A JSON file carries them as objects; a CSV column carries them as text, like
  // "Transport:900;Meal:300".
  const rawFees: { name: string; amount: unknown }[] = Array.isArray(row.serviceFees)
    ? row.serviceFees.map((f: any) => ({ name: String(f?.name || "").trim(), amount: f?.amount }))
    : typeof row.serviceFees === "string" && row.serviceFees.trim()
    ? // A comma between two digits is a thousands separator, not a gap between two
      // services: "Transport:1,200" is one fee of ₹1,200, while
      // "Transport:900,Meal:300" is two fees. Splitting on every comma tore the first
      // one in half and stored a ₹1,200 bus fare as ₹1, with nothing reported.
      row.serviceFees
        .replace(/(\d),(\d)/g, "$1$2")
        .split(/[;,]/)
        .map((part: string) => {
          const at = part.lastIndexOf(":");
          return at < 0
            ? { name: part.trim(), amount: null }
            : { name: part.slice(0, at).trim(), amount: part.slice(at + 1).trim() };
        })
        .filter((f: { name: string }) => f.name)
    : [];

  const serviceFees: { name: string; amount: number }[] = [];
  for (const f of rawFees) {
    const amount = parseAmount(f.amount);
    if (amount === null) {
      problems.push(`the fee for "${f.name}" could not be read from "${String(f.amount ?? "")}"`);
      continue;
    }
    if (amount < 0) {
      problems.push(`the fee for "${f.name}" is a negative amount`);
      continue;
    }
    if (!opted.includes(f.name)) {
      problems.push(`a fee was given for "${f.name}" but this student has not opted into it`);
      continue;
    }
    serviceFees.push({ name: f.name, amount });
  }
  create.serviceFees = serviceFees;
  if (rawFees.length) update.serviceFees = serviceFees;

  return { create, update, problems, fatal };
};

// POST /api/students/import-preview  { admissionNos: [...] }
// How many of these are already on file? The import screen asks this before sending
// the file, so it can offer to refresh existing records instead of silently skipping
// them.
export const previewImport = asyncHandler(async (req, res) => {
  const list = req.body.admissionNos;
  if (!Array.isArray(list)) throw new ApiError(400, "Expected { admissionNos: [...] }");
  const admissionNos = [...new Set(list.map((a: unknown) => String(a).trim()).filter(Boolean))];
  const existing = admissionNos.length
    ? await Student.countDocuments({ admissionNo: { $in: admissionNos } })
    : 0;
  res.json({ total: admissionNos.length, existing });
});

// POST /api/students/import  { students: [...], updateExisting?: boolean }
// Bulk-loads students (e.g. restoring a backup or loading old records). An admission
// number already on file is skipped, so the import is safe to re-run — unless
// `updateExisting` is set, in which case those records are refreshed from the file.
// That matters after a lossy first import: a CSV carries no fee amounts, so the
// students land without them, and re-importing the JSON would otherwise skip every
// one of them and leave the fees missing for good.
export const importStudents = asyncHandler(async (req, res) => {
  const rows = req.body.students;
  const updateExisting = req.body.updateExisting === true;
  if (!Array.isArray(rows)) {
    throw new ApiError(400, "Expected a JSON body of the form { students: [...] }");
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const failures: { row: number; message: string }[] = [];
  const fail = (i: number, admissionNo: string, message: string) =>
    failures.push({ row: i + 1, message: `Row ${i + 1}${admissionNo ? ` (${admissionNo})` : ""}: ${message}` });
  // Things worth saying out loud that do not stop a child being imported. Without
  // these the office had no way to know a fee had been misread.
  const cautions: { row: number; message: string }[] = [];
  const caution = (i: number, admissionNo: string, message: string) =>
    cautions.push({ row: i + 1, message: `Row ${i + 1}${admissionNo ? ` (${admissionNo})` : ""}: ${message}` });

  // A row may only name a class this school teaches, so an import cannot leave a child
  // where nothing can ever promote them.
  const { highestClass } = await getSchoolSetting();
  const school = { highestClass, allowed: classesUpTo(highestClass) };

  // ---- 1. check every row up front, without touching the database -----------
  const usable: { index: number; admissionNo: string; shaped: ReturnType<typeof shapeImportRow> }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const admissionNo = row.admissionNo != null ? String(row.admissionNo).trim() : "";
    if (!admissionNo || !row.name || row.class == null || String(row.class).trim() === "") {
      fail(i, admissionNo, "admissionNo, name and class are required");
      continue;
    }
    // Two rows for the same admission number would otherwise race each other.
    if (seen.has(admissionNo)) {
      fail(i, admissionNo, "this admission number appears more than once in the file");
      continue;
    }
    seen.add(admissionNo);
    const shaped = shapeImportRow(row, school);
    if (shaped.fatal) {
      fail(i, admissionNo, shaped.fatal);
      continue;
    }
    shaped.problems.forEach((p) => caution(i, admissionNo, p));
    usable.push({ index: i, admissionNo, shaped });
  }

  // ---- 2. one query to find out which of them are already on file -----------
  const existing = new Map<string, IStudent>();
  if (usable.length) {
    const docs = await Student.find({ admissionNo: { $in: usable.map((u) => u.admissionNo) } });
    for (const doc of docs) existing.set(doc.admissionNo, doc);
  }

  // ---- 3. write, a pool at a time -------------------------------------------
  await inPool(usable, 20, async ({ index, admissionNo, shaped }) => {
    try {
      const doc = existing.get(admissionNo);
      if (doc) {
        if (!updateExisting) {
          skipped += 1;
          return;
        }
        // Saving through the document keeps the model's own tidying up in play:
        // pruning fees for services no longer used, and storing the parent's
        // mobile in the one canonical form that logging in relies on.
        doc.set(shaped.update);
        await doc.save();
        updated += 1;
        return;
      }
      await Student.create(shaped.create);
      inserted += 1;
    } catch (err: any) {
      fail(index, admissionNo, err.message);
    }
  });

  failures.sort((a, b) => a.row - b.row);
  const errors = failures.map((f) => f.message);
  cautions.sort((a, b) => a.row - b.row);
  const warnings = cautions.map((c) => c.message);

  if (inserted || updated) {
    logAudit(
      req,
      AUDIT.STUDENT,
      `Imported ${inserted} student(s)${updated ? `, updated ${updated} existing` : ""}`
    );
  }

  const parts = [`Imported ${inserted}`];
  if (updateExisting) parts.push(`updated ${updated} existing`);
  else parts.push(`skipped ${skipped} existing`);
  if (errors.length) parts.push(`${errors.length} error(s)`);
  if (warnings.length) parts.push(`${warnings.length} to check`);

  res.json({
    message: `${parts.join(", ")}.`,
    inserted,
    updated,
    skipped,
    errors,
    warnings,
  });
});

// POST /api/students/bulk-services  { ids: [], service, action: "add" | "remove" }
// Adds/removes an optional service (e.g. Transport) for many students at once.
export const bulkUpdateServices = asyncHandler(async (req, res) => {
  const { ids, service, action } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(400, "Select at least one student");
  }
  if (!service) throw new ApiError(400, "A service is required");

  const remove = action === "remove";
  const update = remove
    ? { $pull: { optedServices: service, serviceFees: { name: service } } }
    : { $addToSet: { optedServices: service } };

  const result = await Student.updateMany({ _id: { $in: ids } }, update);

  const msg = `${remove ? "Removed" : "Added"} "${service}" ${remove ? "from" : "to"} ${
    result.modifiedCount
  } student(s)`;
  logAudit(req, AUDIT.STUDENT, msg);

  res.json({ message: msg, modified: result.modifiedCount });
});

// DELETE /api/students/:id  -> moves the student to the recycle bin (restorable)
export const deleteStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) throw new ApiError(404, "Student not found");
  const { name, admissionNo } = student;
  await moveToTrash(req, "Student", student, `${name} (${admissionNo})`);
  logAudit(req, AUDIT.STUDENT, `Deleted student ${name} (${admissionNo}) — recoverable from recycle bin`);
  res.json({ message: "Student moved to recycle bin" });
});
