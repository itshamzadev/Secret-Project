import type { ChannelDto, ChannelPostDto } from "@terqivo/contracts";

import { toContactUserDto } from "../contacts/contact.dto.js";
import type { UserDocument } from "../users/user.types.js";
import type { ChannelDocument, ChannelPostDocument } from "./channel.types.js";

export function toChannelPostDto(
  post: ChannelPostDocument,
  author: UserDocument,
): ChannelPostDto {
  return {
    id: post._id.toString(),
    channelId: post.channelId.toString(),
    author: toContactUserDto(author),
    text: post.text,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

export function toChannelDto(
  channel: ChannelDocument,
  owner: UserDocument,
  currentUserId: string,
  latestPost: ChannelPostDto | null,
): ChannelDto {
  return {
    id: channel._id.toString(),
    name: channel.name,
    handle: channel.handle,
    description: channel.description,
    avatarUrl: channel.avatarUrl,
    owner: toContactUserDto(owner),
    followerCount: channel.followerIds.length,
    isFollowing: channel.followerIds.some(
      (id) => id.toString() === currentUserId,
    ),
    latestPost,
    badges: channel.badges ?? [],
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
  };
}
