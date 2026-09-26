import type { ContactDto, ContactUserDto } from "../../contracts/index.js";

import type { UserDocument } from "../users/user.types.js";

export function toContactUserDto(user: UserDocument): ContactUserDto {
  return { id: user._id.toString(), username: user.username, displayName: user.displayName, phone: user.phone, avatarUrl: user.avatarUrl, bio: user.bio, accountType: user.accountType ?? "personal", badges: user.badges ?? [] };
}

export function toContactDto(
  contact: { _id: { toString(): string }; customName: string | null; createdAt: Date; updatedAt: Date },
  contactUser: UserDocument,
): ContactDto {
  return { id: contact._id.toString(), contactUser: toContactUserDto(contactUser), customName: contact.customName, createdAt: contact.createdAt.toISOString(), updatedAt: contact.updatedAt.toISOString() };
}
