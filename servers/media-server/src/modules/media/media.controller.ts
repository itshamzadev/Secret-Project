import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { env } from "../../config/env.js";
import { AppError } from "../../core/errors.js";
import { bearerToken, requireAuthContext } from "../../middleware/authenticate.js";
import { authorizeDownload, sendMediaMessage, stageEncryptedMedia, type MediaDescriptor } from "../../internal/message-client.js";
import { mediaStorage } from "../../storage/index.js";
import { encryptedMediaUploadQuerySchema, inspectMedia, mediaUploadQuerySchema, sanitizeFileName, validateDetectedMedia } from "./media.validation.js";

export function uploadMediaController(request: Request, response: Response, next: NextFunction): void {
  void handleUpload(request, response).catch(next);
}

export function encryptedMediaUploadController(request: Request, response: Response, next: NextFunction): void {
  void handleEncryptedUpload(request, response).catch(next);
}

export function downloadMediaController(request: Request, response: Response, next: NextFunction): void {
  void handleDownload(request, response).catch(next);
}

async function handleUpload(request: Request, response: Response): Promise<void> {
  requireAuthContext(request);
  const input = mediaUploadQuerySchema.parse(request.query);
  const conversationId = requiredParam(request.params.conversationId, "CONVERSATION_NOT_FOUND", "The conversation was not found.");
  const body = binaryBody(request);
  const declaredMimeType = request.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
  const fileName = request.get("x-file-name") ?? null;
  const detected = validateDetectedMedia(input.type, await inspectMedia(body), { declaredMimeType, fileName });
  const storageKey = `${randomUUID()}.${detected.extension}`;
  try {
    await mediaStorage.put(storageKey, body);
    const media: MediaDescriptor = {
      url: `/api/v1/media/${storageKey}`,
      storageKey,
      mimeType: detected.mimeType,
      size: body.length,
      width: input.width ?? null,
      height: input.height ?? null,
      durationSeconds: input.durationSeconds ?? null,
      thumbnailUrl: null,
      fileName: sanitizeFileName(fileName),
    };
    const result = await sendMediaMessage(bearerToken(request), conversationId, { clientMessageId: input.clientMessageId, type: input.type, media });
    if (result.duplicate) await mediaStorage.remove(storageKey);
    response.status(result.duplicate ? 200 : 201).json({ success: true, data: { message: result.message, duplicate: result.duplicate } });
  } catch (error: unknown) {
    await mediaStorage.remove(storageKey).catch(() => undefined);
    throw error;
  }
}

async function handleEncryptedUpload(request: Request, response: Response): Promise<void> {
  requireAuthContext(request);
  const conversationId = requiredParam(request.params.conversationId, "CONVERSATION_NOT_FOUND", "The conversation was not found.");
  const input = encryptedMediaUploadQuerySchema.parse(request.query);
  const body = binaryBody(request);
  const storageKey = `${randomUUID()}.bin`;
  try {
    // Encrypted media is intentionally never passed through file-type inspection.
    await mediaStorage.put(storageKey, body);
    const staged = await stageEncryptedMedia(bearerToken(request), { conversationId, clientMessageId: input.clientMessageId, type: input.type, storageKey, size: body.length });
    if (staged.duplicate && staged.storageKey !== storageKey) await mediaStorage.remove(storageKey);
    response.status(staged.duplicate ? 200 : 201).json({ success: true, data: { storageKey: staged.storageKey, size: staged.size } });
  } catch (error: unknown) {
    await mediaStorage.remove(storageKey).catch(() => undefined);
    throw error;
  }
}

async function handleDownload(request: Request, response: Response): Promise<void> {
  const key = requiredStorageKey(request.params.storageKey);
  const descriptor = await authorizeDownload(bearerToken(request), key);
  const initial = await mediaStorage.open(key);
  if (initial === null) throw new AppError({ code: "MEDIA_NOT_FOUND", message: "The media file was not found.", statusCode: 404 });
  initial.stream.destroy();
  const range = parseRange(request.get("range"), initial.size);
  const file = await mediaStorage.open(key, range ?? undefined);
  if (file === null) throw new AppError({ code: "MEDIA_NOT_FOUND", message: "The media file was not found.", statusCode: 404 });
  response.setHeader("Content-Type", descriptor.mimeType);
  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("Content-Length", String(file.size));
  response.setHeader("Content-Disposition", descriptor.fileName === null ? "inline" : `inline; filename="${descriptor.fileName.replace(/"/g, "")}"`);
  if (range !== null) {
    response.status(206);
    response.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${initial.size}`);
  }
  await pipeline(file.stream, response);
}

function binaryBody(request: Request): Buffer {
  if (!Buffer.isBuffer(request.body) || request.body.length === 0) throw new AppError({ code: "MEDIA_BODY_REQUIRED", message: "A binary media body is required.", statusCode: 400 });
  if (request.body.length > env.MEDIA_MAX_FILE_SIZE_BYTES) throw new AppError({ code: "MEDIA_TOO_LARGE", message: "The media file is too large.", statusCode: 413 });
  return request.body;
}

function requiredParam(value: string | string[] | undefined, code: string, message: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new AppError({ code, message, statusCode: 404 });
  return value;
}

function requiredStorageKey(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !/^[a-f0-9-]+\.[a-z0-9]+$/i.test(value)) throw new AppError({ code: "MEDIA_NOT_FOUND", message: "The media file was not found.", statusCode: 404 });
  return value;
}

function parseRange(header: string | undefined, size: number): { start: number; end: number } | null {
  if (header === undefined) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (match === null || (match[1] === "" && match[2] === "")) throw new AppError({ code: "MEDIA_RANGE_NOT_SATISFIABLE", message: "The requested media range is not satisfiable.", statusCode: 416 });
  const start = match[1] === "" ? Math.max(0, size - Number(match[2])) : Number(match[1]);
  let end = match[2] === "" ? size - 1 : Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) throw new AppError({ code: "MEDIA_RANGE_NOT_SATISFIABLE", message: "The requested media range is not satisfiable.", statusCode: 416 });
  end = Math.min(end, size - 1);
  return { start, end };
}

export type MediaController = RequestHandler;
