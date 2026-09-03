import { app, BrowserWindow, ipcMain, safeStorage } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const sessionFile = () => path.join(app.getPath("userData"), "session.bin");

async function readRefreshToken(): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const encrypted = await fs.readFile(sessionFile());
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
}

async function writeRefreshToken(token: string): Promise<boolean> {
  if (!safeStorage.isEncryptionAvailable()) return false;
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(sessionFile(), safeStorage.encryptString(token), {
    mode: 0o600,
  });
  return true;
}

async function clearRefreshToken(): Promise<void> {
  await fs.rm(sessionFile(), { force: true });
}

function installSecureSessionBridge(): void {
  ipcMain.handle("session:read-refresh", readRefreshToken);
  ipcMain.handle("session:write-refresh", (_event, token: unknown) => {
    if (typeof token !== "string" || token.length === 0) return false;
    return writeRefreshToken(token);
  });
  ipcMain.handle("session:clear-refresh", clearRefreshToken);
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: "#f4f7f8",
    webPreferences: {
      preload: path.join(currentDirectory, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.NODE_ENV === "development") {
    void window.loadURL("http://localhost:5174");
  } else {
    void window.loadFile(path.join(currentDirectory, "renderer", "index.html"));
  }
  return window;
}

app.whenReady().then(() => {
  installSecureSessionBridge();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
