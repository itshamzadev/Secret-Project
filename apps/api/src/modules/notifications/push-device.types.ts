import type { HydratedDocument, Types } from "mongoose";

import type { PushPlatform } from "@terqivo/contracts";

export interface PushDeviceEntity {
  userId: Types.ObjectId;
  pushToken: string;
  platform: PushPlatform;
  deviceId: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type PushDeviceDocument = HydratedDocument<PushDeviceEntity>;
