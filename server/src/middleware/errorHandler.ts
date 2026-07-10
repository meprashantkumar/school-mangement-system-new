import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

export const notFound = (req: Request, _res: Response, next: NextFunction) => {
  next(new ApiError(404, `Not Found - ${req.originalUrl}`));
};

// Central error handler: everything ends up here and returns { message }
export const errorHandler = (
  err: Error & { statusCode?: number; code?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Server Error";

  // Duplicate key (e.g. email / admissionNo already exists)
  if (err.code === 11000) {
    statusCode = 400;
    message = "Duplicate value entered";
  }

  res.status(statusCode).json({
    message,
    ...(env.nodeEnv === "development" ? { stack: err.stack } : {}),
  });
};
