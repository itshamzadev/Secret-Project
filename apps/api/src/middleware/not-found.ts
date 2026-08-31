import type { RequestHandler } from "express";

import { AppError } from "../core/errors.js";

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(
    new AppError({
      code: "ROUTE_NOT_FOUND",
      message: "The requested route was not found.",
      statusCode: 404,
    }),
  );
};
