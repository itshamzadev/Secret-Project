/// <reference types="vite/client" />

interface Window {
  terqivoDesktop: {
    readRefreshToken(): Promise<string | null>;
    writeRefreshToken(token: string): Promise<boolean>;
    clearRefreshToken(): Promise<void>;
    platform: string;
  };
}
