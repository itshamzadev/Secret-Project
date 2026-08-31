import type { CallEndReason, CallStatus, CallType } from "@terqivo/contracts";
import type { HydratedDocument, Types } from "mongoose";

export interface CallEntity {
  callerId: Types.ObjectId;
  calleeId: Types.ObjectId;
  conversationId: Types.ObjectId | null;
  type: CallType;
  status: CallStatus;
  initiatedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  durationSeconds: number | null;
  endedBy: Types.ObjectId | null;
  endReason: CallEndReason | null;
  callerSessionId: string;
  acceptedBySessionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CallDocument = HydratedDocument<CallEntity>;
