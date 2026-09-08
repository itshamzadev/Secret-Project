import type { StatusDto } from "@terqivo/contracts";

import { toContactUserDto } from "../contacts/contact.dto.js";
import type { UserDocument } from "../users/user.types.js";
import type { StatusDocument } from "./status.types.js";

export function toStatusDto(status: StatusDocument, owner: UserDocument, viewerId: string): StatusDto {
  return {
    id: status._id.toString(),
    author: toContactUserDto(owner),
    text: status.text,
    viewed: status.viewedBy.some((id) => id.toString() === viewerId),
    createdAt: status.createdAt.toISOString(),
    expiresAt: status.expiresAt.toISOString(),
  };
}
