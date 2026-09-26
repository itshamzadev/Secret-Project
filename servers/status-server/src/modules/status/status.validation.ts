import { z } from "zod";

import { AppError } from "../../core/errors.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const statusText = (min = 0) => z.string().trim().min(min).max(500).refine((value) => [...value].every((character) => character.charCodeAt(0) >= 32), "text contains unsupported control characters");

export const createStatusSchema = z.object({ text: statusText(1) });
export const statusMediaUploadQuerySchema = z.object({
  type: z.enum(["image", "video", "audio"]),
  text: statusText().default(""),
  width: z.coerce.number().int().min(1).max(20_000).optional(),
  height: z.coerce.number().int().min(1).max(20_000).optional(),
  durationSeconds: z.coerce.number().min(0).max(86_400).optional(),
});
export const statusIdParamsSchema = z.object({ statusId: objectId });
export type CreateStatusInput = z.infer<typeof createStatusSchema>;
export type StatusMediaUploadInput = z.infer<typeof statusMediaUploadQuerySchema>;

export function invalidStatus(): AppError { return new AppError({ code: "STATUS_NOT_FOUND", message: "The status was not found.", statusCode: 404 }); }
