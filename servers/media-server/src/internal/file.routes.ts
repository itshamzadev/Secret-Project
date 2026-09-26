import express, { Router } from "express";
import { pipeline } from "node:stream/promises";

import { AppError } from "../core/errors.js";
import { requireServiceToken } from "./service-auth.js";
import { mediaStorage } from "../storage/index.js";
import { controller } from "../middleware/authenticate.js";
import { env } from "../config/env.js";

const allowedServices = ["message-server", "auth-server", "status-server"] as const;
const rawBody = express.raw({ limit: `${env.MEDIA_MAX_FILE_SIZE_BYTES}b`, type: () => true });

export function createInternalFileRouter(): Router {
  const router = Router();
  router.use(async (request, _response, next) => {
    try { await requireServiceToken(request.get("x-internal-service-token"), allowedServices); next(); }
    catch { next(new AppError({ code: "INTERNAL_SERVICE_UNAUTHORIZED", message: "Internal service authentication is required.", statusCode: 401 })); }
  });
  router.put("/files/:storageKey", rawBody, controller(async (request, response) => {
    const key = storageKey(request.params.storageKey);
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) throw new AppError({ code: "MEDIA_BODY_REQUIRED", message: "A binary media body is required.", statusCode: 400 });
    await mediaStorage.put(key, request.body);
    response.status(201).json({ success: true, data: { storageKey: key, size: request.body.length } });
  }));
  router.get("/files/:storageKey", controller(async (request, response) => {
    const file = await mediaStorage.open(storageKey(request.params.storageKey));
    if (file === null) throw new AppError({ code: "MEDIA_NOT_FOUND", message: "The media file was not found.", statusCode: 404 });
    response.setHeader("Content-Type", request.get("x-media-mime-type") ?? "application/octet-stream");
    response.setHeader("Content-Length", String(file.size));
    await pipeline(file.stream, response);
  }));
  router.delete("/files/:storageKey", controller(async (request, response) => {
    const key = storageKey(request.params.storageKey);
    await mediaStorage.remove(key);
    response.status(200).json({ success: true, data: { deleted: true } });
  }));
  return router;
}

function storageKey(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !/^[a-f0-9-]+\.[a-z0-9]+$/i.test(value)) throw new AppError({ code: "INVALID_MEDIA_KEY", message: "The media reference is invalid.", statusCode: 400 });
  return value;
}
