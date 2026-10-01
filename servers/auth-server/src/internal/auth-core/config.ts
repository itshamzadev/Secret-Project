export interface AuthCoreConfig {
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  maxLinkedDevices: number;
  onSessionRevoked?: (sessionId: string) => void | Promise<void>;
}

let configured: AuthCoreConfig | undefined;

export function configureAuthCore(config: AuthCoreConfig): void {
  configured = { ...config };
}

export function getAuthCoreConfig(): AuthCoreConfig {
  if (configured === undefined) {
    throw new Error("Auth core has not been configured");
  }
  return configured;
}
