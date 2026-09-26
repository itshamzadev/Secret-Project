import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import type { AuthDirectoryClient } from "../clients/auth-directory.js";
import { requireServiceToken } from "../auth/service-token.js";
import { AppError } from "../core/errors.js";
import { createAuthenticate, requireAuth } from "../middleware/authenticate.js";
import type { RelationshipService } from "../modules/relationships/relationship.service.js";

const contactIdentifier = z.object({ identifier: z.string().trim().min(3).max(254), customName: z.string().trim().max(100).optional() });
const contactUpdate = z.object({ customName: z.string().trim().max(100).nullable() });
const listQuery = z.object({ search: z.string().trim().max(100).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().trim().min(1).max(512).optional() });
const userIdParam = z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i) });
const policyBody = z.object({ firstUserId: z.string().regex(/^[a-f\d]{24}$/i), secondUserId: z.string().regex(/^[a-f\d]{24}$/i) });
const batchBody = z.object({ ownerId: z.string().regex(/^[a-f\d]{24}$/i), contactUserIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(500) });
const statusVisibilityBody = z.object({ viewerId: z.string().regex(/^[a-f\d]{24}$/i), ownerIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(5000) });

export function createRelationshipRouter(service: RelationshipService, auth: AuthDirectoryClient): Router {
  const router = Router();
  router.use(createAuthenticate(auth));
  router.post("/contacts", async (request, response, next) => { try { const input = contactIdentifier.parse(request.body); const result = await service.addContact(requireAuth(request).userId, input.identifier, input.customName); response.status(201).json({ success: true, data: { contact: result } }); } catch (error) { next(error); } });
  router.get("/contacts", async (request, response, next) => { try { const result = await service.listContacts(requireAuth(request).userId, listQuery.parse(request.query)); response.json({ success: true, data: result }); } catch (error) { next(error); } });
  router.patch("/contacts/:userId", async (request, response, next) => { try { const { userId } = userIdParam.parse(request.params); const input = contactUpdate.parse(request.body); const result = await service.updateContact(requireAuth(request).userId, userId, input.customName); response.json({ success: true, data: { contact: result } }); } catch (error) { next(error); } });
  router.delete("/contacts/:userId", async (request, response, next) => { try { const { userId } = userIdParam.parse(request.params); await service.removeContact(requireAuth(request).userId, userId); response.json({ success: true, data: { removed: true } }); } catch (error) { next(error); } });
  router.put("/users/:userId/block", async (request, response, next) => { try { const { userId } = userIdParam.parse(request.params); await service.blockUser(requireAuth(request).userId, userId); response.json({ success: true, data: { blocked: true } }); } catch (error) { next(error); } });
  router.delete("/users/:userId/block", async (request, response, next) => { try { const { userId } = userIdParam.parse(request.params); const removed = await service.unblockUser(requireAuth(request).userId, userId); response.json({ success: true, data: { blocked: false, removed } }); } catch (error) { next(error); } });
  return router;
}

export function createInternalRelationshipRouter(service: RelationshipService): Router {
  const router = Router();
  router.use(async (request, _response, next) => { try { await requireServiceToken(request.get("x-internal-service-token")); next(); } catch (error) { next(error); } });
  router.post("/check", async (request, response, next) => { try { const input = policyBody.parse(request.body); response.json({ success: true, data: await service.check(input.firstUserId, input.secondUserId) }); } catch (error) { next(error); } });
  router.post("/contacts/batch", async (request, response, next) => { try { const input = batchBody.parse(request.body); response.json({ success: true, data: { contacts: await service.contactRelations(input.ownerId, input.contactUserIds) } }); } catch (error) { next(error); } });
  router.post("/status-visibility", async (request, response, next) => { try { const input = statusVisibilityBody.parse(request.body); response.json({ success: true, data: { visibility: await service.statusVisibility(input.viewerId, input.ownerIds) } }); } catch (error) { next(error); } });
  return router;
}

export function relationshipErrorHandler(error: unknown, _request: Request, response: Response, next: NextFunction): void {
  if (response.headersSent) { next(error); return; }
  const appError = error instanceof AppError ? error : undefined;
  const status = appError?.statusCode ?? 500;
  response.status(status).json({ success: false, error: { code: appError?.code ?? "INTERNAL_SERVER_ERROR", message: status >= 500 ? "An unexpected error occurred." : appError?.message ?? "Request failed.", ...(appError?.details === undefined ? {} : { details: appError.details }) } });
}
