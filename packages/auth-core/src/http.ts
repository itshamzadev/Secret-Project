import type { Request, RequestHandler, Response } from "express";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { Types } from "mongoose";

import { AppError } from "@terqivo/contracts";
import { getActiveSession, getCurrentUser, listActiveSessions, loginUser, refreshUserSession, registerUser, revokeAllSessions, revokeCurrentSession, revokeOwnedSession } from "./auth.service.js";
import { createDeviceMetadata } from "./auth.service.js";
import { refreshSchema, registerSchema, loginSchema, sessionIdParamsSchema, usernameExistsQuerySchema } from "./auth.validation.js";
import { normalizeEmail, normalizePhone, normalizeUsername, usernameExists } from "./user.service.js";
import { UserModel } from "./user.model.js";
import { toSafeUserDto } from "./user.dto.js";
import { updateUserProfileSchema } from "./user.validation.js";
import { verifyAccessToken } from "./auth.tokens.js";

declare module "express-serve-static-core" { interface Request { auth?: { userId: string; sessionId: string } } }

export interface AuthHttpOptions { nodeEnv: "development" | "test" | "production"; registerRateLimitMax: number; loginRateLimitMax: number; refreshRateLimitMax: number; }
export const refreshCookieName = "terqivo_refresh_token";
function cookieOptions(nodeEnv: AuthHttpOptions["nodeEnv"], expires?: Date) { return { httpOnly: true, secure: nodeEnv === "production", sameSite: nodeEnv === "production" ? "strict" as const : "lax" as const, path: "/api/v1/auth", ...(expires === undefined ? {} : { expires, maxAge: Math.max(0, expires.getTime() - Date.now()) }) }; }
function setRefreshCookie(response: Response, token: string, expires: Date, nodeEnv: AuthHttpOptions["nodeEnv"]): void { response.cookie(refreshCookieName, token, cookieOptions(nodeEnv, expires)); }
function clearRefreshCookie(response: Response, nodeEnv: AuthHttpOptions["nodeEnv"]): void { response.clearCookie(refreshCookieName, cookieOptions(nodeEnv)); }
function controller(handler: (request: Request, response: Response) => Promise<void>): RequestHandler { return (request, response, next) => { void handler(request, response).catch(next); }; }
function authLimiter(limit: number) { return rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, error: { code: "AUTH_RATE_LIMIT_EXCEEDED", message: "Too many authentication attempts. Please try again later." } } }); }
function authenticationRequired(): AppError { return new AppError({ code: "AUTHENTICATION_REQUIRED", message: "Authentication is required.", statusCode: 401 }); }
function invalidAccessToken(): AppError { return new AppError({ code: "INVALID_ACCESS_TOKEN", message: "The access token is invalid or expired.", statusCode: 401 }); }
function accountStatusError(accountStatus: "suspended" | "disabled"): AppError { return new AppError({ code: accountStatus === "suspended" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_DISABLED", message: accountStatus === "suspended" ? "This account is suspended." : "This account is disabled.", statusCode: 403 }); }
function extractBearerToken(header: string | undefined): string { if (header === undefined) throw authenticationRequired(); const parts = header.trim().split(/\s+/); if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer" || parts[1] === undefined || parts[1].length === 0) throw invalidAccessToken(); return parts[1]; }
export const authenticate: RequestHandler = (request, _response, next) => { void (async () => { try { const claims = await verifyAccessToken(extractBearerToken(request.get("authorization"))).catch(() => { throw invalidAccessToken(); }); if (!Types.ObjectId.isValid(claims.sub)) throw invalidAccessToken(); const [user, session] = await Promise.all([getCurrentUser({ userId: claims.sub, sessionId: claims.sid }).catch(() => null), getActiveSession(claims.sub, claims.sid)]); if (user === null || session === null) throw invalidAccessToken(); if (user.accountStatus !== "active") throw accountStatusError(user.accountStatus); request.auth = { userId: claims.sub, sessionId: claims.sid }; next(); } catch (error) { next(error instanceof AppError ? error : invalidAccessToken()); } })(); };
export function requireAuthContext(request: Request): { userId: string; sessionId: string } { if (request.auth === undefined) throw authenticationRequired(); return request.auth; }

export function createAuthRouter(options: AuthHttpOptions): Router {
  const router = Router();
  router.post("/register", authLimiter(options.registerRateLimitMax), controller(async (request, response) => { const input = registerSchema.parse(request.body); const device = createDeviceMetadata(input, request.get("user-agent"), request.ip); const result = await registerUser(input, device); setRefreshCookie(response, result.refreshToken, new Date(result.session.expiresAt), options.nodeEnv); response.status(201).json({ success: true, data: result }); }));
  router.post("/login", authLimiter(options.loginRateLimitMax), controller(async (request, response) => { const input = loginSchema.parse(request.body); const device = createDeviceMetadata(input, request.get("user-agent"), request.ip); const result = await loginUser(input, device); setRefreshCookie(response, result.refreshToken, new Date(result.session.expiresAt), options.nodeEnv); response.status(200).json({ success: true, data: result }); }));
  router.get("/username-exists", authLimiter(options.loginRateLimitMax), controller(async (request, response) => { const { username } = usernameExistsQuerySchema.parse(request.query); response.status(200).json({ success: true, data: { exists: await usernameExists(normalizeUsername(username)) } }); }));
  router.post("/refresh", authLimiter(options.refreshRateLimitMax), controller(async (request, response) => { const input = refreshSchema.parse(request.body ?? {}); const token = input.refreshToken ?? request.cookies?.[refreshCookieName]; if (token === undefined) { response.status(401).json({ success: false, error: { code: "INVALID_REFRESH_TOKEN", message: "The refresh token is invalid or expired." } }); return; } const result = await refreshUserSession(token, input); setRefreshCookie(response, result.refreshToken, new Date(result.session.expiresAt), options.nodeEnv); response.status(200).json({ success: true, data: result }); }));
  router.post("/logout", authenticate, controller(async (request, response) => { await revokeCurrentSession(requireAuthContext(request)); clearRefreshCookie(response, options.nodeEnv); response.status(200).json({ success: true, data: { loggedOut: true } }); }));
  router.post("/logout-all", authenticate, controller(async (request, response) => { const revokedCount = await revokeAllSessions(requireAuthContext(request)); clearRefreshCookie(response, options.nodeEnv); response.status(200).json({ success: true, data: { loggedOut: true, revokedCount } }); }));
  router.get("/me", authenticate, controller(async (request, response) => { const user = await getCurrentUser(requireAuthContext(request)); response.status(200).json({ success: true, data: { user: toSafeUserDto(user) } }); }));
  router.get("/sessions", authenticate, controller(async (request, response) => { response.status(200).json({ success: true, data: { sessions: await listActiveSessions(requireAuthContext(request)) } }); }));
  router.delete("/sessions/:sessionId", authenticate, controller(async (request, response) => { const context = requireAuthContext(request); const { sessionId } = sessionIdParamsSchema.parse(request.params); await revokeOwnedSession(context, sessionId); if (sessionId === context.sessionId) clearRefreshCookie(response, options.nodeEnv); response.status(200).json({ success: true, data: { revoked: true } }); }));
  return router;
}

function duplicateFields(error: unknown): string[] { if (typeof error !== "object" || error === null || !("keyPattern" in error) || typeof error.keyPattern !== "object" || error.keyPattern === null) return []; return Object.keys(error.keyPattern); }
export const userProfileUpdateController: RequestHandler = controller(async (request, response) => {
    const context = requireAuthContext(request);
    const input = updateUserProfileSchema.parse(request.body);
    const user = await UserModel.findById(context.userId).exec();
    if (user === null) throw new AppError({ code: "USER_NOT_FOUND", message: "Your account was not found.", statusCode: 404 });
    if (input.username !== undefined) { const usernameNormalized = normalizeUsername(input.username); if (await UserModel.exists({ _id: { $ne: user._id }, usernameNormalized }).exec() !== null) throw new AppError({ code: "USERNAME_TAKEN", message: "That username is already in use.", statusCode: 409 }); user.username = input.username; user.usernameNormalized = usernameNormalized; }
    if (input.displayName !== undefined) user.displayName = input.displayName;
    if (input.bio !== undefined) user.bio = input.bio === "" ? null : input.bio;
    const nextEmail = input.email === undefined ? user.email : input.email;
    const nextPhone = input.phone === undefined ? user.phone : input.phone;
    if (nextEmail === null && nextPhone === null) throw new AppError({ code: "CONTACT_REQUIRED", message: "At least an email address or phone number is required.", statusCode: 400 });
    if (input.email !== undefined) { const value = nextEmail === null ? null : normalizeEmail(nextEmail); user.email = value; user.emailNormalized = value; }
    if (input.phone !== undefined) { const value = nextPhone === null ? null : normalizePhone(nextPhone); user.phone = value; user.phoneNormalized = value; }
    if (input.accountType !== undefined) user.accountType = input.accountType;
    try { await user.save(); } catch (error) { if (duplicateFields(error).length > 0) { const fields = duplicateFields(error); const code = fields.includes("emailNormalized") ? "EMAIL_TAKEN" : fields.includes("phoneNormalized") ? "PHONE_TAKEN" : "USERNAME_TAKEN"; const message = code === "EMAIL_TAKEN" ? "That email address is already in use." : code === "PHONE_TAKEN" ? "That phone number is already in use." : "That username is already in use."; throw new AppError({ code, message, statusCode: 409 }); } throw error; }
    response.status(200).json({ success: true, data: { user: toSafeUserDto(user) } });
  });

export function createIdentityRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.patch("/me/profile", userProfileUpdateController);
  return router;
}
