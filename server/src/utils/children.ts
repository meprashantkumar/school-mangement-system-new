import { FilterQuery } from "mongoose";
import { IUser } from "../models/User";
import { IStudent, Student } from "../models/Student";

// Which students belong to this logged-in guardian.
//
// The ID link (`Student.parent`) is authoritative — it's set when the office
// grants dashboard access, and it survives the parent later changing their phone
// number or email. The phone/email matches are kept as a fallback so accounts
// created before the link existed (and self-signed-up parents) keep working.
//
// Matching on phone is what makes siblings work: two children sharing one
// parent's mobile number both show up under that single login.
export const childrenFilter = (user: IUser): FilterQuery<IStudent> => {
  const or: FilterQuery<IStudent>[] = [{ parent: user._id } as FilterQuery<IStudent>];
  if (user.phone) or.push({ parentPhone: user.phone });
  if (user.email) or.push({ parentEmail: user.email });
  return { $or: or };
};

export const findChildren = (user: IUser) =>
  Student.find(childrenFilter(user)).sort({ name: 1 });

export const childStudentIds = async (user: IUser) => {
  const students = await Student.find(childrenFilter(user)).select("_id");
  return students.map((s) => s._id);
};

// Is this student one of the user's own children? Use this for ownership checks
// (paying an invoice, opening a receipt) instead of comparing identifiers by hand.
//
// Comparing `student.parentEmail !== user.email` is NOT equivalent and is unsafe
// two ways: a phone-login parent has no email, so it wrongly denies their own
// child (both sides differ), and it wrongly ALLOWS any student who also has no
// email on file (undefined === undefined).
export const isMyChild = async (user: IUser, studentId: unknown): Promise<boolean> => {
  if (!studentId) return false;
  const found = await Student.findOne({
    $and: [{ _id: studentId }, childrenFilter(user)],
  }).select("_id");
  return !!found;
};
