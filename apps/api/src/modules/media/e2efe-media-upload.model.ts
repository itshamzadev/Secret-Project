import { model, Schema } from "mongoose";

import type { E2EFEStagedMediaEntity } from "./e2efe-media-upload.types.js";

const e2efeStagedMediaSchema = new Schema<E2EFEStagedMediaEntity>(
  {
    storageKey: { type: String, required: true, unique: true, index: true },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    uploaderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    clientMessageId: { type: String, required: true, maxlength: 128 },
    type: {
      type: String,
      enum: ["image", "video", "audio", "file"],
      required: true,
    },
    size: { type: Number, required: true, min: 1 },
    attachedAt: { type: Date, default: null },
  },
  { collection: "e2efe_staged_media", timestamps: true, versionKey: false },
);

e2efeStagedMediaSchema.index(
  { uploaderId: 1, clientMessageId: 1 },
  { unique: true },
);

export const E2EFEStagedMediaModel = model<E2EFEStagedMediaEntity>(
  "E2EFEStagedMedia",
  e2efeStagedMediaSchema,
);
