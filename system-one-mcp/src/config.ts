export interface SystemOneMcpEnv {
  SYSTEM_ONE_BASE_URL?: string;
  SYSTEM_ONE_API_KEY?: string;
  SYSTEM_ONE_MODEL?: string;
  SYSTEM_ONE_TIMEOUT_MS?: string;
}

export interface SystemOneMcpConfig {
  baseUrl: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
}

export const DEFAULT_TIMEOUT_MS = 10_000;

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function validateBaseUrl(value: string, apiKey?: string): string {
  if (!value || /[\s\\]/.test(value))
    throw new Error(
      "SYSTEM_ONE_BASE_URL must not contain whitespace or backslashes",
    );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SYSTEM_ONE_BASE_URL must be a valid HTTP or HTTPS URL");
  }
  if (!(url.protocol === "http:" || url.protocol === "https:") || !url.hostname)
    throw new Error("SYSTEM_ONE_BASE_URL must use HTTP or HTTPS with a host");
  if (url.username || url.password || url.search || url.hash)
    throw new Error(
      "SYSTEM_ONE_BASE_URL must not contain credentials, query, or fragment",
    );
  if (apiKey && url.protocol !== "https:" && !isLoopback(url.hostname))
    throw new Error(
      "SYSTEM_ONE_API_KEY requires HTTPS except for loopback endpoints",
    );
  return value.replace(/\/$/, "");
}

export function loadSystemOneConfig(
  env: SystemOneMcpEnv = process.env,
): SystemOneMcpConfig {
  const apiKey = env.SYSTEM_ONE_API_KEY || undefined;
  if (!env.SYSTEM_ONE_BASE_URL)
    throw new Error("SYSTEM_ONE_BASE_URL is required");
  const timeoutMs = env.SYSTEM_ONE_TIMEOUT_MS
    ? Number(env.SYSTEM_ONE_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error("SYSTEM_ONE_TIMEOUT_MS must be a positive number");
  return {
    baseUrl: validateBaseUrl(env.SYSTEM_ONE_BASE_URL, apiKey),
    apiKey,
    model: env.SYSTEM_ONE_MODEL || undefined,
    timeoutMs,
  };
}
