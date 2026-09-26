import type { PublicUser } from "../../clients/auth.client.js";
import type { StatusDocument } from "../../models/status.types.js";

export interface ContactUserDto {
  id: string;
  username: string;
  displayName: string;
  phone: string | null;
  avatarUrl: string | null;
  bio: string | null;
  accountType: "personal" | "professional" | "business";
  badges?: string[];
}

export interface StatusDto {
  id: string;
  author: ContactUserDto;
  type: "text" | "image" | "video" | "audio";
  text: string;
  media: { url: string; mimeType: string; size: number; width: number | null; height: number | null; durationSeconds: number | null } | null;
  viewed: boolean;
  viewerCount: number;
  viewers: ContactUserDto[];
  createdAt: string;
  expiresAt: string;
}

function toContactUserDto(user: PublicUser): ContactUserDto {
  return { id: user.id, username: user.username, displayName: user.displayName, phone: user.phone, avatarUrl: user.avatarUrl, bio: user.bio, accountType: user.accountType, badges: user.badges };
}

export function toStatusDto(status: StatusDocument, owner: PublicUser, viewerId: string, viewerUsers: PublicUser[] = []): StatusDto {
  const statusId = status._id.toString();
  const ownerId = owner.id;
  const viewedUserIds = new Set(status.viewedBy.map((id) => id.toString()).filter((id) => id !== ownerId));
  const viewers = viewerUsers.filter((user) => viewedUserIds.has(user.id)).map(toContactUserDto);
  const media = status.media;
  return {
    id: statusId,
    author: toContactUserDto(owner),
    type: status.type ?? "text",
    text: status.text ?? "",
    media: media === null ? null : { url: `/api/v1/status/${statusId}/media`, mimeType: media.mimeType, size: media.size, width: media.width, height: media.height, durationSeconds: media.durationSeconds },
    viewed: status.viewedBy.some((id) => id.toString() === viewerId),
    viewerCount: viewedUserIds.size,
    viewers: ownerId === viewerId ? viewers : [],
    createdAt: status.createdAt.toISOString(),
    expiresAt: status.expiresAt.toISOString(),
  };
}
