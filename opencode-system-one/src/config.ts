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
