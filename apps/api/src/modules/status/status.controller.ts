import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { AppError } from "../../core/errors.js";
import { requireAuthContext } from "../../middleware/authenticate.js";
import { mediaStorage } from "../media/media.storage.js";
import { inspectMedia, validateDetectedMedia } from "../media/media.validation.js";
import { createMediaStatus, createStatus, deleteStatus, getVisibleStatus, listStatuses, markStatusViewed } from "./status.service.js";
import { createStatusSchema, statusIdParamsSchema, statusMediaUploadQuerySchema } from "./status.validation.js";

function controller(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

export const listStatusesController: RequestHandler = controller(async (request, response) => {
  response.status(200).json({ success: true, data: await listStatuses(requireAuthContext(request)) });
});

export const createStatusController: RequestHandler = controller(async (request, response) => {
  const status = await createStatus(requireAuthContext(request), createStatusSchema.parse(request.body));
  response.status(201).json({ success: true, data: { status } });
});

export const createMediaStatusController: RequestHandler = controller(async (request, response) => {
  const context = requireAuthContext(request);
  const input = statusMediaUploadQuerySchema.parse(request.query);
  if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
    throw new AppError({ code: "STATUS_MEDIA_BODY_REQUIRED", message: "A status media file is required.", statusCode: 400 });
  }
  const inspected = await inspectMedia(request.body);
  const detected = validateDetectedMedia(input.type, inspected, {
    declaredMimeType: request.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? null,
    fileName: request.get("x-file-name") ?? null,
  });
  const storageKey = `${randomUUID()}.${detected.extension}`;
  try {
    await mediaStorage.put(storageKey, request.body);
    const status = await createMediaStatus(context, input, {
      storageKey,
      mimeType: detected.mimeType,
      size: request.body.length,
      width: input.width ?? null,
      height: input.height ?? null,
      durationSeconds: input.durationSeconds ?? null,
    });
    response.status(201).json({ success: true, data: { status } });
  } catch (error: unknown) {
    await mediaStorage.remove(storageKey).catch(() => undefined);
    throw error;
  }
});

export const viewStatusController: RequestHandler = controller(async (request, response) => {
  const { statusId } = statusIdParamsSchema.parse(request.params);
  await markStatusViewed(requireAuthContext(request), statusId);
  response.status(200).json({ success: true, data: { viewed: true } });
});

export const statusMediaDownloadController: RequestHandler = controller(async (request, response) => {
  const { statusId } = statusIdParamsSchema.parse(request.params);
  const status = await getVisibleStatus(requireAuthContext(request), statusId);
  if (status.media === null || status.media === undefined) {
    throw new AppError({ code: "STATUS_MEDIA_NOT_FOUND", message: "The status media was not found.", statusCode: 404 });
  }
  const file = await mediaStorage.open(status.media.storageKey);
  if (file === null) {
    throw new AppError({ code: "STATUS_MEDIA_NOT_FOUND", message: "The status media was not found.", statusCode: 404 });
  }
  response.setHeader("Content-Type", status.media.mimeType);
  response.setHeader("Content-Length", String(file.size));
  response.setHeader("Cache-Control", "private, max-age=300");
  await pipeline(file.stream, response);
});

export const deleteStatusController: RequestHandler = controller(async (request, response) => {
  const { statusId } = statusIdParamsSchema.parse(request.params);
  await deleteStatus(requireAuthContext(request), statusId);
  response.status(200).json({ success: true, data: { deleted: true } });
});
