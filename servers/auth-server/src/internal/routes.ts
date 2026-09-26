import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";

import type { AuthServerConfig } from "../config.js";
import { AppError } from "./auth-core/contracts.js";
import { authenticate, requireAuthContext } from "./auth-core/http.js";
import { findUserByIdentifier } from "./auth-core/user.service.js";
import { UserModel } from "./auth-core/user.model.js";
import { AuthSessionModel } from "./auth-core/auth-session.model.js";
import type { UserDocument } from "./auth-core/user.types.js";
import { getPrivacySettings } from "./privacy.service.js";
import { requireInternalService } from "./service-auth.js";
import { hashPassword } from "./auth-core/auth.security.js";
import { revokeAllSessionsForUser } from "./auth-core/auth.service.js";
import { endPresence, startPresence } from "./presence.service.js";

const adminUserIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const adminPasswordSchema = z.object({ password: z.string().min(8).max(1024) });
const adminStatusSchema = z.object({ status: z.enum(["active", "suspended", "disabled"]) });
const adminTierSchema = z.object({ userTier: z.enum(["normal", "special", "special_pro", "ultra_special"]) });
const adminBadgesSchema = z.object({ badges: z.array(z.enum(["verified", "terqivo"])).max(2).refine((values) => new Set(values).size === values.length) });

const idSchema = z.string().regex(/^[a-f\d]{24}$/i);
const batchSchema = z.object({ userIds: z.array(idSchema).max(500) });
const querySchema = z.object({ query: z.string().trim().min(1).max(100) });
const adminUsersQuerySchema = z.object({ cursor: z.string().trim().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).default(25), search: z.string().trim().min(1).max(100).optional(), status: z.enum(["active", "suspended", "disabled"]).optional(), role: z.enum(["user", "moderator", "admin"]).optional() });

type AdminCursor = { createdAt: string; id: string };
function decodeAdminCursor(value: string | undefined): AdminCursor | null {
  if (value === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || !("createdAt" in parsed) || !("id" in parsed) || typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") throw new Error("invalid");
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch { throw new AppError({ code: "INVALID_CURSOR", message: "The pagination cursor is invalid.", statusCode: 400 }); }
}
function encodeAdminCursor(value: AdminCursor): string { return Buffer.from(JSON.stringify(value), "utf8").toString("base64url"); }
function adminUserSnapshot(user: UserDocument, appVersions: unknown[] = []): Record<string, unknown> {
  return { id: user._id.toString(), username: user.username, displayName: user.displayName, email: user.email, phone: user.phone, avatarUrl: user.avatarUrl, bio: user.bio, accountStatus: user.accountStatus, role: user.role, accountType: user.accountType ?? "personal", userTier: user.userTier ?? "normal", badges: user.badges ?? [], createdAt: user.createdAt.toISOString(), lastSeenAt: user.lastSeenAt?.toISOString() ?? null, appVersions };
}

function safePublicUser(user: UserDocument): Record<string, unknown> {
  return { id: user._id.toString(), username: user.username, displayName: user.displayName, phone: user.phone, avatarUrl: user.avatarUrl, bio: user.bio, accountType: user.accountType ?? "personal", badges: user.badges ?? [], accountStatus: user.accountStatus };
}

function validId(value: string): boolean { return Types.ObjectId.isValid(value); }

export function createInternalRouter(config: AuthServerConfig): Router {
  const router = Router();
  const defaultInternalGuard = requireInternalService(config);
  router.use((request, response, next) => {
    if (request.path === "/admin" || request.path.startsWith("/admin/")) {
      next();
      return;
    }
    defaultInternalGuard(request, response, next);
  });
  router.get("/auth/validate", authenticate, (request, response) => { const context = requireAuthContext(request); response.json({ success: true, data: context }); });
  router.get("/users/resolve", async (request, response, next) => { try { const identifier = z.string().trim().min(3).max(254).parse(request.query.identifier); const user = await findUserByIdentifier(identifier); if (user === null || user.accountStatus !== "active") throw new AppError({ code: "USER_NOT_FOUND", message: "The user was not found.", statusCode: 404 }); response.json({ success: true, data: safePublicUser(user) }); } catch (error) { next(error); } });
  router.get("/users/search", async (request, response, next) => { try { const { query } = querySchema.parse(request.query); const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); const regex = new RegExp(escaped, "i"); const users = await UserModel.find({ accountStatus: "active", $or: [{ username: regex }, { usernameNormalized: regex }, { displayName: regex }, { phone: regex }] }).limit(500).exec(); response.json({ success: true, data: users.map(safePublicUser) }); } catch (error) { next(error); } });
  router.post("/users/batch-public", async (request, response, next) => { try { const { userIds } = batchSchema.parse(request.body); const ids = userIds.filter(validId).map((id) => new Types.ObjectId(id)); const users = await UserModel.find({ _id: { $in: ids }, accountStatus: "active" }).exec(); response.json({ success: true, data: users.map(safePublicUser) }); } catch (error) { next(error); } });
  router.post("/presence/start", async (request, response, next) => { try { const input = z.object({ userId: idSchema, sessionId: z.string().min(1).max(200) }).parse(request.body); await startPresence(input.userId, input.sessionId); response.json({ success: true, data: { started: true } }); } catch (error) { next(error); } });
  router.post("/presence/end", async (request, response, next) => { try { const input = z.object({ userId: idSchema }).parse(request.body); await endPresence(input.userId); response.json({ success: true, data: { ended: true } }); } catch (error) { next(error); } });
  const admin = Router();
  admin.use(requireInternalService(config, ["admin-server"]));
  admin.get("/stats", async (_request, response, next) => { try { const [total, active, suspended, disabled] = await Promise.all([UserModel.countDocuments(), UserModel.countDocuments({ accountStatus: "active" }), UserModel.countDocuments({ accountStatus: "suspended" }), UserModel.countDocuments({ accountStatus: "disabled" })]); response.json({ success: true, data: { users: { total, active, suspended, disabled } } }); } catch (error) { next(error); } });
  admin.get("/users", async (request, response, next) => { try { const query = adminUsersQuerySchema.parse(request.query); const cursor = decodeAdminCursor(query.cursor); const clauses: Record<string, unknown>[] = []; if (query.status !== undefined) clauses.push({ accountStatus: query.status }); if (query.role !== undefined) clauses.push({ role: query.role }); if (query.search !== undefined) { const escaped = query.search.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"); const regex = new RegExp(escaped, "i"); clauses.push({ $or: [{ usernameNormalized: regex }, { emailNormalized: regex }, { displayName: regex }] }); } if (cursor !== null) { if (!Types.ObjectId.isValid(cursor.id) || Number.isNaN(new Date(cursor.createdAt).getTime())) throw new AppError({ code: "INVALID_CURSOR", message: "The pagination cursor is invalid.", statusCode: 400 }); clauses.push({ $or: [{ createdAt: { $lt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), _id: { $lt: new Types.ObjectId(cursor.id) } }] }); } const users = await UserModel.find(clauses.length === 0 ? {} : { $and: clauses }).sort({ createdAt: -1, _id: -1 }).limit(query.limit + 1).exec(); const page = users.length > query.limit ? users.slice(0, query.limit) : users; const sessions = await AuthSessionModel.find({ userId: { $in: page.map((user) => user._id) }, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ lastUsedAt: -1 }).lean().exec(); const versions = new Map<string, unknown[]>(); for (const session of sessions) { const value = versions.get(String(session.userId)) ?? []; value.push({ version: session.appVersion, build: session.appBuild, platform: session.platform, deviceName: session.deviceName, lastUsedAt: new Date(session.lastUsedAt).toISOString(), active: true }); versions.set(String(session.userId), value); } const last = page.at(-1); response.json({ success: true, data: { users: page.map((user) => adminUserSnapshot(user, versions.get(user._id.toString()) ?? [])), nextCursor: users.length > query.limit && last !== undefined ? encodeAdminCursor({ createdAt: last.createdAt.toISOString(), id: last._id.toString() }) : null } }); } catch (error) { next(error); } });
  admin.post("/users/batch-public", async (request, response, next) => { try { const { userIds } = batchSchema.parse(request.body); const ids = userIds.filter(validId).map((id) => new Types.ObjectId(id)); const users = await UserModel.find({ _id: { $in: ids } }).exec(); response.json({ success: true, data: users.map((user) => ({ id: user._id.toString(), username: user.username, displayName: user.displayName, accountStatus: user.accountStatus })) }); } catch (error) { next(error); } });
  router.get("/users/:userId/privacy", async (request, response, next) => { try { const userId = idSchema.parse(request.params.userId); response.json({ success: true, data: await getPrivacySettings(userId) }); } catch (error) { next(error); } });
  admin.patch("/users/:userId/password", async (request, response, next) => { try { const userId = adminUserIdSchema.parse(request.params.userId); const input = adminPasswordSchema.parse(request.body); const user = await UserModel.findById(userId).select("+passwordHash").exec(); if (user === null) throw new AppError({ code: "ADMIN_USER_NOT_FOUND", message: "The user was not found.", statusCode: 404 }); user.passwordHash = await hashPassword(input.password); await user.save(); const revokedSessions = await revokeAllSessionsForUser(userId, "admin_password_change"); response.json({ success: true, data: { updated: true, revokedSessions } }); } catch (error) { next(error); } });
  admin.patch("/users/:userId/status", async (request, response, next) => { try { const userId = adminUserIdSchema.parse(request.params.userId); const { status } = adminStatusSchema.parse(request.body); const user = await UserModel.findById(userId).exec(); if (user === null) throw new AppError({ code: "ADMIN_USER_NOT_FOUND", message: "The user was not found.", statusCode: 404 }); user.accountStatus = status; await user.save(); const revokedSessions = status === "active" ? 0 : await revokeAllSessionsForUser(userId, "account_status_change"); response.json({ success: true, data: { updated: true, status, revokedSessions } }); } catch (error) { next(error); } });
  admin.patch("/users/:userId/tier", async (request, response, next) => { try { const userId = adminUserIdSchema.parse(request.params.userId); const { userTier } = adminTierSchema.parse(request.body); const user = await UserModel.findById(userId).exec(); if (user === null) throw new AppError({ code: "ADMIN_USER_NOT_FOUND", message: "The user was not found.", statusCode: 404 }); user.userTier = userTier; await user.save(); response.json({ success: true, data: { updated: true, userTier } }); } catch (error) { next(error); } });
  admin.patch("/users/:userId/badges", async (request, response, next) => { try { const userId = adminUserIdSchema.parse(request.params.userId); const { badges } = adminBadgesSchema.parse(request.body); const user = await UserModel.findById(userId).exec(); if (user === null) throw new AppError({ code: "ADMIN_USER_NOT_FOUND", message: "The user was not found.", statusCode: 404 }); user.badges = badges; await user.save(); response.json({ success: true, data: { updated: true, badges: user.badges } }); } catch (error) { next(error); } });
  admin.delete("/users/:userId", async (request, response, next) => { try { const userId = adminUserIdSchema.parse(request.params.userId); const user = await UserModel.findById(userId).exec(); if (user === null) throw new AppError({ code: "ADMIN_USER_NOT_FOUND", message: "The user was not found.", statusCode: 404 }); user.accountStatus = "disabled"; await user.save(); const revokedSessions = await revokeAllSessionsForUser(userId, "account_status_change"); response.json({ success: true, data: { deleted: true, revokedSessions } }); } catch (error) { next(error); } });
  router.use("/admin", admin);
  return router;
}
