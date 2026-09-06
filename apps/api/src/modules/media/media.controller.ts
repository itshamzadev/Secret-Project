import { pipeline } from "node:stream/promises";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { randomUUID } from "node:crypto";

import { requireAuthContext } from "../../middleware/authenticate.js";
import { AppError } from "../../core/errors.js";
import { sendMediaMessage } from "../messages/message.service.js";
import { sendEncryptedMediaMessage } from "../messages/encrypted-message.service.js";
import { publishMessageCreated } from "../messages/message.events.js";
import { mediaStorage } from "./media.storage.js";
import { logger } from "../../lib/logger.js";
import {
  inspectMedia,
  mediaUploadQuerySchema,
  sanitizeFileName,
  validateDetectedMedia,
  e2efeMediaUploadQuerySchema,
} from "./media.validation.js";
import {
  createStagedE2EFEMedia,
  getOwnedMediaMessage,
  getOwnedStagedE2EFEMedia,
  markStagedE2EFEMediaAttached,
} from "./media.service.js";
import { e2efeEncryptedMediaSchema } from "../messages/message.validation.js";

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
  let storageKey: string | undefined;
  try {
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      throw new AppError({
        code: "MEDIA_BODY_REQUIRED",
        message: "A binary media body is required.",
        statusCode: 400,
      });
    }
    const declaredMimeType =
      request.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ??
      null;
    const fileName = request.get("x-file-name") ?? null;
    const inspected = await inspectMedia(request.body);
    logger.info(
      {
        conversationId,
        userId: context.userId,
        mediaType: input.type,
        byteSize: request.body.length,
        declaredMimeType,
        detectedMimeType: inspected?.mimeType ?? null,
        detectedExtension: inspected?.extension ?? null,
        isoBmff: inspected?.isIsoBmff ?? false,
        hasAudioTrack: inspected?.hasAudioTrack ?? false,
        hasVideoTrack: inspected?.hasVideoTrack ?? false,
      },
      "Media upload inspected",
    );
    const detected = validateDetectedMedia(input.type, inspected, {
      declaredMimeType,
      fileName,
    });
    storageKey = `${randomUUID()}.${detected.extension}`;
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
      fileName: sanitizeFileName(fileName ?? undefined),
    };
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
    if (storageKey !== undefined) {
      await mediaStorage.remove(storageKey).catch(() => undefined);
    }
    logger.error(
      {
        conversationId,
        userId: context.userId,
        mediaType: input.type,
        errorCategory:
          error instanceof AppError
            ? error.code
            : error instanceof Error
              ? error.name
              : "UNKNOWN_ERROR",
        statusCode: error instanceof AppError ? error.statusCode : 500,
      },
      "Media upload failed",
    );
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

async function handleEncryptedUpload(
  request: Request,
  response: Response,
): Promise<void> {
  const context = requireAuthContext(request);
  const { conversationId } = request.params;
  if (typeof conversationId !== "string") {
    throw new AppError({
      code: "CONVERSATION_NOT_FOUND",
      message: "The conversation was not found.",
      statusCode: 404,
    });
  }
  const input = e2efeMediaUploadQuerySchema.parse(request.query);
  if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
    throw new AppError({
      code: "MEDIA_BODY_REQUIRED",
      message: "A binary media body is required.",
      statusCode: 400,
    });
  }

  const existing = await getOwnedStagedE2EFEMedia(
    context,
    conversationId,
    input.clientMessageId,
  );
  if (existing !== null) {
    if (existing.type !== input.type || existing.size !== request.body.length) {
      throw new AppError({
        code: "CLIENT_MESSAGE_ID_CONFLICT",
        message: "The client message identifier is already used elsewhere.",
        statusCode: 409,
      });
    }
    response.status(200).json({
      success: true,
      data: { storageKey: existing.storageKey, size: existing.size },
    });
    return;
  }

  const storageKey = `${randomUUID()}.bin`;
  try {
    await mediaStorage.put(storageKey, request.body);
    try {
      await createStagedE2EFEMedia({
        storageKey,
        conversationId,
        uploaderId: context.userId,
        clientMessageId: input.clientMessageId,
        type: input.type,
        size: request.body.length,
      });
    } catch (error: unknown) {
      const raced = await getOwnedStagedE2EFEMedia(
        context,
        conversationId,
        input.clientMessageId,
      );
      if (raced === null) throw error;
      await mediaStorage.remove(storageKey).catch(() => undefined);
      response.status(200).json({
        success: true,
        data: { storageKey: raced.storageKey, size: raced.size },
      });
      return;
    }
  } catch (error: unknown) {
    await mediaStorage.remove(storageKey).catch(() => undefined);
    throw error;
  }
  response.status(201).json({
    success: true,
    data: { storageKey, size: request.body.length },
  });
}

async function handleEncryptedMessage(
  request: Request,
  response: Response,
): Promise<void> {
  const context = requireAuthContext(request);
  const { conversationId } = request.params;
  if (typeof conversationId !== "string") {
    throw new AppError({
      code: "CONVERSATION_NOT_FOUND",
      message: "The conversation was not found.",
      statusCode: 404,
    });
  }
  const input = e2efeEncryptedMediaSchema.parse({
    ...request.body,
    conversationId,
  });
  const staged = await getOwnedStagedE2EFEMedia(
    context,
    conversationId,
    input.clientMessageId,
  );
  if (staged === null) {
    throw new AppError({
      code: "MEDIA_UPLOAD_NOT_FOUND",
      message: "The encrypted media upload was not found.",
      statusCode: 404,
    });
  }
  if (
    staged.type !== input.type ||
    staged.size !== input.media.size ||
    staged.storageKey !== input.media.storageKey
  ) {
    throw new AppError({
      code: "MEDIA_UPLOAD_MISMATCH",
      message: "The encrypted media upload does not match the message.",
      statusCode: 409,
    });
  }
  const media = {
    url: `/api/v1/media/${input.media.storageKey}`,
    storageKey: input.media.storageKey,
    mimeType: "application/octet-stream",
    size: input.media.size,
    width: null,
    height: null,
    durationSeconds: null,
    thumbnailUrl: null,
    fileName: null,
    encrypted: true,
    encryptionVersion: "aes-256-gcm-v1" as const,
  };
  const result = await sendEncryptedMediaMessage(context, conversationId, {
    ...input,
    media,
  });
  if (staged !== null) await markStagedE2EFEMediaAttached(staged);
  response.status(result.duplicate ? 200 : 201).json({
    success: true,
    data: {
      message: result.message,
      envelopes: result.envelopes,
      duplicate: result.duplicate,
    },
  });
}

export const uploadMediaController: RequestHandler = controller(handleUpload);
export const downloadMediaController: RequestHandler =
  controller(handleDownload);
export const encryptedMediaUploadController: RequestHandler = controller(
  handleEncryptedUpload,
);
export const encryptedMediaMessageController: RequestHandler = controller(
  handleEncryptedMessage,
);
