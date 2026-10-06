// pi-system-one/tests/config.test.ts

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyConfigAnswers,
  blankSession,
  createSessionConfig,
  describeConfig,
  loadSystemOneConfig,
} from "../src/config.ts";

describe("config", () => {
  it("native mode ignores HTTP environment key and model", () => {
    const s = createSessionConfig(
      { SYSTEM_ONE_API_KEY: "test-env-key", SYSTEM_ONE_MODEL: "other-model" },
      { mode: "native", model: "stored-model", baseUrl: "http://stale/" },
    );
    assert.equal(s.mode, "native");
    assert.equal(s.current.baseUrl, "");
    assert.equal(s.current.apiKey, undefined);
    assert.equal(s.current.model, "jev-latest");
    assert.match(describeConfig(s), /api key: managed by Pi/);
  });
  it("status identifies saved native mode and ignored endpoint without exposing keys", () => {
    const s = createSessionConfig(
      {
        SYSTEM_ONE_BASE_URL: "https://custom.example",
        SYSTEM_ONE_API_KEY: "secret",
      },
      { mode: "native" },
    );
    const status = describeConfig(s);
    assert.match(status, /mode: native \(saved\)/);
    assert.match(status, /environment endpoint ignored/i);
    assert.doesNotMatch(status, /custom.example|secret/);
  });
  it("status explains auto policy rather than claiming a fixed provider", () => {
    const s = createSessionConfig({}, { mode: "auto" });
    assert.match(describeConfig(s), /mode: auto \(saved\)/);
    assert.match(describeConfig(s), /per request/i);
    assert.match(
      describeConfig(s),
      /HTTP fallback endpoint: https:\/\/api\.typesafe\.ai/,
    );
  });
  it("defaults to TypeSafe Jev without environment configuration", () => {
    const s = createSessionConfig({});
    assert.equal(s.mode, "typesafe");
    assert.equal(s.current.baseUrl, "https://api.typesafe.ai");
    assert.equal(s.current.model, "jev-latest");
    assert.equal(s.current.apiKey, undefined);
  });
  it("keeps a TypeSafe environment model bound to the canonical endpoint", () => {
    for (const stored of [{}, { mode: "typesafe" as const }]) {
      const s = createSessionConfig(
        { SYSTEM_ONE_MODEL: "jev-custom", SYSTEM_ONE_API_KEY: "typesafe-key" },
        stored,
      );
      assert.equal(s.mode, "typesafe");
      assert.equal(s.current.model, "jev-custom");
      assert.equal(s.current.apiKey, "typesafe-key");
    }
  });
  it("keeps saved native mode despite inherited HTTP environment", () => {
    const s = createSessionConfig(
      { SYSTEM_ONE_BASE_URL: "http://existing/", SYSTEM_ONE_MODEL: "old" },
      { mode: "native", model: "new", timeoutMs: 5000 },
    );
    assert.equal(s.mode, "native");
    assert.equal(s.current.baseUrl, "");
    assert.equal(s.current.model, "jev-latest");
    assert.equal(s.current.timeoutMs, 5000);
  });
  it("saved TypeSafe and auto ignore custom endpoint keys and models", () => {
    for (const mode of ["typesafe", "auto"] as const) {
      const s = createSessionConfig(
        {
          SYSTEM_ONE_BASE_URL: "http://custom/",
          SYSTEM_ONE_API_KEY: "custom-secret",
          SYSTEM_ONE_MODEL: "custom-model",
        },
        { mode },
      );
      assert.equal(s.mode, mode);
      assert.equal(s.current.baseUrl, "https://api.typesafe.ai");
      assert.equal(s.current.model, "jev-latest");
      assert.equal(s.current.apiKey, undefined);
      assert.equal(s.ignoredEnvironmentEndpoint, true);
    }
  });
  it("keeps saved custom endpoint and model, not unrelated environment credentials", () => {
    const s = createSessionConfig(
      {
        SYSTEM_ONE_BASE_URL: "http://new/",
        SYSTEM_ONE_MODEL: "new-model",
        SYSTEM_ONE_API_KEY: "key-for-new",
      },
      { mode: "custom", baseUrl: "http://old/", model: "old-model" },
    );
    assert.equal(s.mode, "custom");
    assert.equal(s.current.baseUrl, "http://old/");
    assert.equal(s.current.model, "old-model");
    assert.equal(s.current.apiKey, undefined);
  });
  it("keeps saved model when environment endpoint matches saved endpoint", () => {
    const s = createSessionConfig(
      { SYSTEM_ONE_BASE_URL: "http://same/" },
      { mode: "custom", baseUrl: "http://same/", model: "saved-model" },
    );
    assert.equal(s.current.model, "saved-model");
  });
  it("does not forward an env key to a saved custom URL without an env endpoint", () => {
    const s = createSessionConfig(
      { SYSTEM_ONE_API_KEY: "key-for-other-endpoint" },
      { mode: "custom", baseUrl: "https://other.example" },
    );
    assert.equal(s.current.apiKey, undefined);
  });
  it("loads saved custom config without an environment variable", () => {
    const s = createSessionConfig(
      {},
      { mode: "custom", baseUrl: "http://localhost:8008", model: "reflex" },
    );
    assert.equal(s.mode, "custom");
    assert.equal(s.current.model, "reflex");
    assert.equal(s.current.baseUrl, "http://localhost:8008");
  });
  it("loads from env", () => {
    const s = createSessionConfig({
      SYSTEM_ONE_BASE_URL: "http://localhost:8008",
    });
    assert.equal(s.current.baseUrl, "http://localhost:8008");
    assert.equal(s.current.timeoutMs, 10_000);
    assert.equal(s.keyInMemory, false);
  });
  it("overrides apply in memory, empty keeps", () => {
    const s = createSessionConfig({
      SYSTEM_ONE_BASE_URL: "http://a/",
      SYSTEM_ONE_MODEL: "m1",
    });
    applyConfigAnswers(s, {
      baseUrl: "http://b/",
      model: "",
      apiKey: "",
      timeoutMs: "",
    });
    assert.equal(s.current.baseUrl, "http://b/");
    assert.equal(s.current.model, "m1");
    assert.equal(s.keyInMemory, false);
  });
  it("typed key is memory-only and reported, never shown", () => {
    const s = createSessionConfig({ SYSTEM_ONE_BASE_URL: "http://a/" });
    const memory = applyConfigAnswers(s, {
      baseUrl: "",
      model: "",
      apiKey: "sk-typed",
      timeoutMs: "",
    });
    assert.equal(memory, true);
    assert.equal(s.keyInMemory, true);
    const shown = describeConfig(s);
    assert.doesNotMatch(shown, /sk-typed/);
    assert.match(shown, /in memory only/);
  });
  it("env key is reported as from environment", () => {
    const s = createSessionConfig({
      SYSTEM_ONE_BASE_URL: "http://a/",
      SYSTEM_ONE_API_KEY: "sk-env",
    });
    const shown = describeConfig(s);
    assert.doesNotMatch(shown, /sk-env/);
    assert.match(shown, /from environment/);
  });
  it("absent key is reported", () => {
    const s = createSessionConfig({ SYSTEM_ONE_BASE_URL: "http://a/" });
    assert.match(describeConfig(s), /absent/);
  });
  it("'-' forgets a memory key back to env", () => {
    const s = createSessionConfig({
      SYSTEM_ONE_BASE_URL: "http://a/",
      SYSTEM_ONE_API_KEY: "sk-env",
    });
    applyConfigAnswers(s, {
      baseUrl: "",
      model: "",
      apiKey: "sk-mem",
      timeoutMs: "",
    });
    assert.equal(s.keyInMemory, true);
    applyConfigAnswers(
      s,
      { baseUrl: "", model: "", apiKey: "-", timeoutMs: "" },
      {},
    );
    assert.equal(s.keyInMemory, false);
    assert.equal(s.current.apiKey, undefined);
  });
  it("legacy env bootstrap still validates", () => {
    assert.throws(() => loadSystemOneConfig({}), /SYSTEM_ONE_BASE_URL/);
    assert.throws(
      () =>
        loadSystemOneConfig({
          SYSTEM_ONE_BASE_URL: "http://a/",
          SYSTEM_ONE_TIMEOUT_MS: "nope",
        }),
      /positive number/,
    );
  });
  it("blankSession starts empty with defaults", () => {
    const s = blankSession();
    assert.equal(s.current.baseUrl, "");
    assert.equal(s.current.timeoutMs, 10_000);
    assert.equal(s.keyInMemory, false);
  });
  it("timeout answers apply only when valid", () => {
    const s = createSessionConfig({ SYSTEM_ONE_BASE_URL: "http://a/" });
    applyConfigAnswers(s, {
      baseUrl: "",
      model: "",
      apiKey: "",
      timeoutMs: "5000",
    });
    assert.equal(s.current.timeoutMs, 5000);
    applyConfigAnswers(s, {
      baseUrl: "",
      model: "",
      apiKey: "",
      timeoutMs: "0",
    });
    assert.equal(s.current.timeoutMs, 5000);
    applyConfigAnswers(s, {
      baseUrl: "",
      model: "",
      apiKey: "",
      timeoutMs: "junk",
    });
    assert.equal(s.current.timeoutMs, 5000);
  });
  it("describeConfig shows endpoint, model, and timeout lines", () => {
    const shown = describeConfig(
      createSessionConfig({
        SYSTEM_ONE_BASE_URL: "http://a/",
        SYSTEM_ONE_MODEL: "m1",
      }),
    );
    assert.match(shown, /endpoint: http:\/\/a\//);
    assert.match(shown, /model: m1/);
    assert.match(shown, /timeout: 10000ms/);
  });
});
