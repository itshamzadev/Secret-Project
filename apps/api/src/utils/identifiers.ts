import { Types } from "mongoose";
import { z } from "zod";

export const objectIdSchema = z.string().refine(Types.ObjectId.isValid, {
  message: "must be a valid identifier",
});

export function toObjectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}
