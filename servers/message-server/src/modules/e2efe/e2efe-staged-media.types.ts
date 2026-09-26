import type { HydratedDocument, Types } from "mongoose";

export interface E2EFEStagedMediaEntity {
  storageKey: string;
  conversationId: Types.ObjectId;
  uploaderId: Types.ObjectId;
  clientMessageId: string;
  type: "image" | "video" | "audio" | "file";
  size: number;
  attachedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type E2EFEStagedMediaDocument = HydratedDocument<E2EFEStagedMediaEntity>;
