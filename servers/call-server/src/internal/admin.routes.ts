import { Router } from "express";
import { jwtVerify } from "jose";

import { env } from "../config/env.js";
import { CallModel } from "../models/call.model.js";

async function requireAdminToken(value: string | undefined): Promise<void> {
  if (value === undefined) throw new Error("INTERNAL_SERVICE_UNAUTHORIZED");
  const result = await jwtVerify(value, new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET), { issuer: env.INTERNAL_SERVICE_ISSUER, audience: env.INTERNAL_SERVICE_AUDIENCE, algorithms: ["HS256"], clockTolerance: 5 });
  if (result.payload.serviceName !== "admin-server") throw new Error("INTERNAL_SERVICE_UNAUTHORIZED");
}

export function createCallAdminRouter(): Router {
  const router = Router();
  router.use((request, response, next) => { void requireAdminToken(request.get("x-internal-service-token")).then(() => next()).catch(() => response.status(401).json({ success: false, error: { code: "INTERNAL_SERVICE_UNAUTHORIZED", message: "Internal service authentication is required." } })); });
  router.get("/stats", async (_request, response, next) => { try { const [total, missed] = await Promise.all([CallModel.countDocuments(), CallModel.countDocuments({ status: "missed" })]); response.json({ success: true, data: { calls: { total, missed } } }); } catch (error) { next(error); } });
  return router;
}
