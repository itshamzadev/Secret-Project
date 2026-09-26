import type { AuthenticationResponse, AuthSessionDto, ClientPlatform } from "@terqivo/contracts";
export type { ClientPlatform };
export interface AuthContext { userId: string; sessionId: string; }
export interface DeviceMetadata {
  deviceId: string | null;
  deviceName: string;
  platform: ClientPlatform;
  appVersion: string | null;
  appBuild: number | null;
  userAgent: string;
  ipAddress: string;
}
export type AuthResult = AuthenticationResponse;
export type SessionView = AuthSessionDto;
