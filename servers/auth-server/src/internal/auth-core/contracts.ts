export const clientPlatforms = ["web", "android", "ios", "windows", "macos", "linux", "unknown"] as const;
export type ClientPlatform = (typeof clientPlatforms)[number];
export const accountTypes = ["personal", "professional", "business"] as const;
export type AccountType = (typeof accountTypes)[number];
export const badgeTypes = ["verified", "terqivo"] as const;
export type BadgeType = (typeof badgeTypes)[number];
export interface SafeUserDto {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
  avatarUrl: string | null;
  bio: string | null;
  role: "user" | "moderator" | "admin";
  accountStatus: "active" | "suspended" | "disabled";
  accountType: AccountType;
  badges?: BadgeType[];
  createdAt: string;
  updatedAt: string;
}
export interface AuthSessionDto {
  id: string;
  deviceId: string | null;
  deviceName: string;
  platform: ClientPlatform;
  appVersion?: string | null;
  appBuild?: number | null;
  createdAt: string;
  lastUsedAt: string;
  lastRefreshAt: string;
  expiresAt: string;
  current: boolean;
}
export interface AuthenticationResponse {
  user: SafeUserDto;
  session: AuthSessionDto;
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
}
export interface ApplicationErrorOptions { code: string; message: string; statusCode: number; details?: unknown; }
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details: unknown | undefined;
  public constructor(options: ApplicationErrorOptions) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
  }
}
