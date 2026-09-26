import { model, Schema } from "mongoose";

import type { CallEntity } from "./call.types.js";

const schema = new Schema<CallEntity>({
  callerId: { type: Schema.Types.ObjectId, required: true },
  calleeId: { type: Schema.Types.ObjectId, required: true },
  conversationId: { type: Schema.Types.ObjectId, default: null },
  type: { type: String, enum: ["voice", "video"], required: true },
  status: { type: String, enum: ["ringing", "accepted", "declined", "missed", "ended", "cancelled", "failed"], required: true },
  initiatedAt: { type: Date, required: true },
  answeredAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  durationSeconds: { type: Number, default: null },
  endedBy: { type: Schema.Types.ObjectId, default: null },
  endReason: { type: String, default: null },
  callerSessionId: { type: String, required: true },
  acceptedBySessionId: { type: String, default: null },
}, { collection: "calls", timestamps: true, versionKey: false });

schema.index({ callerId: 1, initiatedAt: -1, _id: -1 });
schema.index({ calleeId: 1, initiatedAt: -1, _id: -1 });
schema.index({ status: 1, initiatedAt: 1 });

export const CallModel = model<CallEntity>("CallServerCall", schema, "calls");
