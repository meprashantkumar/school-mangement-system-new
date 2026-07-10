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
  let decoded: { id: string };
  try {
    decoded = jwt.verify(token, env.jwtSecret) as { id: string };
  } catch {
    throw new ApiError(401, "Your session has expired. Please log in again.");
  }
  const user = await User.findById(decoded.id);

  if (!user) throw new ApiError(401, "User no longer exists");

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
