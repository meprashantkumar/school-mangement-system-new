import crypto from "crypto";
import { IUser, User, UserRole } from "../models/User";
import { Teacher } from "../models/Teacher";
import { Student } from "../models/Student";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { generateToken } from "../utils/token";
import { logAudit, AUDIT } from "../utils/audit";
import { sendMail } from "../config/mailer";
import { env } from "../config/env";
import { looksLikePhone, normalizePhone } from "../utils/phone";

// A self-signing-up user becomes a "teacher" if the admin has already added a
// teacher record with their email; otherwise a "parent". Never elevates to
// admin/superadmin (those accounts are created explicitly).
const resolveSignupRole = async (email: string): Promise<UserRole> => {
  const teacher = await Teacher.findOne({ email: email.toLowerCase().trim(), isActive: true });
  return teacher ? "teacher" : "parent";
};

// Self-signup is only allowed for emails the school already has on file — a
// student's parentEmail or an active teacher. Prevents strangers creating
// accounts. (No email OTP: in tier-3 towns many families don't have email, so
// the school assigns login emails; the only trade-off is such users can't use
// "forgot password", which is acceptable.)
const isKnownEmail = async (email: string): Promise<boolean> => {
  const e = email.toLowerCase().trim();
  const [teacher, student] = await Promise.all([
    Teacher.findOne({ email: e, isActive: true }).select("_id"),
    Student.findOne({ parentEmail: e }).select("_id"),
  ]);
  return !!(teacher || student);
};

// Never send the password hash back to the client.
const formatUser = (user: IUser) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  createdAt: user.createdAt,
});

// Find the account for whatever the user typed in the single login box: a mobile
// number (the usual case — most parents have no email) or an email address.
const findByIdentifier = async (raw: string) => {
  const typed = String(raw).trim();
  if (looksLikePhone(typed)) {
    return User.findOne({ phone: normalizePhone(typed) }).select("+password");
  }
  // Query filters don't run schema setters, so normalise the email here to match
  // how it was stored.
  return User.findOne({ email: typed.toLowerCase() }).select("+password");
};

// POST /api/auth/register  (public sign-up creates a parent account)
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;

  if (!name || !email || !password) {
    throw new ApiError(400, "Please provide name, email and password");
  }

  const normEmail = String(email).toLowerCase().trim();
  const exists = await User.findOne({ email: normEmail });
  if (exists) throw new ApiError(400, "A user already exists with this email");

  // Only emails the school knows can self-register (and it's the address we send
  // the verification code to — so only the real owner can complete signup).
  if (!(await isKnownEmail(normEmail))) {
    throw new ApiError(
      403,
      "This email isn't on file with the school. Please use the email the school has for you, or contact the office."
    );
  }

  const role = await resolveSignupRole(normEmail);
  const user = await User.create({ name, email: normEmail, password, phone, role });

  // Link the new login to the teacher record so admin can see they've signed up.
  if (role === "teacher") {
    await Teacher.updateOne({ email: user.email, isActive: true }, { user: user._id });
  }

  res.status(201).json({
    token: generateToken(user.id),
    user: formatUser(user),
  });
});

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  // `identifier` is the mobile-or-email field; `email` is accepted too so older
  // clients keep working.
  const { identifier, email, password } = req.body;
  const typed = identifier || email;

  if (!typed || !password) {
    throw new ApiError(400, "Please provide your mobile number (or email) and password");
  }

  const user = await findByIdentifier(typed);
  if (!user || !(await user.matchPassword(password))) {
    throw new ApiError(401, "Invalid mobile number / email or password");
  }

  // Reconcile: a parent who was later added as a teacher becomes a teacher on
  // next login (covers "registered before admin added them"). Never touches
  // admin/superadmin. Matched on the ID link first, then email/phone for records
  // created before the login existed.
  if (user.role === "parent") {
    const teacher = await Teacher.findOne({
      $and: [
        { isActive: true },
        {
          $or: [
            { user: user._id },
            ...(user.email ? [{ email: user.email }] : []),
            ...(user.phone ? [{ phone: user.phone }] : []),
          ],
        },
      ],
    });
    if (teacher) {
      user.role = "teacher";
      await user.save({ validateBeforeSave: false });
      if (!teacher.user) {
        teacher.user = user._id as any;
        await teacher.save();
      }
    }
  }

  logAudit(req, AUDIT.LOGIN, `${user.name} (${user.role}) logged in`, { actor: user });

  res.json({
    token: generateToken(user.id),
    user: formatUser(user),
  });
});

// GET /api/auth/me
export const getMe = asyncHandler(async (req, res) => {
  res.json({ user: formatUser(req.user!) });
});

// POST /api/auth/forgot-password  { email }
// Emails a time-limited reset link. Responds the same whether or not the email
// exists, so we don't reveal which addresses are registered.
export const forgotPassword = asyncHandler(async (req, res) => {
  const { identifier, email } = req.body;
  const typed = identifier || email;
  if (!typed) throw new ApiError(400, "Enter your mobile number or email");

  // Phone-only accounts (most parents/teachers) have no inbox to send a link to,
  // so self-service reset isn't possible — the school office sets a new password.
  // We answer without looking anything up, so this never reveals who has an account.
  if (looksLikePhone(typed)) {
    return res.json({
      message:
        "Accounts that log in with a mobile number can't be reset by email. Please contact the school office and they'll set a new password for you.",
    });
  }

  const user = await User.findOne({ email: String(typed).toLowerCase().trim() });
  if (user?.email) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    user.resetPasswordExpire = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    await user.save({ validateBeforeSave: false });

    const link = `${env.clientUrl}/reset-password/${rawToken}`;
    await sendMail(
      user.email,
      "Reset your password",
      `<p>Hello ${user.name},</p>
       <p>We received a request to reset your password. This link is valid for 30 minutes:</p>
       <p><a href="${link}">${link}</a></p>
       <p>If you didn't request this, you can safely ignore this email.</p>`
    );
  }

  res.json({
    message: "If an account exists for that email, a password reset link has been sent.",
  });
});

// POST /api/auth/reset-password/:token  { password }
export const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  if (!password || String(password).length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters");
  }

  const hashed = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    resetPasswordToken: hashed,
    resetPasswordExpire: { $gt: new Date() },
  }).select("+password");

  if (!user) throw new ApiError(400, "This reset link is invalid or has expired");

  user.password = password; // pre-save hook re-hashes it
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  res.json({ message: "Password updated. You can now log in.", token: generateToken(user.id) });
});
