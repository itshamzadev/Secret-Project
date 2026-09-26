import { Router, type RequestHandler } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import { AppError } from "../../core/errors.js";
import type { NotificationService } from "./notification.service.js";
import { registerPushDeviceSchema, removePushDeviceSchema } from "./notification.validation.js";
import type { PushDeviceRepository } from "./notification.types.js";
import { toPushDeviceDto } from "./notification.dto.js";

type UserAuthenticator = (accessToken: string) => Promise<string>;

function requireUser(request: { get(name: string): string | undefined }, authenticateUser: UserAuthenticator): Promise<string> {
  const header = request.get("authorization");
  const token = header?.startsWith("Bearer ") === true ? header.slice(7).trim() : "";
  if (token === "") return Promise.reject(new AppError({ statusCode: 401, code: "INVALID_ACCESS_TOKEN", message: "Authentication is required." }));
  return authenticateUser(token).catch((error: unknown) => {
    const accountError = error instanceof Error && (error.message === "ACCOUNT_SUSPENDED" || error.message === "ACCOUNT_DISABLED");
    throw new AppError({ statusCode: accountError ? 403 : 401, code: error instanceof Error && error.message === "ACCOUNT_SUSPENDED" ? "ACCOUNT_SUSPENDED" : error instanceof Error && error.message === "ACCOUNT_DISABLED" ? "ACCOUNT_DISABLED" : "INVALID_ACCESS_TOKEN", message: accountError ? (error instanceof Error && error.message === "ACCOUNT_SUSPENDED" ? "This account is suspended." : "This account is disabled.") : "The access token is invalid or expired." });
  });
}

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (request, response, next) => { void Promise.resolve(handler(request, response, next)).catch(next); };
}

export function createNotificationRouter(devices: PushDeviceRepository, service: NotificationService, authenticateUser: UserAuthenticator): Router {
  const router = Router();
  const diagnosticLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 1, keyGenerator: (request) => request.get("x-authenticated-user") ?? ipKeyGenerator(request.ip ?? "unknown"), standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, error: { code: "PUSH_DIAGNOSTIC_RATE_LIMITED", message: "The diagnostic push limit has been reached. Try again later." } } });
  const diagnosticAuth: RequestHandler = (request, _response, next) => { void requireUser(request, authenticateUser).then((userId) => { request.headers["x-authenticated-user"] = userId; next(); }).catch(next); };
  router.post("/devices", asyncHandler(async (request, response) => {
    const userId = await requireUser(request, authenticateUser);
    const input = registerPushDeviceSchema.parse(request.body);
    const device = await devices.register(userId, { pushToken: input.pushToken, platform: input.platform, deviceId: input.deviceId ?? null });
    response.status(200).json({ success: true, data: { device: toPushDeviceDto(device) } });
  }));
  router.delete("/devices", asyncHandler(async (request, response) => {
    const userId = await requireUser(request, authenticateUser);
    const input = removePushDeviceSchema.parse(request.body);
    const removed = await devices.remove(userId, input.pushToken);
    response.status(200).json({ success: true, data: { removed } });
  }));
  router.post("/diagnostics/test-push", diagnosticAuth, diagnosticLimiter, asyncHandler(async (request, response) => {
    const userId = await requireUser(request, authenticateUser);
    const result = await service.diagnostic(userId);
    response.status(200).json({ success: true, data: result });
  }));
  return router;
}
