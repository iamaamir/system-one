// pi-system-one/tests/config.test.ts

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyConfigAnswers,
  createSessionConfig,
  describeConfig,
  loadSystemOneConfig,
} from "../src/config.ts";

describe("config", () => {
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
  it("legacy env bootstrap still validates", () => {
    assert.throws(() => loadSystemOneConfig({}), /SYSTEM_ONE_BASE_URL/);
  });
});
