import { callTypes } from "@terqivo/contracts";
import { Types } from "mongoose";
import { z } from "zod";

const objectId = z
  .string()
  .trim()
  .refine(Types.ObjectId.isValid, "Invalid identifier");

export const callStartSchema = z.object({
  calleeId: objectId,
  type: z.enum(callTypes),
});

export const callIdParamsSchema = z.object({ callId: objectId });

export const callHistoryQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const webrtcDescriptionSchema = z.object({
  callId: objectId,
  description: z.object({
    type: z.enum(["offer", "answer"]),
    sdp: z.string().min(1).max(100_000),
  }),
});

export const webrtcIceCandidateSchema = z.object({
  callId: objectId,
  candidate: z.object({
    candidate: z.string().min(1).max(4096),
    sdpMid: z.string().max(256).nullable(),
    sdpMLineIndex: z.number().int().min(0).max(100).nullable(),
  }),
});

export type CallStartInput = z.infer<typeof callStartSchema>;
export type CallHistoryQuery = z.infer<typeof callHistoryQuerySchema>;
