import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("terqivoDesktop", {
  readRefreshToken: (): Promise<string | null> =>
    ipcRenderer.invoke("session:read-refresh"),
  writeRefreshToken: (token: string): Promise<boolean> =>
    ipcRenderer.invoke("session:write-refresh", token),
  clearRefreshToken: (): Promise<void> =>
    ipcRenderer.invoke("session:clear-refresh"),
  platform: process.platform,
});
