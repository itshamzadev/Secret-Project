import type { HydratedDocument, Types } from "mongoose";

import type { StatusType } from "@terqivo/contracts";

export interface StatusMediaEntity {
  storageKey: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

export interface StatusEntity {
  ownerId: Types.ObjectId;
  type: StatusType;
  text: string;
  media: StatusMediaEntity | null;
  viewedBy: Types.ObjectId[];
  createdAt: Date;
  expiresAt: Date;
}

export type StatusDocument = HydratedDocument<StatusEntity>;
