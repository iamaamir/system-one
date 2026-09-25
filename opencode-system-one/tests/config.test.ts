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

  it("accepts trimmed absolute HTTP and HTTPS base URLs", () => {
    for (const baseUrl of [
      " http://localhost:8008 ",
      " https://api.typesafe.ai/v1 ",
    ]) {
      const config = loadSystemOneConfig({ SYSTEM_ONE_BASE_URL: baseUrl });

      assert.equal(config.baseUrl, baseUrl.trim());
    }
  });

  it("uses the default timeout when no timeout is provided", () => {
    const config = loadSystemOneConfig({
      SYSTEM_ONE_BASE_URL: "https://api.typesafe.ai",
    });

    assert.equal(config.timeoutMs, DEFAULT_TIMEOUT_MS);
  });

  it("rejects base URLs with credentials, query strings, or fragments", () => {
    for (const baseUrl of [
      "https://user:pass@example.com",
      "https://example.com?token=secret",
      "https://example.com#fragment",
      "https://example.com?",
      "https://example.com#",
      "https://example.com?#",
    ]) {
      assert.throws(
        () => loadSystemOneConfig({ SYSTEM_ONE_BASE_URL: baseUrl }),
        /SYSTEM_ONE_BASE_URL must not include credentials, query strings, or fragments/,
      );
    }
  });

  it("rejects base URLs with empty userinfo markers", () => {
    for (const baseUrl of ["https://@example.com", "https://:@example.com"]) {
      assert.throws(
        () => loadSystemOneConfig({ SYSTEM_ONE_BASE_URL: baseUrl }),
        /SYSTEM_ONE_BASE_URL must not include credentials, query strings, or fragments/,
      );
    }
  });

  it("accepts a path-prefixed base URL", () => {
    for (const baseUrl of [
      "https://example.com/systemone",
      "https://example.com/systemone@branch",
    ]) {
      const config = loadSystemOneConfig({ SYSTEM_ONE_BASE_URL: baseUrl });

      assert.equal(config.baseUrl, baseUrl);
    }
  });

  it("requires a base URL", () => {
    assert.throws(
      () => loadSystemOneConfig({}),
      /SYSTEM_ONE_BASE_URL is required/,
    );
  });

  it("rejects malformed, unsupported-protocol, and missing-protocol base URLs", () => {
    for (const baseUrl of [
      "not-a-url",
      "ftp://example.com",
      "http://",
      "api.typesafe.ai",
    ]) {
      assert.throws(
        () => loadSystemOneConfig({ SYSTEM_ONE_BASE_URL: baseUrl }),
        /SYSTEM_ONE_BASE_URL must be a valid http\(s\) URL/,
      );
    }
  });

  it("does not include secrets or the malformed base URL in configuration errors", () => {
    const apiKey = "super-secret-key";
    const malformedBaseUrl = "not-a-url?token=secret-bearing-value";

    assert.throws(
      () =>
        loadSystemOneConfig({
          SYSTEM_ONE_BASE_URL: malformedBaseUrl,
          SYSTEM_ONE_API_KEY: apiKey,
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /SYSTEM_ONE_BASE_URL/);
        assert.match(error.message, /must be a valid http\(s\) URL/);
        assert.doesNotMatch(error.message, new RegExp(apiKey));
        assert.doesNotMatch(error.message, new RegExp(malformedBaseUrl));
        return true;
      },
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
