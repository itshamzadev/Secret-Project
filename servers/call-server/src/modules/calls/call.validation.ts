import { Types } from "mongoose";
import { z } from "zod";

const objectId = z.string().trim().refine(Types.ObjectId.isValid, "Invalid identifier");
export const callStartSchema = z.object({ calleeId: objectId, type: z.enum(["voice", "video"]) });
export const callIdParamsSchema = z.object({ callId: objectId });
export const callHistoryQuerySchema = z.object({ cursor: z.string().trim().min(1).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) });
export type CallStartInput = z.infer<typeof callStartSchema>;
export type CallHistoryQuery = z.infer<typeof callHistoryQuerySchema>;
