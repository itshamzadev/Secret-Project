import { callEndReasons, callStatuses, callTypes } from "@terqivo/contracts";
import { model, Schema } from "mongoose";

import type { CallEntity } from "./call.types.js";

const callSchema = new Schema<CallEntity>(
  {
    callerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    calleeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
    },
    type: { type: String, enum: [...callTypes], required: true },
    status: { type: String, enum: [...callStatuses], required: true },
    initiatedAt: { type: Date, required: true },
    answeredAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: null, min: 0 },
    endedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    endReason: { type: String, enum: [...callEndReasons], default: null },
    callerSessionId: { type: String, required: true, maxlength: 128 },
    acceptedBySessionId: { type: String, default: null, maxlength: 128 },
  },
  { collection: "calls", timestamps: true, versionKey: false },
);

callSchema.index({ callerId: 1, initiatedAt: -1, _id: -1 });
callSchema.index({ calleeId: 1, initiatedAt: -1, _id: -1 });
callSchema.index({ status: 1, initiatedAt: 1 });

export const CallModel = model<CallEntity>("Call", callSchema);
