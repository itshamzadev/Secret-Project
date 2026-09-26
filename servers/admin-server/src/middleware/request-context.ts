import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const requestContextMiddleware: RequestHandler = (request, response, next) => {
  const valid = (value: string | undefined): string | undefined =>
    value !== undefined && /^[A-Za-z0-9._:-]{20,128}$/.test(value) ? value : undefined;
  const requestId = valid(request.get("x-request-id")) ?? randomUUID();
  const correlationId = valid(request.get("x-correlation-id")) ?? requestId;
  response.setHeader("X-Request-ID", requestId);
  response.setHeader("X-Correlation-ID", correlationId);
  request.adminRequestContext = { requestId, correlationId };
  next();
};
