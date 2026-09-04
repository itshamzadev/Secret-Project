import type { ErrorRequestHandler } from "express";
import { z, ZodError } from "zod";

import { env } from "../config/env.js";
import { AppError } from "../core/errors.js";
import { logger } from "../lib/logger.js";

interface HttpLikeError {
  status?: unknown;
  type?: unknown;
}

function isHttpLikeError(error: unknown): error is HttpLikeError {
  return (
    typeof error === "object" &&
    error !== null &&
    ("status" in error || "type" in error)
  );
}

function isZodError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  let statusCode = 500;
  let code = "INTERNAL_SERVER_ERROR";
  let message = "An unexpected error occurred.";
  let details: unknown | undefined;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (isZodError(error)) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Request validation failed.";
    details = error.issues;
  } else if (
    isHttpLikeError(error) &&
    (error.status === 400 || error.status === 413)
  ) {
    statusCode = error.status === 413 ? 413 : 400;
    code =
      error.type === "entity.too.large"
        ? "REQUEST_TOO_LARGE"
        : "INVALID_REQUEST";
    message =
      error.type === "entity.too.large"
        ? "Request body is too large."
        : "Invalid request.";
  }

  if (statusCode >= 500) {
    logger.error({ err: error }, message);
  } else {
    logger.warn({ err: error }, message);
  }

  const safeError = {
    code,
    message:
      env.NODE_ENV === "production" && statusCode >= 500
        ? "An unexpected error occurred."
        : message,
  };

  if (details === undefined) {
    response.status(statusCode).json({ success: false, error: safeError });
    return;
  }

  response.status(statusCode).json({
    success: false,
    error: {
      ...safeError,
      details: z.array(z.unknown()).safeParse(details).success
        ? details
        : undefined,
    },
  });
};
