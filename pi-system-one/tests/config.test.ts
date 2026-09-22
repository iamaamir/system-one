// pi-system-one/tests/config.test.ts

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_API_KEY_ENV,
  DEFAULT_PROFILES,
  describeProfile,
  loadSystemOneConfig,
  resolveApiKey,
  resolveExtConfig,
  type SystemOneConfigFile,
  seedDefaults,
} from "../src/config.ts";

describe("config", () => {
  it("ships reflex + jev defaults", () => {
    assert.equal(DEFAULT_PROFILES.reflex.baseUrl, "http://localhost:8008");
    assert.equal(DEFAULT_PROFILES.reflex.apiKeyEnv, undefined);
    assert.equal(DEFAULT_PROFILES.jev.baseUrl, "https://api.typesafe.ai");
    assert.equal(DEFAULT_PROFILES.jev.apiKeyEnv, DEFAULT_API_KEY_ENV);
  });
  it("seeds defaults without touching user profiles", () => {
    const cfg: SystemOneConfigFile = {
      active: "mine",
      profiles: {
        mine: { baseUrl: "http://x/", timeoutMs: 1000 },
      },
    };
    assert.equal(seedDefaults(cfg, {}), "mine");
    assert.ok(cfg.profiles.reflex);
    assert.ok(cfg.profiles.jev);
    assert.equal(cfg.profiles.mine.baseUrl, "http://x/");
  });
  it("picks jev when a key is in env, reflex otherwise", () => {
    const withKey: SystemOneConfigFile = { active: "", profiles: {} };
    assert.equal(
      seedDefaults(withKey, { [DEFAULT_API_KEY_ENV]: "sk-x" }),
      "jev",
    );
    const bare: SystemOneConfigFile = { active: "", profiles: {} };
    assert.equal(seedDefaults(bare, {}), "reflex");
  });
  it("resolves keys from env only, never storage", () => {
    assert.equal(
      resolveApiKey(
        { baseUrl: "http://x/", timeoutMs: 1000 },
        { SYSTEM_ONE_API_KEY: "sk-x" },
      ),
      undefined,
    );
    assert.equal(
      resolveApiKey(
        { baseUrl: "http://x/", timeoutMs: 1000, apiKeyEnv: "MY_KEY" },
        { MY_KEY: "sk-y" },
      ),
      "sk-y",
    );
    assert.equal(
      resolveApiKey(
        { baseUrl: "http://x/", timeoutMs: 1000, apiKeyEnv: "MISSING" },
        {},
      ),
      undefined,
    );
  });
  it("never exposes key material in descriptions", () => {
    const shown = describeProfile(
      "jev",
      {
        baseUrl: "https://api.typesafe.ai",
        timeoutMs: 1000,
        apiKeyEnv: "MY_KEY",
      },
      true,
      { MY_KEY: "sk-live-123" },
    );
    assert.doesNotMatch(shown, /sk-live-123/);
    assert.match(shown, /env MY_KEY \(set\)/);
    const missing = describeProfile(
      "jev",
      {
        baseUrl: "https://api.typesafe.ai",
        timeoutMs: 1000,
        apiKeyEnv: "MY_KEY",
      },
      true,
      {},
    );
    assert.match(missing, /missing/);
  });
  it("legacy env bootstrap still works", () => {
    const cfg = loadSystemOneConfig({
      SYSTEM_ONE_BASE_URL: "http://localhost:8008",
    });
    assert.equal(cfg.baseUrl, "http://localhost:8008");
    assert.equal(cfg.timeoutMs, 10_000);
    assert.throws(() => loadSystemOneConfig({}), /SYSTEM_ONE_BASE_URL/);
  });
  it("resolveExtConfig threads the resolved key", () => {
    const ext = resolveExtConfig(
      { baseUrl: "http://x/", timeoutMs: 1000, apiKeyEnv: "K" },
      { K: "sk-z" },
    );
    assert.equal(ext.apiKey, "sk-z");
  });
});
