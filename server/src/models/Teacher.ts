import mongoose, { Document, Schema, Types } from "mongoose";

// A class+section this teacher is class-teacher of, for a given session.
export interface IAssignment {
  class: string;
  section: string;
  session: string;
}

export interface ITeacher extends Document {
  name: string;
  email: string;
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
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
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

export const Teacher = mongoose.model<ITeacher>("Teacher", teacherSchema);
