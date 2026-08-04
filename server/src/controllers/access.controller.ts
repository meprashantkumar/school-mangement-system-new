import crypto from "crypto";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { User } from "../models/User";
import { Student } from "../models/Student";
import { Teacher } from "../models/Teacher";
import { CURRENT_SESSION } from "../utils/academics";
import { normalizePhone, isValidPhone } from "../utils/phone";
import { logAudit, AUDIT } from "../utils/audit";

// Dashboard access is granted by the office, not self-service: most parents have
// no email, so they can't verify an address or use a reset link. The office
// creates the login against the mobile number already on the student record and
// hands over the password — if it's forgotten, the office simply sets a new one.

// Office-set passwords must be at least this long. Stricter than the User model's
// own floor, because these are handed out on paper and often reused.
const MIN_PASSWORD = 8;

// Readable but not guessable — avoids look-alike characters (0/O, 1/l/I) because
// these get written on paper slips and read aloud.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const generatePassword = (len = MIN_PASSWORD): string => {
  let out = "";
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
};

// Returns the password to use, or throws if the office typed something too short.
// A blank value means "generate one".
const resolvePassword = (raw: unknown): string => {
  const typed = raw == null ? "" : String(raw).trim();
  if (!typed) return generatePassword();
  if (typed.length < MIN_PASSWORD) {
    throw new ApiError(400, `Password must be at least ${MIN_PASSWORD} characters`);
  }
  return typed;
};

const publicUser = (u: any) => ({
  _id: u._id,
  name: u.name,
  phone: u.phone,
  email: u.email,
  role: u.role,
  passwordSetByAdmin: u.passwordSetByAdmin,
  createdAt: u.createdAt,
});

/* ------------------------------------------------------------------ parents */

// Grants (or repairs) the parent login for one student and links every sibling on
// the same mobile number, so a single login shows all the family's children.
const grantParentAccess = async (
  student: any,
  opts: { phone?: string; password?: string; name?: string }
) => {
  const phone = normalizePhone(opts.phone || student.parentPhone);
  if (!phone) {
    throw new ApiError(400, `${student.name} has no parent mobile number on record`);
  }
  if (!isValidPhone(phone)) {
    throw new ApiError(400, `"${phone}" isn't a valid 10-digit mobile number`);
  }

  const password = resolvePassword(opts.password);

  const name = opts.name || student.parentName || `${student.name}'s parent`;

  let user = await User.findOne({ phone }).select("+password");
  let created = false;
  if (user) {
    // Existing login on this number: just reset the password (and keep the role —
    // never demote a teacher/admin who happens to also be a parent).
    user.password = password;
    user.passwordSetByAdmin = true;
    if (!user.name) user.name = name;
    await user.save();
  } else {
    user = await User.create({
      name,
      phone,
      password,
      role: "parent",
      passwordSetByAdmin: true,
    });
    created = true;
  }

  // Link this login to every student sharing the number (siblings).
  const linked = await Student.updateMany(
    { parentPhone: phone },
    { $set: { parent: user._id } }
  );

  return { user, password, created, phone, linkedStudents: linked.modifiedCount };
};

// POST /api/access/student/:id   { password?, phone?, name? }
export const giveStudentAccess = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) throw new ApiError(404, "Student not found");

  const { user, password, created, phone } = await grantParentAccess(student, req.body || {});

  logAudit(
    req,
    AUDIT.ACCESS,
    `${created ? "Created" : "Reset"} parent login ${phone} for ${student.name} (${student.admissionNo})`
  );

  res.json({
    message: created
      ? `Login created — mobile ${phone}`
      : `Password reset for mobile ${phone}`,
    created,
    // Returned ONCE so the office can write it on a slip; it's stored hashed.
    credentials: { phone, password, name: user.name },
    user: publicUser(user),
  });
});

// DELETE /api/access/student/:id — revoke the parent login (record kept intact).
export const revokeStudentAccess = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) throw new ApiError(404, "Student not found");

  const phone = normalizePhone(student.parentPhone);
  const user = phone ? await User.findOne({ phone, role: "parent" }) : null;
  if (!user) throw new ApiError(404, "No parent login exists for this student");

  await Student.updateMany({ parent: user._id }, { $unset: { parent: "" } });
  await User.deleteOne({ _id: user._id });

  logAudit(req, AUDIT.ACCESS, `Revoked parent login ${phone} (${student.name})`);
  res.json({ message: `Login for ${phone} removed. The student record is untouched.` });
});

// POST /api/access/students/bulk   { class, section?, session?, password? }
// Creates logins for a whole class in one go and returns the slip list to print.
// `password` sets the SAME password for every parent in the batch (easier to hand
// out and explain); leave it blank and each parent gets their own random one.
export const bulkStudentAccess = asyncHandler(async (req, res) => {
  const { class: className, section, session, password: sharedPassword } = req.body || {};
  if (!className) throw new ApiError(400, "Pick a class");

  // Validate a shared password once, up front — so a too-short one fails before
  // any account is touched rather than half way through the class.
  const shared = sharedPassword == null ? "" : String(sharedPassword).trim();
  if (shared && shared.length < MIN_PASSWORD) {
    throw new ApiError(400, `Password must be at least ${MIN_PASSWORD} characters`);
  }

  const filter: Record<string, unknown> = {
    class: String(className).trim(),
    session: session || CURRENT_SESSION,
    status: "active",
  };
  if (section) filter.section = section;

  const students = await Student.find(filter).sort({ rollNo: 1, name: 1 });
  if (students.length === 0) throw new ApiError(404, "No active students found for that class");

  const slips: {
    student: string;
    admissionNo: string;
    parent: string;
    phone: string;
    password: string;
  }[] = [];
  const errors: string[] = [];
  const donePhones = new Set<string>();
  let created = 0;
  let reset = 0;

  for (const student of students) {
    try {
      const phone = normalizePhone(student.parentPhone);
      // Siblings share one login — issue it once, and don't reset a password we
      // just generated for the earlier sibling.
      if (phone && donePhones.has(phone)) continue;

      const r = await grantParentAccess(student, { password: shared || undefined });
      donePhones.add(r.phone);
      r.created ? created++ : reset++;
      slips.push({
        student: student.name,
        admissionNo: student.admissionNo,
        parent: r.user.name,
        phone: r.phone,
        password: r.password,
      });
    } catch (err: any) {
      errors.push(`${student.name} (${student.admissionNo}): ${err.message}`);
    }
  }

  logAudit(
    req,
    AUDIT.ACCESS,
    `Bulk parent logins for Class ${className}${section ? `-${section}` : ""} — ${created} created, ${reset} reset` +
      (shared ? " (one shared password for the whole class)" : "")
  );

  res.json({
    message: `${created} login(s) created, ${reset} password(s) reset${
      errors.length ? `, ${errors.length} skipped` : ""
    }`,
    created,
    reset,
    slips,
    errors,
  });
});

/* ----------------------------------------------------------------- teachers */

// POST /api/access/teacher/:id   { password?, phone? }
export const giveTeacherAccess = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) throw new ApiError(404, "Teacher not found");

  const phone = normalizePhone(req.body?.phone || teacher.phone);
  if (!phone) throw new ApiError(400, `${teacher.name} has no mobile number on record`);
  if (!isValidPhone(phone)) {
    throw new ApiError(400, `"${phone}" isn't a valid 10-digit mobile number`);
  }

  const password = resolvePassword(req.body?.password);

  let user = await User.findOne({ phone }).select("+password");
  let created = false;
  if (user) {
    user.password = password;
    user.passwordSetByAdmin = true;
    // A parent login on this number becomes the teacher's login (staff ward case):
    // the teacher dashboard also shows their own children.
    if (user.role === "parent") user.role = "teacher";
    await user.save();
  } else {
    user = await User.create({
      name: teacher.name,
      phone,
      email: teacher.email,
      password,
      role: "teacher",
      passwordSetByAdmin: true,
    });
    created = true;
  }

  teacher.user = user._id as any;
  if (!teacher.phone) teacher.phone = phone;
  await teacher.save();

  logAudit(
    req,
    AUDIT.ACCESS,
    `${created ? "Created" : "Reset"} teacher login ${phone} for ${teacher.name}`
  );

  res.json({
    message: created ? `Login created — mobile ${phone}` : `Password reset for mobile ${phone}`,
    created,
    credentials: { phone, password, name: user.name },
    user: publicUser(user),
  });
});

// DELETE /api/access/teacher/:id
export const revokeTeacherAccess = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) throw new ApiError(404, "Teacher not found");

  const phone = normalizePhone(teacher.phone);
  const user =
    (teacher.user && (await User.findById(teacher.user))) ||
    (phone ? await User.findOne({ phone }) : null);
  if (!user) throw new ApiError(404, "No login exists for this teacher");
  if (user.role === "superadmin" || user.role === "admin") {
    throw new ApiError(400, "That login is an admin account — remove it from Users instead");
  }

  await User.deleteOne({ _id: user._id });
  teacher.user = undefined;
  await teacher.save();

  logAudit(req, AUDIT.ACCESS, `Revoked teacher login ${phone} (${teacher.name})`);
  res.json({ message: `Login for ${phone} removed. The teacher record is untouched.` });
});

/* --------------------------------------------------------- password resets */

// POST /api/access/user/:id/password   { password? }
// The office's answer to "I forgot my password" — there's no email to send a
// reset link to, so a new password is set here and read out to them.
export const setUserPassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select("+password");
  if (!user) throw new ApiError(404, "User not found");

  const password = resolvePassword(req.body?.password);

  user.password = password;
  user.passwordSetByAdmin = true;
  await user.save();

  logAudit(req, AUDIT.ACCESS, `Set a new password for ${user.name} (${user.phone || user.email})`);
  res.json({
    message: `New password set for ${user.name}`,
    credentials: { phone: user.phone, email: user.email, password, name: user.name },
  });
});

// GET /api/access/lookup?phone=  — does a login already exist on this number?
export const lookupAccess = asyncHandler(async (req, res) => {
  const phone = normalizePhone((req.query.phone as string) || "");
  if (!phone) throw new ApiError(400, "phone is required");
  const user = await User.findOne({ phone });
  res.json({ exists: !!user, user: user ? publicUser(user) : null });
});
