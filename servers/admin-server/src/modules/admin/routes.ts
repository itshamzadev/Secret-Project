import { Router, type Request, type RequestHandler, type Response } from "express";
import rateLimit from "express-rate-limit";

import type { AdminServerConfig } from "../../config/env.js";
import { createAdminAuthentication, requireAdminContext, requireAdminPermission } from "../../middleware/authenticate-admin.js";
import { adminLoginSchema, adminUsersQuerySchema, badgesSchema, channelIdParamsSchema, groupIdParamsSchema, passwordSchema, userIdParamsSchema, userStatusSchema, userTierSchema } from "./validation.js";
import { changePassword, deleteUser, getAdminById, getDashboard, listAdminChannels, listAdminGroups, listAdminUsers, setBadges, setChannelBadges, setGroupBadges, setStatus, setTier, loginAdmin } from "./service.js";
import { streamUserAvatar } from "../../clients/auth.client.js";
import { toAdminUserDto } from "./dto.js";
import type { AdminServerDependencies } from "../../app.js";

function controller(handler: (request: Request, response: Response) => Promise<void>): RequestHandler { return (request, response, next) => { void handler(request, response).catch(next); }; }

export function createAdminRouter(config: AdminServerConfig, dependencies: AdminServerDependencies): Router {
  const router = Router();
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.ADMIN_LOGIN_RATE_LIMIT_MAX, standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, error: { code: "ADMIN_RATE_LIMIT_EXCEEDED", message: "Too many administrative login attempts. Try again later." } } });
  const authenticateAdmin = createAdminAuthentication(config);
  router.post("/auth/login", loginLimiter, controller(async (request, response) => { response.status(200).json({ success: true, data: await loginAdmin(config, adminLoginSchema.parse(request.body)) }); }));
  router.post("/auth/logout", authenticateAdmin, (_request, response) => response.status(200).json({ success: true, data: { loggedOut: true } }));
  router.get("/auth/me", authenticateAdmin, controller(async (request, response) => { const admin = await getAdminById(requireAdminContext(request).adminId); response.status(200).json({ success: true, data: { admin: toAdminUserDto(admin) } }); }));
  router.get("/dashboard", authenticateAdmin, requireAdminPermission("dashboard.view"), controller(async (_request, response) => { response.status(200).json({ success: true, data: await getDashboard(config, dependencies.databaseStatus(), dependencies.redisStatus(), dependencies.countOnlineUsers ?? (async () => 0)) }); }));
  router.get("/users", authenticateAdmin, requireAdminPermission("users.view"), controller(async (request, response) => { response.status(200).json({ success: true, data: await listAdminUsers(config, adminUsersQuerySchema.parse(request.query)) }); }));
  router.get("/users/:userId/avatar", authenticateAdmin, requireAdminPermission("users.view"), controller(async (request, response) => { const { userId } = userIdParamsSchema.parse(request.params); await streamUserAvatar(config, userId, response); }));
  router.get("/groups", authenticateAdmin, requireAdminPermission("users.view"), controller(async (_request, response) => { response.status(200).json({ success: true, data: await listAdminGroups(config) }); }));
  router.get("/channels", authenticateAdmin, requireAdminPermission("users.view"), controller(async (_request, response) => { response.status(200).json({ success: true, data: await listAdminChannels(config) }); }));
  router.patch("/users/:userId/password", authenticateAdmin, requireAdminPermission("users.manage"), controller(async (request, response) => { const { userId } = userIdParamsSchema.parse(request.params); response.status(200).json({ success: true, data: await changePassword(config, userId, passwordSchema.parse(request.body).password) }); }));
  router.patch("/users/:userId/status", authenticateAdmin, requireAdminPermission("users.suspend"), controller(async (request, response) => { const { userId } = userIdParamsSchema.parse(request.params); response.status(200).json({ success: true, data: await setStatus(config, userId, userStatusSchema.parse(request.body).status) }); }));
  router.patch("/users/:userId/tier", authenticateAdmin, requireAdminPermission("users.manage"), controller(async (request, response) => { const { userId } = userIdParamsSchema.parse(request.params); response.status(200).json({ success: true, data: await setTier(config, userId, userTierSchema.parse(request.body).userTier) }); }));
  router.patch("/users/:userId/badges", authenticateAdmin, requireAdminPermission("users.manage"), controller(async (request, response) => { const { userId } = userIdParamsSchema.parse(request.params); response.status(200).json({ success: true, data: await setBadges(config, userId, badgesSchema.parse(request.body).badges) }); }));
  router.patch("/groups/:groupId/badges", authenticateAdmin, requireAdminPermission("users.manage"), controller(async (request, response) => { const { groupId } = groupIdParamsSchema.parse(request.params); response.status(200).json({ success: true, data: await setGroupBadges(config, groupId, badgesSchema.parse(request.body).badges) }); }));
  router.patch("/channels/:channelId/badges", authenticateAdmin, requireAdminPermission("users.manage"), controller(async (request, response) => { const { channelId } = channelIdParamsSchema.parse(request.params); response.status(200).json({ success: true, data: await setChannelBadges(config, channelId, badgesSchema.parse(request.body).badges) }); }));
  router.delete("/users/:userId", authenticateAdmin, requireAdminPermission("users.manage"), controller(async (request, response) => { const { userId } = userIdParamsSchema.parse(request.params); response.status(200).json({ success: true, data: await deleteUser(config, userId) }); }));
  return router;
}
