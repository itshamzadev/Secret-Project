import { jwtVerify } from "jose";
import type { RequestHandler } from "express";

import { env } from "../config/env.js";
import { AppError } from "../core/errors.js";

export const requireRealtimeHubService: RequestHandler = (request, _response, next) => {
  const token = request.get("x-internal-service-token");
  if (token === undefined || env.INTERNAL_SERVICE_SECRET === undefined) {
    next(new AppError({ code: "INTERNAL_SERVICE_UNAUTHORIZED", message: "Internal service authentication is required.", statusCode: 401 }));
    return;
  }
  void jwtVerify(token, new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET), {
    algorithms: ["HS256"],
    issuer: env.INTERNAL_SERVICE_ISSUER,
    audience: env.INTERNAL_SERVICE_AUDIENCE,
    clockTolerance: 5,
  }).then((result) => {
    if (result.payload.serviceName !== "realtime-hub") throw new Error("Unexpected internal service identity");
    next();
  }).catch(() => next(new AppError({ code: "INTERNAL_SERVICE_UNAUTHORIZED", message: "Internal service authentication is required.", statusCode: 401 })));
};
