import type { HydratedDocument, Types } from "mongoose";

export type CallType = "voice" | "video";
export type CallStatus = "ringing" | "accepted" | "declined" | "missed" | "ended" | "cancelled" | "failed";
export type CallEndReason = "declined" | "cancelled" | "timeout" | "remote-ended" | "connection-failed" | "local-ended" | "unknown";

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
  callChatMessageCount: number;
  endedBy: Types.ObjectId | null;
  endReason: CallEndReason | null;
  callerSessionId: string;
  acceptedBySessionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CallDocument = HydratedDocument<CallEntity>;

export interface CallUserDto { id: string; username: string; displayName: string; avatarUrl: string | null; badges?: string[]; }
export interface CallSignalDto { id: string; type: CallType; callerId: string; calleeId: string; status: CallStatus; initiatedAt: string; answeredAt: string | null; endedAt: string | null; }
export interface CallDto { id: string; type: CallType; direction: "incoming" | "outgoing"; otherUser: CallUserDto; status: CallStatus; initiatedAt: string; answeredAt: string | null; endedAt: string | null; durationSeconds: number | null; endReason: CallEndReason | null; callChatMessageCount: number; }
