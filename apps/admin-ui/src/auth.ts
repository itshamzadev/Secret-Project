import type { AdminUserDto } from "@terqivo/contracts";

const storageKey = "terqivo.admin.session";

export interface AdminSession {
  admin: AdminUserDto;
  accessToken: string;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadAdminSession(): AdminSession | null {
  const storage = getStorage();
  if (storage === null) return null;
  const value = storage.getItem(storageKey);
  if (value === null) return null;
  try {
    const session = JSON.parse(value) as Partial<AdminSession>;
    if (
      typeof session.accessToken !== "string" ||
      session.accessToken === "" ||
      session.admin === undefined
    )
      return null;
    return session as AdminSession;
  } catch {
    return null;
  }
}

export function saveAdminSession(session: AdminSession): void {
  getStorage()?.setItem(storageKey, JSON.stringify(session));
}

export function clearAdminSession(): void {
  getStorage()?.removeItem(storageKey);
}
