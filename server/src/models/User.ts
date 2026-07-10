import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

export type UserRole = "superadmin" | "admin" | "teacher" | "parent" | "student";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: UserRole;
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
  createdAt: Date;
  updatedAt: Date;
  matchPassword(entered: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, select: false, minlength: 6 },
    phone: { type: String, trim: true },
    role: {
      type: String,
      enum: ["superadmin", "admin", "teacher", "parent", "student"],
      default: "parent",
    },
    // Password reset: we store only a hash of the token, with an expiry.
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpire: { type: Date, select: false },
  },
  { timestamps: true }
);

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
