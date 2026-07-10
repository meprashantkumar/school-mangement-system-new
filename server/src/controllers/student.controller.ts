import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { nextClass } from "../utils/academics";
import { logAudit, AUDIT } from "../utils/audit";
import { Student } from "../models/Student";
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
    "session",
    "class",
    "section",
    "rollNo",
    "gender",
    "category",
    "parentName",
    "parentPhone",
    "parentEmail",
    "optedServices",
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
// Failed students repeat the same class in the new session. Class 12 passers (no next
// class) are marked as left/graduated.
export const promoteStudents = asyncHandler(async (req, res) => {
  const { fromSession, fromClass, fromSection, toSession, failedIds = [] } = req.body;

  if (!fromSession || !fromClass || !toSession) {
    throw new ApiError(400, "fromSession, fromClass and toSession are required");
  }
  if (fromSession === toSession) {
    throw new ApiError(400, "The target session must be different from the current session");
  }

  const promotedClass = nextClass(fromClass); // null if fromClass has no next (Class 12)

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
  let graduated = 0;
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
      // No next class (Class 12) and passed -> graduated / left school.
      s.status = "left";
      s.exitDate = new Date();
      s.exitReason = s.exitReason || `Graduated (${fromSession})`;
      graduated += 1;
    }

    await s.save();
  }

  const parts = [`${promoted} promoted`];
  if (retained) parts.push(`${retained} retained`);
  if (graduated) parts.push(`${graduated} graduated`);

  const message = students.length
    ? `Class ${fromClass}${fromSection ? " " + fromSection : ""}: ${parts.join(", ")} for ${toSession}.`
    : `No active students found in ${fromClass}${fromSection ? " " + fromSection : ""} for session ${fromSession}.`;

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

  res.json({ message, promoted, retained, graduated, matched: students.length, runId });
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

// POST /api/students/import  { students: [...] }
// Bulk-inserts students (e.g. restoring a backup or loading old records). Existing
// admission numbers are skipped, so it's safe to re-run. Returns a summary.
export const importStudents = asyncHandler(async (req, res) => {
  const rows = req.body.students;
  if (!Array.isArray(rows)) {
    throw new ApiError(400, "Expected a JSON body of the form { students: [...] }");
  }

  const genders = ["Male", "Female", "Other"];
  const statuses = ["active", "left", "inactive"];

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const admissionNo = row.admissionNo != null ? String(row.admissionNo).trim() : "";

    try {
      if (!admissionNo || !row.name || row.class == null || String(row.class).trim() === "") {
        errors.push(`Row ${i + 1}: admissionNo, name and class are required`);
        continue;
      }

      const exists = await Student.findOne({ admissionNo });
      if (exists) {
        skipped += 1;
        continue;
      }

      // optedServices may arrive as an array (JSON) or a ";"/","-joined string (CSV).
      const opted = Array.isArray(row.optedServices)
        ? row.optedServices
        : typeof row.optedServices === "string" && row.optedServices.trim()
        ? row.optedServices.split(/[;,]/).map((s: string) => s.trim()).filter(Boolean)
        : [];

      let doa: Date | undefined = row.dateOfAdmission ? new Date(row.dateOfAdmission) : undefined;
      if (doa && Number.isNaN(doa.getTime())) doa = undefined;

      await Student.create({
        admissionNo,
        name: String(row.name).trim(),
        dateOfAdmission: doa,
        session: row.session || undefined,
        class: String(row.class).trim(),
        section: row.section || undefined,
        rollNo: row.rollNo != null ? String(row.rollNo) : undefined,
        gender: genders.includes(row.gender) ? row.gender : "",
        category: row.category || "General",
        parentName: row.parentName || undefined,
        parentPhone: row.parentPhone != null ? String(row.parentPhone) : undefined,
        parentEmail: row.parentEmail || undefined,
        optedServices: opted,
        status: statuses.includes(row.status) ? row.status : "active",
      });
      inserted += 1;
    } catch (err: any) {
      errors.push(`Row ${i + 1} (${admissionNo || "?"}): ${err.message}`);
    }
  }

  if (inserted) logAudit(req, AUDIT.STUDENT, `Imported ${inserted} student(s)`);

  res.json({
    message: `Imported ${inserted}, skipped ${skipped} existing${
      errors.length ? `, ${errors.length} error(s)` : ""
    }.`,
    inserted,
    skipped,
    errors,
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
    ? { $pull: { optedServices: service } }
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
