import type { CallDto, CallSignalDto, CallUserDto } from "@terqivo/contracts";

import type { UserDocument } from "../users/user.types.js";
import type { CallDocument } from "./call.types.js";

export function toCallUserDto(user: UserDocument): CallUserDto {
  return {
    id: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

export function toCallSignalDto(call: CallDocument): CallSignalDto {
  return {
    id: call._id.toString(),
    type: call.type,
    callerId: call.callerId.toString(),
    calleeId: call.calleeId.toString(),
    status: call.status,
    initiatedAt: call.initiatedAt.toISOString(),
    answeredAt: call.answeredAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
  };
}

export function toCallDto(
  call: CallDocument,
  currentUserId: string,
  otherUser: UserDocument,
): CallDto {
  return {
    id: call._id.toString(),
    type: call.type,
    direction:
      call.callerId.toString() === currentUserId ? "outgoing" : "incoming",
    otherUser: toCallUserDto(otherUser),
    status: call.status,
    initiatedAt: call.initiatedAt.toISOString(),
    answeredAt: call.answeredAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    durationSeconds: call.durationSeconds,
    endReason: call.endReason,
  };
}
