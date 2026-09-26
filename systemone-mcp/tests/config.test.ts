import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadSystemOneConfig, validateBaseUrl } from "../src/config.ts";

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
  it("rejects unsafe credential transport and URL parts", () => {
    assert.throws(
      () => validateBaseUrl("http://example.test", "secret"),
      /HTTPS/,
    );
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
});
