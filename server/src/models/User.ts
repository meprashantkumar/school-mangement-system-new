import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";
import { normalizePhone } from "../utils/phone";

export type UserRole = "superadmin" | "admin" | "teacher" | "parent" | "student";

export interface IUser extends Document {
  name: string;
  email?: string; // optional — most parents have no email; phone is the login ID
  password: string;
  phone?: string; // login ID for parents/teachers (normalised, 10 digits)
  role: UserRole;
  passwordSetByAdmin?: boolean; // set by the office, so "forgot password" = ask the office
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
  createdAt: Date;
  updatedAt: Date;
  matchPassword(entered: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    // Email is OPTIONAL: in tier-2/3 towns most parents don't have one, so they
    // log in with their mobile number instead. `sparse` lets many users have no
    // email while still keeping real addresses unique.
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, select: false, minlength: 6 },
    // Stored normalised (last 10 digits) so lookups always match what's typed.
    phone: { type: String, trim: true, unique: true, sparse: true },
    role: {
      type: String,
      enum: ["superadmin", "admin", "teacher", "parent", "student"],
      default: "parent",
    },
    passwordSetByAdmin: { type: Boolean, default: false },
    // Password reset: we store only a hash of the token, with an expiry.
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpire: { type: Date, select: false },
  },
  { timestamps: true }
);

// Normalise the login identifiers before saving. Empty strings MUST become
// undefined: on a sparse unique index "" is a real value, so two users with a
// blank email would collide, while two with no email at all are fine.
userSchema.pre("validate", function (next) {
  const self = this as unknown as IUser;
  if (!self.email || !String(self.email).trim()) self.email = undefined;
  const phone = normalizePhone(self.phone);
  self.phone = phone || undefined;

  // Every account needs at least one way to log in.
  if (!self.email && !self.phone) {
    return next(new Error("A user needs a mobile number or an email to log in with"));
  }
  next();
});

// Hash password before saving (only when it changed)
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (entered: string): Promise<boolean> {
  return bcrypt.compare(entered, this.password);
};

export const User = mongoose.model<IUser>("User", userSchema);
