// pi-system-one/src/config.ts
export interface SystemOneEnv {
  SYSTEM_ONE_BASE_URL?: string;
  SYSTEM_ONE_API_KEY?: string;
  SYSTEM_ONE_MODEL?: string;
  SYSTEM_ONE_TIMEOUT_MS?: string;
}
export interface SystemOneExtConfig {
  baseUrl: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
}
export function loadSystemOneConfig(env: SystemOneEnv = process.env): SystemOneExtConfig {
  const baseUrl = env.SYSTEM_ONE_BASE_URL;
  if (!baseUrl) throw new Error("SYSTEM_ONE_BASE_URL is required (e.g. http://localhost:8008 or https://api.typesafe.ai)");
  const timeoutMs = env.SYSTEM_ONE_TIMEOUT_MS ? Number(env.SYSTEM_ONE_TIMEOUT_MS) : 10_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("SYSTEM_ONE_TIMEOUT_MS must be a positive number");
  return { baseUrl, apiKey: env.SYSTEM_ONE_API_KEY || undefined, model: env.SYSTEM_ONE_MODEL || undefined, timeoutMs };
}
export function describeConfig(cfg: SystemOneExtConfig): string {
  return [`Provider endpoint: ${cfg.baseUrl}`, `API key: ${cfg.apiKey ? "configured" : "absent"}`, `Model: ${cfg.model ?? "server default"}`, `Timeout: ${cfg.timeoutMs}ms`].join("\n");
}
