import { model, Schema } from "mongoose";

import type { ContactEntity } from "./contact.types.js";

const contactSchema = new Schema<ContactEntity>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    contactUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    customName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
    },
  },
  {
    collection: "contacts",
    timestamps: true,
    versionKey: false,
  },
);

contactSchema.index({ ownerId: 1, contactUserId: 1 }, { unique: true });
contactSchema.index({ ownerId: 1, createdAt: -1 });

export const ContactModel = model<ContactEntity>("Contact", contactSchema);
