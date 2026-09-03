import type { AuthTokenStore } from "@terqivo/api-client";

let accessToken: string | null = null;

export const webTokenStore: AuthTokenStore = {
  getAccessToken: () => accessToken,
  setAccessToken: (token) => {
    accessToken = token;
  },
  getRefreshToken: () => null,
  setRefreshToken: () => undefined,
  clear: () => {
    accessToken = null;
  },
};
