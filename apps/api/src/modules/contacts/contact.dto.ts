import type { ContactDto, ContactUserDto } from "@terqivo/contracts";

import type { ContactDocument } from "./contact.types.js";
import type { UserDocument } from "../users/user.types.js";

export function toContactUserDto(user: UserDocument): ContactUserDto {
  return {
    id: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
  };
}

export function toContactDto(
  contact: ContactDocument,
  contactUser: UserDocument,
): ContactDto {
  return {
    id: contact._id.toString(),
    contactUser: toContactUserDto(contactUser),
    customName: contact.customName,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}
