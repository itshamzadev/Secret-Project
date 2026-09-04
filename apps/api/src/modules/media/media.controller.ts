import { pipeline } from "node:stream/promises";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { randomUUID } from "node:crypto";

import { requireAuthContext } from "../../middleware/authenticate.js";
import { AppError } from "../../core/errors.js";
import { sendMediaMessage } from "../messages/message.service.js";
import { publishMessageCreated } from "../messages/message.events.js";
import { mediaStorage } from "./media.storage.js";
import {
  detectMedia,
  mediaUploadQuerySchema,
  sanitizeFileName,
} from "./media.validation.js";
import { getOwnedMediaMessage } from "./media.service.js";

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

async function handleUpload(
  request: Request,
  response: Response,
): Promise<void> {
  const context = requireAuthContext(request);
  const input = mediaUploadQuerySchema.parse(request.query);
  const conversationId = request.params.conversationId;
  if (typeof conversationId !== "string") {
    throw new AppError({
      code: "CONVERSATION_NOT_FOUND",
      message: "The conversation was not found.",
      statusCode: 404,
    });
  }
  if (!Buffer.isBuffer(request.body)) {
    throw new AppError({
      code: "MEDIA_BODY_REQUIRED",
      message: "A binary media body is required.",
      statusCode: 400,
    });
  }
  const detected = await detectMedia(input.type, request.body);
  const storageKey = `${randomUUID()}.${detected.extension}`;
  await mediaStorage.put(storageKey, request.body);
  const media = {
    url: `/api/v1/media/${storageKey}`,
    storageKey,
    mimeType: detected.mimeType,
    size: request.body.length,
    width: input.width ?? null,
    height: input.height ?? null,
    durationSeconds: input.durationSeconds ?? null,
    thumbnailUrl: null,
    fileName: sanitizeFileName(request.get("x-file-name")),
  };

  try {
    const result = await sendMediaMessage(context, conversationId, {
      clientMessageId: input.clientMessageId,
      type: input.type,
      media,
    });
    if (result.duplicate) {
      await mediaStorage.remove(storageKey);
    } else {
      publishMessageCreated({
        message: result.message,
        recipientId: result.recipientId,
        senderId: context.userId,
      });
    }
    response.status(result.duplicate ? 200 : 201).json({
      success: true,
      data: { message: result.message, duplicate: result.duplicate },
    });
  } catch (error: unknown) {
    await mediaStorage.remove(storageKey).catch(() => undefined);
    throw error;
  }
}

async function handleDownload(
  request: Request,
  response: Response,
): Promise<void> {
  const storageKey = request.params.storageKey;
  if (typeof storageKey !== "string") {
    throw new AppError({
      code: "MEDIA_NOT_FOUND",
      message: "The media file was not found.",
      statusCode: 404,
    });
  }
  const media = await getOwnedMediaMessage(
    requireAuthContext(request),
    storageKey,
  );
  const file = await mediaStorage.open(media.storageKey);
  if (file === null) {
    throw new AppError({
      code: "MEDIA_NOT_FOUND",
      message: "The media file was not found.",
      statusCode: 404,
    });
  }
  response.setHeader("Content-Type", media.mimeType);
  response.setHeader("Content-Length", String(file.size));
  response.setHeader(
    "Content-Disposition",
    media.fileName === null
      ? "inline"
      : `inline; filename="${media.fileName.replace(/"/g, "")}"`,
  );
  await pipeline(file.stream, response);
}

export const uploadMediaController: RequestHandler = controller(handleUpload);
export const downloadMediaController: RequestHandler =
  controller(handleDownload);
