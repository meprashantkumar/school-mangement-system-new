import { Request } from "express";
import { ApiError } from "./ApiError";
import { ITeacher, Teacher } from "../models/Teacher";

// Resolve the Teacher record for the logged-in user.
//
// The ID link is authoritative (set when the office grants dashboard access);
// phone and email are fallbacks so records that pre-date the login still resolve.
//
// IMPORTANT: never query `{ email: req.user.email }` directly. Teachers log in by
// mobile now and often have no email at all, and Mongoose turns an `undefined`
// query value into a `null` match — so that filter silently matches the wrong
// teacher (any record that also has no email) instead of finding nothing. Each
// `$or` branch here is only added when the value actually exists.
export const teacherForUser = async (req: Request): Promise<ITeacher> => {
  const user = req.user!;
  const or: Record<string, unknown>[] = [{ user: user._id }];
  if (user.phone) or.push({ phone: user.phone });
  if (user.email) or.push({ email: user.email });

  const teacher = await Teacher.findOne({ $and: [{ isActive: true }, { $or: or }] });
  if (!teacher) throw new ApiError(403, "No teacher profile is linked to your account");
  return teacher;
};
