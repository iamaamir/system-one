export interface SystemOneEnv {
  SYSTEM_ONE_BASE_URL?: string;
  SYSTEM_ONE_API_KEY?: string;
  SYSTEM_ONE_MODEL?: string;
  SYSTEM_ONE_TIMEOUT_MS?: string;
}

export interface SystemOneConfig {
  baseUrl: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
}

export const DEFAULT_TIMEOUT_MS = 10_000;

export function loadSystemOneConfig(
  env: SystemOneEnv = process.env,
): SystemOneConfig {
  const baseUrl = env.SYSTEM_ONE_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error(
      "SYSTEM_ONE_BASE_URL is required (e.g. http://localhost:8008 or https://api.typesafe.ai)",
    );
  }

  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new Error("SYSTEM_ONE_BASE_URL must be a valid http(s) URL");
  }
  if (
    (parsedBaseUrl.protocol !== "http:" &&
      parsedBaseUrl.protocol !== "https:") ||
    !parsedBaseUrl.hostname
  ) {
    throw new Error("SYSTEM_ONE_BASE_URL must be a valid http(s) URL");
  }
  if (
    parsedBaseUrl.username ||
    parsedBaseUrl.password ||
    parsedBaseUrl.search ||
    parsedBaseUrl.hash
  ) {
    throw new Error(
      "SYSTEM_ONE_BASE_URL must not include credentials, query strings, or fragments",
    );
  }

  const timeoutMs =
    env.SYSTEM_ONE_TIMEOUT_MS === undefined
      ? DEFAULT_TIMEOUT_MS
      : Number(env.SYSTEM_ONE_TIMEOUT_MS);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("SYSTEM_ONE_TIMEOUT_MS must be a positive number");
  }

  return {
    baseUrl,
    apiKey: env.SYSTEM_ONE_API_KEY?.trim() || undefined,
    model: env.SYSTEM_ONE_MODEL?.trim() || undefined,
    timeoutMs,
  };
}
