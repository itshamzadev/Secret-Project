export const adminRoles = ["super_admin", "admin", "moderator", "support"] as const;
export type AdminRole = (typeof adminRoles)[number];
export const adminPermissions = [
  "dashboard.view",
  "users.view",
  "users.manage",
  "users.suspend",
  "reports.view",
  "reports.resolve",
  "calls.view_metadata",
  "notifications.send",
  "audit.view",
] as const;
export type AdminPermission = (typeof adminPermissions)[number];
export type BadgeType = "verified" | "terqivo";
export type UserTier = "normal" | "special" | "special_pro" | "ultra_special";
export type UserAccountStatus = "active" | "suspended" | "disabled";
export type UserRole = "user" | "moderator" | "admin";
export type ReportReason = "spam" | "harassment" | "abuse" | "impersonation" | "other";
export type ReportTargetType = "user" | "message" | "group" | "channel";
export type ReportStatus = "open" | "resolved" | "dismissed";

export interface AdminUserDto { id: string; email: string; displayName: string; role: AdminRole; permissions: AdminPermission[]; lastLoginAt: string | null; createdAt: string; }
export interface AdminAuthenticationResponse { admin: AdminUserDto; accessToken: string; accessTokenExpiresIn: number; }
export interface AdminUserAppVersionDto { version: string | null; build: number | null; platform: string; deviceName: string; lastUsedAt: string; active: boolean; }
export interface AdminUserListItemDto { id: string; username: string; displayName: string; email: string | null; phone: string | null; avatarUrl: string | null; accountStatus: UserAccountStatus; role: UserRole; accountType: "personal" | "professional" | "business"; userTier: UserTier; badges: BadgeType[]; createdAt: string; lastSeenAt: string | null; appVersions: AdminUserAppVersionDto[]; }
export interface AdminUserListResponse { users: AdminUserListItemDto[]; nextCursor: string | null; }
export interface ContactDto { id: string; username: string; displayName: string; phone: string | null; avatarUrl: string | null; bio: string | null; accountType: "personal" | "professional" | "business"; badges: BadgeType[]; }
export interface AdminGroupListItemDto { id: string; name: string; description: string; avatarUrl: string | null; owner: ContactDto | null; admins: ContactDto[]; members: ContactDto[]; badges: BadgeType[]; memberCount: number; createdAt: string; updatedAt: string; }
export interface AdminChannelListItemDto { id: string; name: string; handle: string; description: string; avatarUrl: string | null; owner: ContactDto | null; followers: ContactDto[]; followerCount: number; latestPost: ChannelPostDto | null; badges: BadgeType[]; createdAt: string; updatedAt: string; }
export interface ChannelPostDto { id: string; channelId: string; author: ContactDto; text: string; createdAt: string; updatedAt: string; }
export interface AdminGroupListResponse { groups: AdminGroupListItemDto[]; }
export interface AdminChannelListResponse { channels: AdminChannelListItemDto[]; }
export interface AdminDashboardDto { users: { total: number; active: number; suspended: number; disabled: number; online: number }; conversations: { total: number }; messages: { total: number; today: number }; calls: { total: number; missed: number }; pushDevices: { enabled: number }; health: { database: "connected" | "disconnected"; redis: "connected" | "disconnected"; uptime: number }; }
export interface ReportDto { id: string; targetType: ReportTargetType; conversationId: string | null; messageId: string | null; groupId: string | null; channelId: string | null; reason: ReportReason; details: string | null; status: ReportStatus; createdAt: string; updatedAt: string; }
export interface AdminReportUserDto { id: string; username: string; displayName: string; }
export interface AdminReportDto extends ReportDto { reporter: AdminReportUserDto; targetUser: AdminReportUserDto | null; resolvedByAdminId: string | null; resolvedAt: string | null; }
export interface AdminReportListResponse { reports: AdminReportDto[]; }
