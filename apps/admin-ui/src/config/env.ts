function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured !== undefined && configured !== "") {
    return trimTrailingSlash(configured);
  }

  if (typeof window !== "undefined" && window.location.origin !== "null") {
    return `${window.location.origin}/api/v1`;
  }

  return "/api/v1";
}

export const adminEnv = {
  apiBaseUrl: resolveApiBaseUrl(),
} as const;
