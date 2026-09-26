import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";

import type { RequestHandler } from "express";

import { AppError } from "../../core/errors.js";
import { requireAuthContext, controller } from "../../middleware/authenticate.js";
import { type StatusService } from "./status.service.js";
import { inspectMedia, validateDetectedMedia } from "./media.validation.js";
import { createStatusSchema, statusIdParamsSchema, statusMediaUploadQuerySchema } from "./status.validation.js";

export function createStatusControllers(service: StatusService): {
  list: RequestHandler;
  create: RequestHandler;
  createMedia: RequestHandler;
  media: RequestHandler;
  view: RequestHandler;
  remove: RequestHandler;
} {
  return {
    list: controller(async (request, response) => { response.status(200).json({ success: true, data: await service.listStatuses(requireAuthContext(request)) }); }),
    create: controller(async (request, response) => { const status = await service.createStatus(requireAuthContext(request), createStatusSchema.parse(request.body)); response.status(201).json({ success: true, data: { status } }); }),
    createMedia: controller(async (request, response) => {
      const context = requireAuthContext(request);
      const input = statusMediaUploadQuerySchema.parse(request.query);
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) throw new AppError({ code: "STATUS_MEDIA_BODY_REQUIRED", message: "A status media file is required.", statusCode: 400 });
      const inspected = await inspectMedia(request.body);
      const detected = validateDetectedMedia(input.type, inspected, { declaredMimeType: request.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? null, fileName: request.get("x-file-name") ?? null });
      const storageKey = `${randomUUID()}.${detected.extension}`;
      try {
        await service.putMedia(storageKey, request.body);
        const status = await service.createMediaStatus(context, input, { storageKey, mimeType: detected.mimeType, size: request.body.length, width: input.width ?? null, height: input.height ?? null, durationSeconds: input.durationSeconds ?? null });
        response.status(201).json({ success: true, data: { status } });
      } catch (error) {
        await service.removeMedia(storageKey).catch(() => undefined);
        throw error;
      }
    }),
    media: controller(async (request, response) => {
      const { statusId } = statusIdParamsSchema.parse(request.params);
      const status = await service.getVisibleStatus(requireAuthContext(request), statusId);
      if (status.media === null) throw new AppError({ code: "STATUS_MEDIA_NOT_FOUND", message: "The status media was not found.", statusCode: 404 });
      const file = await service.openMedia(status.media.storageKey, status.media.mimeType);
      if (file === null) throw new AppError({ code: "STATUS_MEDIA_NOT_FOUND", message: "The status media was not found.", statusCode: 404 });
      response.setHeader("Content-Type", status.media.mimeType);
      response.setHeader("Content-Length", String(file.size));
      response.setHeader("Cache-Control", "private, max-age=300");
      await pipeline(file.stream, response);
    }),
    view: controller(async (request, response) => { const { statusId } = statusIdParamsSchema.parse(request.params); await service.markStatusViewed(requireAuthContext(request), statusId); response.status(200).json({ success: true, data: { viewed: true } }); }),
    remove: controller(async (request, response) => { const { statusId } = statusIdParamsSchema.parse(request.params); await service.deleteStatus(requireAuthContext(request), statusId); response.status(200).json({ success: true, data: { deleted: true } }); }),
  };
}
