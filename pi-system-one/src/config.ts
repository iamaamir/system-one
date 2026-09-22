// biome-ignore-all lint/suspicious/noExplicitAny: intentional dynamic boundary over JSON protocol values
// pi-system-one/src/config.ts
//
// Profiles live in JSON. API keys never do: keys always come from the
// environment, named per profile by `apiKeyEnv` (default SYSTEM_ONE_API_KEY).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface SystemOneEnv {
  SYSTEM_ONE_BASE_URL?: string;
  SYSTEM_ONE_API_KEY?: string;
  SYSTEM_ONE_MODEL?: string;
  SYSTEM_ONE_TIMEOUT_MS?: string;
  [name: string]: string | undefined;
}

export interface SystemOneProfile {
  baseUrl: string;
  model?: string;
  timeoutMs: number;
  /** Name of the env var holding this profile's API key. Absent = keyless. */
  apiKeyEnv?: string;
}

export interface SystemOneConfigFile {
  active: string;
  profiles: Record<string, SystemOneProfile>;
}

export interface SystemOneExtConfig {
  baseUrl: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
}

export const DEFAULT_API_KEY_ENV = "SYSTEM_ONE_API_KEY";
export const DEFAULT_TIMEOUT_MS = 10_000;

export const DEFAULT_PROFILES: Record<string, SystemOneProfile> = {
  reflex: { baseUrl: "http://localhost:8008", timeoutMs: DEFAULT_TIMEOUT_MS },
  jev: {
    baseUrl: "https://api.typesafe.ai",
    model: "jev-latest",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    apiKeyEnv: DEFAULT_API_KEY_ENV,
  },
};

const CONFIG_PATH = join(homedir(), ".pi", "agent", "system-one.json");

export function loadConfigFile(): SystemOneConfigFile {
  if (!existsSync(CONFIG_PATH)) {
    return { active: "", profiles: {} };
  }
  try {
    const raw = JSON.parse(
      readFileSync(CONFIG_PATH, "utf-8"),
    ) as SystemOneConfigFile & {
      profiles: Record<string, SystemOneProfile & { apiKey?: unknown }>;
    };
    if (!raw.profiles || typeof raw.profiles !== "object")
      throw new Error("Invalid config file");
    for (const [name, p] of Object.entries(raw.profiles)) {
      if (p && typeof p === "object" && "apiKey" in p) {
        console.warn(
          `System One: profile "${name}" has a stored apiKey, which is no longer read. ` +
            `Move it to the ${p.apiKeyEnv ?? DEFAULT_API_KEY_ENV} environment variable.`,
        );
        delete p.apiKey;
      }
    }
    return { active: raw.active ?? "", profiles: raw.profiles };
  } catch {
    throw new Error(`Failed to parse ${CONFIG_PATH}`);
  }
}

export function saveConfigFile(cfg: SystemOneConfigFile): void {
  mkdirSync(join(homedir(), ".pi", "agent"), { recursive: true });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(cfg, null, 2)}\n`, {
    mode: 0o600,
  });
}

/** Add shipped defaults without touching user profiles. Returns active name. */
export function seedDefaults(
  cfg: SystemOneConfigFile,
  env: SystemOneEnv = process.env,
): string {
  for (const [name, p] of Object.entries(DEFAULT_PROFILES)) {
    cfg.profiles[name] ??= { ...p };
  }
  if (!cfg.active || !cfg.profiles[cfg.active]) {
    cfg.active = env[DEFAULT_API_KEY_ENV] ? "jev" : "reflex";
  }
  return cfg.active;
}

/** Resolve the API key for a profile. Never returns a stored value. */
export function resolveApiKey(
  profile: SystemOneProfile,
  env: SystemOneEnv = process.env,
): string | undefined {
  if (!profile.apiKeyEnv) return undefined;
  return env[profile.apiKeyEnv] || undefined;
}

export function resolveExtConfig(
  profile: SystemOneProfile,
  env: SystemOneEnv = process.env,
): SystemOneExtConfig {
  return {
    baseUrl: profile.baseUrl,
    apiKey: resolveApiKey(profile, env),
    model: profile.model || undefined,
    timeoutMs: profile.timeoutMs || DEFAULT_TIMEOUT_MS,
  };
}

export function getActiveProfile(
  cfg: SystemOneConfigFile,
): SystemOneProfile | undefined {
  if (!cfg.active) return undefined;
  return cfg.profiles[cfg.active];
}

/** Human-readable profile summary. Shows the env var name, never any key. */
export function describeProfile(
  name: string,
  p: SystemOneProfile,
  isActive: boolean,
  env: SystemOneEnv = process.env,
): string {
  const marker = isActive ? " *" : "";
  const keyLine = p.apiKeyEnv
    ? `  key: env ${p.apiKeyEnv} (${env[p.apiKeyEnv] ? "set" : "missing"})`
    : "  key: none required";
  return [
    `${name}${marker}`,
    `  endpoint: ${p.baseUrl}`,
    keyLine,
    `  model: ${p.model ?? "server default"}`,
    `  timeout: ${p.timeoutMs}ms`,
  ].join("\n");
}

// Legacy env-only bootstrap (kept for tests / one-shot tooling).
export function loadSystemOneConfig(
  env: SystemOneEnv = process.env,
): SystemOneExtConfig {
  const baseUrl = env.SYSTEM_ONE_BASE_URL;
  if (!baseUrl)
    throw new Error(
      "SYSTEM_ONE_BASE_URL is required (e.g. http://localhost:8008 or https://api.typesafe.ai)",
    );
  const timeoutMs = env.SYSTEM_ONE_TIMEOUT_MS
    ? Number(env.SYSTEM_ONE_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error("SYSTEM_ONE_TIMEOUT_MS must be a positive number");
  return {
    baseUrl,
    apiKey: env.SYSTEM_ONE_API_KEY || undefined,
    model: env.SYSTEM_ONE_MODEL || undefined,
    timeoutMs,
  };
}
