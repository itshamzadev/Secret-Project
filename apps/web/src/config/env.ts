const productionApiUrl =
  "http://bm9hlviambinfsghqtkofvh9.217.216.108.40.sslip.io/api/v1";
const productionSocketUrl =
  "http://bm9hlviambinfsghqtkofvh9.217.216.108.40.sslip.io";

function requiredUrl(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;
  new URL(candidate);
  return candidate.replace(/\/$/, "");
}

export const webEnv = {
  apiUrl: requiredUrl(import.meta.env.VITE_API_BASE_URL, productionApiUrl),
  socketUrl: requiredUrl(import.meta.env.VITE_SOCKET_URL, productionSocketUrl),
};
