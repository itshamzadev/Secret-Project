import type { HydratedDocument, Types } from "mongoose";

import type { ClientPlatform } from "@terqivo/contracts";

export interface UserPresenceSessionEntity {
  userId: Types.ObjectId;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number;
  deviceId: string | null;
  platform: ClientPlatform | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserPresenceSessionDocument =
  HydratedDocument<UserPresenceSessionEntity>;
