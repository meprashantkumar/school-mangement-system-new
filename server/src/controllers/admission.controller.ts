import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { Admission } from "../models/Admission";
import { Student } from "../models/Student";
import { User } from "../models/User";
import { CURRENT_SESSION } from "../utils/academics";
import { logAudit, AUDIT } from "../utils/audit";
import { moveToTrash } from "./trash.controller";

// Builds a friendly, sequential-ish application number for a session. The unique
// index is the real guard; on the rare race we retry with a bumped counter.
async function nextApplicationNo(session: string): Promise<string> {
  const year = (session.split("-")[0] || "").trim() || String(new Date().getFullYear());
  const count = await Admission.countDocuments({ session });
  return `ADM-${year}-${String(count + 1).padStart(4, "0")}`;
}

// POST /api/admissions/public  — PUBLIC (no login). Submitted from the website.
export const submitAdmission = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const studentName = String(b.studentName || "").trim();
  const applyingForClass = String(b.applyingForClass || "").trim();
  const parentName = String(b.parentName || "").trim();
  const parentPhone = String(b.parentPhone || "").trim();

  if (!studentName) throw new ApiError(400, "Student's name is required");
  if (!applyingForClass) throw new ApiError(400, "Please choose the class you're applying for");
  if (!parentName) throw new ApiError(400, "Parent / guardian name is required");
  if (!parentPhone) throw new ApiError(400, "A contact phone number is required");

  const base = {
    studentName,
    gender: b.gender || "",
    dateOfBirth: b.dateOfBirth ? new Date(b.dateOfBirth) : undefined,
    applyingForClass,
    session: String(b.session || CURRENT_SESSION).trim(),
    previousSchool: b.previousSchool ? String(b.previousSchool).trim() : undefined,
    category: b.category ? String(b.category).trim() : "General",
    parentName,
    parentPhone,
    parentEmail: b.parentEmail ? String(b.parentEmail).trim().toLowerCase() : undefined,
    address: b.address ? String(b.address).trim() : undefined,
    message: b.message ? String(b.message).trim() : undefined,
    status: "pending" as const,
  };

  // Create with retry so a duplicate application number never fails the applicant.
  let created;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      created = await Admission.create({
        ...base,
        applicationNo: await nextApplicationNo(base.session),
      });
      break;
    } catch (err: any) {
      if (err?.code === 11000 && attempt < 4) continue;
      throw err;
    }
  }
  if (!created) throw new ApiError(500, "Could not submit the application. Please try again.");

  res.status(201).json({
    message: "Application submitted successfully.",
    applicationNo: created.applicationNo,
  });
});

// GET /api/admissions?status=&session=&search=  (staff)
export const listAdmissions = asyncHandler(async (req, res) => {
  const { status, session, search } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (session) filter.session = session;
  if (search) {
    filter.$or = [
      { studentName: { $regex: search, $options: "i" } },
      { applicationNo: { $regex: search, $options: "i" } },
      { parentName: { $regex: search, $options: "i" } },
      { parentPhone: { $regex: search, $options: "i" } },
    ];
  }
  const applications = await Admission.find(filter).sort({ createdAt: -1 }).limit(1000);
  const counts = {
    pending: await Admission.countDocuments({ status: "pending" }),
    approved: await Admission.countDocuments({ status: "approved" }),
    rejected: await Admission.countDocuments({ status: "rejected" }),
  };
  res.json({ applications, counts });
});

// GET /api/admissions/:id  (staff)
export const getAdmission = asyncHandler(async (req, res) => {
  const application = await Admission.findById(req.params.id).populate(
    "convertedStudent",
    "name admissionNo class section"
  );
  if (!application) throw new ApiError(404, "Application not found");
  res.json({ application });
});

// POST /api/admissions/:id/approve  { admissionNo, section?, rollNo? }  (staff)
// Approving enrols the applicant as a real Student (per the school's setting).
export const approveAdmission = asyncHandler(async (req, res) => {
  const application = await Admission.findById(req.params.id);
  if (!application) throw new ApiError(404, "Application not found");
  if (application.status === "approved" && application.convertedStudent) {
    throw new ApiError(400, "This application has already been approved and enrolled.");
  }

  const admissionNo = String(req.body.admissionNo || "").trim();
  if (!admissionNo) throw new ApiError(400, "Please assign an admission number to enrol the student.");

  const clash = await Student.findOne({ admissionNo });
  if (clash) throw new ApiError(400, "A student with this admission number already exists.");

  // Link to a parent login if one already exists with this email.
  let parent;
  if (application.parentEmail) {
    const user = await User.findOne({ email: application.parentEmail });
    if (user) parent = user._id;
  }

  const student = await Student.create({
    admissionNo,
    name: application.studentName,
    session: application.session,
    class: application.applyingForClass,
    section: req.body.section ? String(req.body.section).trim() : undefined,
    rollNo: req.body.rollNo ? String(req.body.rollNo).trim() : undefined,
    gender: application.gender || "",
    category: application.category || "General",
    parentName: application.parentName,
    parentPhone: application.parentPhone,
    parentEmail: application.parentEmail,
    parent,
    status: "active",
  });

  application.status = "approved";
  application.reviewNote = req.body.note ? String(req.body.note).trim() : application.reviewNote;
  application.reviewedBy = req.user?._id as any;
  application.reviewedAt = new Date();
  application.convertedStudent = student._id as any;
  await application.save();

  logAudit(
    req,
    AUDIT.ADMISSION,
    `Approved admission ${application.applicationNo} — enrolled ${student.name} (${student.admissionNo})`,
    { entity: "Admission", entityId: String(application._id) }
  );
  res.json({ message: "Application approved and student enrolled.", application, student });
});

// POST /api/admissions/:id/reject  { note? }  (staff)
export const rejectAdmission = asyncHandler(async (req, res) => {
  const application = await Admission.findById(req.params.id);
  if (!application) throw new ApiError(404, "Application not found");
  if (application.convertedStudent) {
    throw new ApiError(400, "This application is already enrolled and can't be rejected.");
  }
  application.status = "rejected";
  application.reviewNote = req.body.note ? String(req.body.note).trim() : undefined;
  application.reviewedBy = req.user?._id as any;
  application.reviewedAt = new Date();
  await application.save();
  logAudit(req, AUDIT.ADMISSION, `Rejected admission ${application.applicationNo} (${application.studentName})`, {
    entity: "Admission",
    entityId: String(application._id),
  });
  res.json({ message: "Application rejected.", application });
});

// POST /api/admissions/:id/reopen  (staff) — undo a decision (reversibility).
export const reopenAdmission = asyncHandler(async (req, res) => {
  const application = await Admission.findById(req.params.id);
  if (!application) throw new ApiError(404, "Application not found");
  if (application.convertedStudent) {
    throw new ApiError(
      400,
      "This application is already enrolled. Remove the student from the recycle bin flow first if this was a mistake."
    );
  }
  application.status = "pending";
  application.reviewNote = undefined;
  application.reviewedBy = undefined;
  application.reviewedAt = undefined;
  await application.save();
  logAudit(req, AUDIT.ADMISSION, `Reopened admission ${application.applicationNo} (${application.studentName})`);
  res.json({ message: "Application moved back to pending.", application });
});

// DELETE /api/admissions/:id  -> recycle bin (staff)
export const deleteAdmission = asyncHandler(async (req, res) => {
  const application = await Admission.findById(req.params.id);
  if (!application) throw new ApiError(404, "Application not found");
  const label = `${application.applicationNo} — ${application.studentName}`;
  await moveToTrash(req, "Admission", application, label);
  logAudit(req, AUDIT.ADMISSION, `Deleted admission ${label} — recoverable from recycle bin`);
  res.json({ message: "Application moved to recycle bin" });
});
