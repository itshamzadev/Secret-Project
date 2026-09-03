import { TerqivoApiClient } from "@terqivo/api-client";
import { TerqivoRealtimeClient } from "@terqivo/realtime-client";

import { desktopEnv } from "./config/env";

let accessToken: string | null = null;
let refreshToken: string | null = null;

export const desktopTokenStore = {
  getAccessToken: () => accessToken,
  setAccessToken: (token: string) => {
    accessToken = token;
  },
  getRefreshToken: () => refreshToken,
  setRefreshToken: (token: string) => {
    refreshToken = token;
    void window.terqivoDesktop.writeRefreshToken(token);
  },
  clear: () => {
    accessToken = null;
    refreshToken = null;
    void window.terqivoDesktop.clearRefreshToken();
  },
};

export async function hydrateRefreshToken(): Promise<void> {
  refreshToken = await window.terqivoDesktop.readRefreshToken();
}

export const api = new TerqivoApiClient({
  baseURL: desktopEnv.apiUrl,
  tokenStore: desktopTokenStore,
});

export const realtime = new TerqivoRealtimeClient({
  url: desktopEnv.socketUrl,
  getAccessToken: desktopTokenStore.getAccessToken,
});
