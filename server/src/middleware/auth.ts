import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { User, UserRole } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

// Verifies the JWT (Authorization: Bearer <token>) and attaches req.user
export const protect = asyncHandler(async (req, _res, next) => {
  let token: string | undefined;

  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) throw new ApiError(401, "Not authorized, no token");

  // A malformed/expired token must surface as 401 (session expired), not a raw
  // 500 — otherwise the client can't tell "please log in again" from a crash.
  let decoded: { id: string; iat?: number };
  try {
    decoded = jwt.verify(token, env.jwtSecret) as { id: string; iat?: number };
  } catch {
    throw new ApiError(401, "Your session has expired. Please log in again.");
  }
  // Re-read the user on every request rather than trusting the token's contents.
  // That costs a lookup, but it is what makes revoking a login take effect
  // immediately: Access -> revoke deletes the user and the next request fails here.
  const user = await User.findById(decoded.id);

  if (!user) throw new ApiError(401, "User no longer exists");

  // Sessions last up to a year, so expiry alone is no way to shut one down. A new
  // password closes every session opened before it — the office's answer to a lost
  // or stolen phone. `iat` is in seconds; passwordChangedAt is stored a second
  // early so a freshly issued token is never caught by its own stamp.
  if (user.passwordChangedAt && decoded.iat !== undefined) {
    if (decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
      throw new ApiError(401, "Your password was changed. Please log in again.");
    }
  }

  req.user = user;
  next();
});

// Restricts a route to the given roles
export const authorize =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ApiError(403, "You do not have permission to do this");
    }
    next();
  };
