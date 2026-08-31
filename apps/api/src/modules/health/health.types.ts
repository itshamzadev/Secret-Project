export type HealthState = "ok" | "degraded";
export type ServiceConnectionStatus = "connected" | "disconnected";

export interface HealthSnapshot {
  status: HealthState;
  database: ServiceConnectionStatus;
  redis: ServiceConnectionStatus;
  uptime: number;
}

export type HealthSnapshotProvider = () => HealthSnapshot;
