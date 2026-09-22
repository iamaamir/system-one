// pi-system-one/src/config.ts
//
// Configuration is environment variables. `/so config` applies overrides
// in memory for the current session only. API keys are never written to
// disk by this extension: a key typed into `/so config` lives in memory
// and is gone when the session closes. To persist, export it
// (e.g. SYSTEM_ONE_API_KEY) in the shell.

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

export const DEFAULT_TIMEOUT_MS = 10_000;

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

export interface SessionConfig {
  /** Current effective config (env + in-memory overrides). */
  current: SystemOneExtConfig;
  /** True when the key came from `/so config` (memory-only). */
  keyInMemory: boolean;
}

export function createSessionConfig(
  env: SystemOneEnv = process.env,
): SessionConfig {
  return { current: loadSystemOneConfig(env), keyInMemory: false };
}

/** Empty session for `/so config` when no env is present. */
export function blankSession(): SessionConfig {
  return {
    current: {
      baseUrl: "",
      apiKey: undefined,
      model: undefined,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    keyInMemory: false,
  };
}

export interface ConfigAnswers {
  /** Empty string keeps the existing value. */
  baseUrl: string;
  model: string;
  /** Empty string keeps the existing key. Provided keys are memory-only. */
  apiKey: string;
  timeoutMs: string;
}

/** Apply `/so config` answers. Returns true when a memory-only key was set. */
export function applyConfigAnswers(
  session: SessionConfig,
  answers: ConfigAnswers,
  env: SystemOneEnv = process.env,
): boolean {
  if (answers.baseUrl) session.current.baseUrl = answers.baseUrl;
  if (answers.model) session.current.model = answers.model;
  const timeoutMs = Number(answers.timeoutMs);
  if (answers.timeoutMs && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    session.current.timeoutMs = timeoutMs;
  }
  if (answers.apiKey === "-") {
    session.current.apiKey = env.SYSTEM_ONE_API_KEY || undefined;
    session.keyInMemory = false;
    return false;
  }
  if (answers.apiKey) {
    session.current.apiKey = answers.apiKey;
    session.keyInMemory = true;
    return true;
  }
  return false;
}

/** Human-readable summary. Shows whether a key exists, never the key. */
export function describeConfig(session: SessionConfig): string {
  const c = session.current;
  const keyLine = !c.apiKey
    ? "  api key: absent"
    : session.keyInMemory
      ? "  api key: in memory only (gone when the session closes; export SYSTEM_ONE_API_KEY to persist)"
      : "  api key: from environment";
  return [
    "System One:",
    `  endpoint: ${c.baseUrl}`,
    keyLine,
    `  model: ${c.model ?? "server default"}`,
    `  timeout: ${c.timeoutMs}ms`,
  ].join("\n");
}
