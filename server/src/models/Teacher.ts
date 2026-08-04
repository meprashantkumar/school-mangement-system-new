import mongoose, { Document, Schema, Types } from "mongoose";
import { normalizePhone } from "../utils/phone";

// A class+section this teacher is class-teacher of, for a given session.
export interface IAssignment {
  class: string;
  section: string;
  session: string;
}

export interface ITeacher extends Document {
  name: string;
  email?: string; // optional — mobile number is the login ID
  phone?: string;
  gender?: string;
  designation?: string; // e.g. subject / "PGT Maths"
  employeeCode?: string;
  joiningDate?: Date;
  isActive: boolean;
  user?: Types.ObjectId; // linked login (User) once they sign up
  assignments: IAssignment[];
  createdAt: Date;
  updatedAt: Date;
}

const assignmentSchema = new Schema<IAssignment>(
  {
    class: { type: String, required: true },
    section: { type: String, required: true },
    session: { type: String, required: true },
  },
  { _id: false }
);

const teacherSchema = new Schema<ITeacher>(
  {
    name: { type: String, required: true, trim: true },
    // Optional: teachers log in with their mobile number, and many have no email.
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    // Their login ID — stored normalised so it always matches what's typed.
    phone: { type: String, trim: true, unique: true, sparse: true },
    gender: { type: String, enum: ["Male", "Female", "Other", ""], default: "" },
    designation: { type: String, trim: true },
    employeeCode: { type: String, trim: true },
    joiningDate: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    assignments: { type: [assignmentSchema], default: [] },
  },
  { timestamps: true }
);

// Blank strings would collide on the sparse unique indexes ("" is a real value),
// and the phone is a login ID so it must be stored in one canonical form.
teacherSchema.pre("validate", function (next) {
  const self = this as unknown as ITeacher;
  if (!self.email || !String(self.email).trim()) self.email = undefined;
  const phone = normalizePhone(self.phone);
  self.phone = phone || undefined;
  if (!self.email && !self.phone) {
    return next(new Error("A teacher needs a mobile number or an email"));
  }
  next();
});

export const Teacher = mongoose.model<ITeacher>("Teacher", teacherSchema);
