import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TIMEOUT_MS, loadSystemOneConfig } from "../src/config.ts";

describe("System One configuration", () => {
  it("loads the existing environment variables", () => {
    const config = loadSystemOneConfig({
      SYSTEM_ONE_BASE_URL: "http://localhost:8008",
      SYSTEM_ONE_API_KEY: "secret-value",
      SYSTEM_ONE_MODEL: "test-model",
      SYSTEM_ONE_TIMEOUT_MS: "2500",
    });

    assert.deepEqual(config, {
      baseUrl: "http://localhost:8008",
      apiKey: "secret-value",
      model: "test-model",
      timeoutMs: 2500,
    });
  });

  it("uses the default timeout when no timeout is provided", () => {
    const config = loadSystemOneConfig({
      SYSTEM_ONE_BASE_URL: "https://api.typesafe.ai",
    });

    assert.equal(config.timeoutMs, DEFAULT_TIMEOUT_MS);
  });

  it("requires a base URL", () => {
    assert.throws(
      () => loadSystemOneConfig({}),
      /SYSTEM_ONE_BASE_URL is required/,
    );
  });

  it("rejects a non-positive or non-numeric timeout", () => {
    for (const timeout of ["", "0", "-1", "not-a-number", "Infinity"]) {
      assert.throws(
        () =>
          loadSystemOneConfig({
            SYSTEM_ONE_BASE_URL: "http://localhost:8008",
            SYSTEM_ONE_TIMEOUT_MS: timeout,
          }),
        /SYSTEM_ONE_TIMEOUT_MS must be a positive number/,
      );
    }
  });

  it("does not include the API key in configuration errors", () => {
    const secret = "super-secret-key";
    assert.throws(
      () =>
        loadSystemOneConfig({
          SYSTEM_ONE_BASE_URL: "http://localhost:8008",
          SYSTEM_ONE_API_KEY: secret,
          SYSTEM_ONE_TIMEOUT_MS: "invalid",
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.doesNotMatch(error.message, new RegExp(secret));
        assert.match(error.message, /SYSTEM_ONE_TIMEOUT_MS/);
        return true;
      },
    );
  });
});
