import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { ConfigMode, StoredConfig } from "./config.ts";

const MODES: ConfigMode[] = ["typesafe", "custom", "native"];

function validate(value: unknown, path: string): StoredConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`Invalid System One settings in ${path}: expected object`);
  const v = value as Record<string, unknown>;
  if (Object.hasOwn(v, "apiKey") || Object.hasOwn(v, "key"))
    throw new Error(
      `Invalid System One settings in ${path}: apiKey must stay in Pi credentials or environment`,
    );
  for (const key of Object.keys(v)) {
    if (!["mode", "baseUrl", "model", "timeoutMs"].includes(key))
      throw new Error(
        `Invalid System One settings in ${path}: unknown field ${key}`,
      );
  }
  if (v.mode !== undefined && !MODES.includes(v.mode as ConfigMode))
    throw new Error(
      `Invalid System One settings in ${path}: mode must be typesafe, custom, or native`,
    );
  if (
    v.baseUrl !== undefined &&
    (typeof v.baseUrl !== "string" || !v.baseUrl.trim())
  )
    throw new Error(
      `Invalid System One settings in ${path}: baseUrl must be a nonempty string`,
    );
  if (typeof v.baseUrl === "string") {
    let url: URL;
    try {
      url = new URL(v.baseUrl);
    } catch {
      throw new Error(
        `Invalid System One settings in ${path}: baseUrl must be an HTTP(S) URL`,
      );
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error(
        `Invalid System One settings in ${path}: baseUrl must be an HTTP(S) URL without credentials, query, or fragment`,
      );
  }
  if (v.model !== undefined && (typeof v.model !== "string" || !v.model.trim()))
    throw new Error(
      `Invalid System One settings in ${path}: model must be a nonempty string`,
    );
  if (
    v.timeoutMs !== undefined &&
    (typeof v.timeoutMs !== "number" ||
      !Number.isFinite(v.timeoutMs) ||
      v.timeoutMs <= 0)
  )
    throw new Error(
      `Invalid System One settings in ${path}: timeoutMs must be positive`,
    );
  if (v.mode === "custom" && !v.baseUrl)
    throw new Error(
      `Invalid System One settings in ${path}: custom mode needs baseUrl`,
    );
  return v as StoredConfig;
}

export function loadStoredConfig(path: string): StoredConfig {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${path}`);
  }
  return validate(parsed, path);
}

export function saveStoredConfig(path: string, config: StoredConfig): void {
  const safe = validate(config, path);
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(safe, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temp, path);
  } catch (error) {
    try {
      unlinkSync(temp);
    } catch {
      /* no temporary file */
    }
    throw error;
  }
}
