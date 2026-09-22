// pi-system-one/tests/config.test.ts

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeConfig, loadSystemOneConfig } from "../src/config.ts";

describe("config", () => {
  it("loads from env with localhost default", () => {
    const cfg = loadSystemOneConfig({
      SYSTEM_ONE_BASE_URL: "http://localhost:8008",
    });
    assert.equal(cfg.baseUrl, "http://localhost:8008");
    assert.equal(cfg.timeoutMs, 10_000);
  });
  it("never exposes the key", () => {
    const shown = describeConfig(
      loadSystemOneConfig({
        SYSTEM_ONE_BASE_URL: "https://api.typesafe.ai",
        SYSTEM_ONE_API_KEY: "sk-live-123",
      }),
    );
    assert.doesNotMatch(shown, /sk-live-123/);
    assert.match(shown, /configured/);
  });
  it("rejects missing baseUrl", () => {
    assert.throws(() => loadSystemOneConfig({}), /SYSTEM_ONE_BASE_URL/);
  });
});
