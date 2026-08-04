import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { UserRole } from "../models/User";

/**
 * How long a login lasts, per role.
 *
 * These differ on purpose. A teacher takes attendance from a home-screen icon
 * every morning; being thrown back to a login form mid-term defeats the point of
 * installing it, and they have no email to recover a password with — they have to
 * ask the office. A superadmin can export every student's records and wipe the
 * database, so that session should not linger on a phone for a year.
 *
 * Long sessions are only safe because both off-switches are immediate:
 *   - Access -> revoke login deletes the user, and `protect` re-reads the user on
 *     every request, so the token dies at once.
 *   - Setting a new password stamps passwordChangedAt, which invalidates every
 *     token issued before it. That is the "log out everywhere" for a lost phone.
 * Change either of those and revisit these numbers.
 *
 * This is policy, so it lives in code rather than in each school's env file —
 * three schools on one box should not drift apart on how long a login lasts.
 * JWT_EXPIRE is only the fallback for a role missing from this table.
 */
const TTL: Record<UserRole, string> = {
  superadmin: "7d", // widest powers, shortest session
  admin: "30d",
  teacher: "180d", // twice a year, so never mid-term
  parent: "365d", // once a year — effectively "stays logged in"
  student: "365d",
};

export const generateToken = (id: string, role?: UserRole): string => {
  const expiresIn = (role && TTL[role]) || env.jwtExpire;
  const options: jwt.SignOptions = {
    expiresIn: expiresIn as jwt.SignOptions["expiresIn"],
  };
  return jwt.sign({ id }, env.jwtSecret, options);
};
