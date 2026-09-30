import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  loadSystemOneConfig,
  MAX_TIMEOUT_MS,
  validateBaseUrl,
} from "../src/config.ts";

describe("mcp config", () => {
  it("loads and validates environment configuration", () => {
    assert.deepEqual(
      loadSystemOneConfig({ SYSTEM_ONE_BASE_URL: "http://localhost:8008/" }),
      {
        baseUrl: "http://localhost:8008",
        apiKey: undefined,
        model: undefined,
        timeoutMs: 10_000,
      },
    );
  });
  it("rejects remote HTTP with or without an API key", () => {
    assert.throws(
      () => validateBaseUrl("http://example.test"),
      /HTTPS for non-loopback/,
    );
    assert.throws(
      () =>
        loadSystemOneConfig({
          SYSTEM_ONE_BASE_URL: "http://example.test",
          SYSTEM_ONE_API_KEY: "secret",
        }),
      /HTTPS for non-loopback/,
    );
  });

  it("allows HTTPS and loopback HTTP", () => {
    assert.equal(
      validateBaseUrl("https://example.test/"),
      "https://example.test",
    );
    assert.equal(
      validateBaseUrl("http://localhost:8008/"),
      "http://localhost:8008",
    );
    assert.equal(
      validateBaseUrl("http://127.0.0.1:8008"),
      "http://127.0.0.1:8008",
    );
    assert.equal(validateBaseUrl("http://[::1]:8008"), "http://[::1]:8008");
  });

  it("rejects unsafe URL parts", () => {
    assert.throws(
      () => validateBaseUrl("https://user:pass@example.test"),
      /credentials/,
    );
    assert.throws(() => validateBaseUrl("https://example.test/?q=1"), /query/);
    assert.throws(
      () => validateBaseUrl("https://example.test/a b"),
      /whitespace/,
    );
  });

  it("requires a positive safe integer timeout within the maximum", () => {
    for (const value of ["0", "-1", "1.5", "not-a-number", "Infinity"]) {
      assert.throws(
        () =>
          loadSystemOneConfig({
            SYSTEM_ONE_BASE_URL: "https://example.test",
            SYSTEM_ONE_TIMEOUT_MS: value,
          }),
        /positive safe integer/,
      );
    }
    assert.equal(
      loadSystemOneConfig({
        SYSTEM_ONE_BASE_URL: "https://example.test",
        SYSTEM_ONE_TIMEOUT_MS: String(MAX_TIMEOUT_MS),
      }).timeoutMs,
      MAX_TIMEOUT_MS,
    );
    assert.throws(
      () =>
        loadSystemOneConfig({
          SYSTEM_ONE_BASE_URL: "https://example.test",
          SYSTEM_ONE_TIMEOUT_MS: String(MAX_TIMEOUT_MS + 1),
        }),
      /at most/,
    );
  });
});
