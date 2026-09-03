import { TerqivoApiClient } from "@terqivo/api-client";
import { TerqivoRealtimeClient } from "@terqivo/realtime-client";

import { webTokenStore } from "./auth/session";
import { webEnv } from "./config/env";

export const api = new TerqivoApiClient({
  baseURL: webEnv.apiUrl,
  tokenStore: webTokenStore,
});

export const realtime = new TerqivoRealtimeClient({
  url: webEnv.socketUrl,
  getAccessToken: webTokenStore.getAccessToken,
});
