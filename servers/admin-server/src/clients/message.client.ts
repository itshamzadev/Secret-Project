import type { AdminServerConfig } from "../config/env.js";
import { callInternal } from "./http.js";

export interface MessageAdminGroup { id: string; name: string; description: string; avatarUrl: string | null; badges: ("verified" | "terqivo")[]; owner: ContactSnapshot | null; admins: ContactSnapshot[]; members: ContactSnapshot[]; memberCount: number; createdAt: string; updatedAt: string; }
export interface MessageAdminChannel { id: string; name: string; handle: string; description: string; avatarUrl: string | null; badges: ("verified" | "terqivo")[]; owner: ContactSnapshot | null; followers: ContactSnapshot[]; followerCount: number; latestPost: ChannelPostSnapshot | null; createdAt: string; updatedAt: string; }
export interface ContactSnapshot { id: string; username: string; displayName: string; phone: string | null; avatarUrl: string | null; bio: string | null; accountType: "personal" | "professional" | "business"; badges: ("verified" | "terqivo")[]; }
export interface ChannelPostSnapshot { id: string; channelId: string; author: ContactSnapshot; text: string; createdAt: string; updatedAt: string; }

export async function listGroups(config: AdminServerConfig) { return callInternal<{ success: true; data: { groups: MessageAdminGroup[] } }>(config, config.MESSAGE_SERVICE_URL, "/internal/admin/groups"); }
export async function listChannels(config: AdminServerConfig) { return callInternal<{ success: true; data: { channels: MessageAdminChannel[] } }>(config, config.MESSAGE_SERVICE_URL, "/internal/admin/channels"); }
export async function getMessageStats(config: AdminServerConfig) { return callInternal<{ success: true; data: { conversations: { total: number }; messages: { total: number; today: number } } }>(config, config.MESSAGE_SERVICE_URL, "/internal/admin/stats"); }
export async function validateReportTarget(config: AdminServerConfig, input: Record<string, string | undefined>) { return callInternal<{ success: true; data: { valid: true } }>(config, config.MESSAGE_SERVICE_URL, "/internal/admin/report-target/validate", { method: "POST", body: JSON.stringify(Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))) }); }

export async function updateGroupBadges(config: AdminServerConfig, groupId: string, badges: string[]) {
  return callInternal<{ success: true; data: { updated: true; badges: string[] } }>(config, config.MESSAGE_SERVICE_URL, `/internal/admin/groups/${groupId}/badges`, { method: "PATCH", body: JSON.stringify({ badges }) });
}
export async function updateChannelBadges(config: AdminServerConfig, channelId: string, badges: string[]) {
  return callInternal<{ success: true; data: { updated: true; badges: string[] } }>(config, config.MESSAGE_SERVICE_URL, `/internal/admin/channels/${channelId}/badges`, { method: "PATCH", body: JSON.stringify({ badges }) });
}
