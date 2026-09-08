import type { HydratedDocument, Types } from "mongoose";

export interface StatusEntity {
  ownerId: Types.ObjectId;
  text: string;
  viewedBy: Types.ObjectId[];
  createdAt: Date;
  expiresAt: Date;
}

export type StatusDocument = HydratedDocument<StatusEntity>;
