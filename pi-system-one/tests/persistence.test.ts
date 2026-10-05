import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { loadStoredConfig, saveStoredConfig } from "../src/persistence.ts";

it("round-trips persistent settings without writing a key", () => {
  const dir = mkdtempSync(join(tmpdir(), "so-config-"));
  try {
    const path = join(dir, "pi-system-one.json");
    saveStoredConfig(path, {
      mode: "custom",
      baseUrl: "http://localhost:8008",
      model: "reflex",
      timeoutMs: 9000,
    });
    assert.deepEqual(loadStoredConfig(path), {
      mode: "custom",
      baseUrl: "http://localhost:8008",
      model: "reflex",
      timeoutMs: 9000,
    });
    assert.doesNotMatch(readFileSync(path, "utf8"), /apiKey/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("rejects credential-bearing endpoint URLs without persisting them", () => {
  const dir = mkdtempSync(join(tmpdir(), "so-config-"));
  try {
    const path = join(dir, "pi-system-one.json");
    for (const baseUrl of [
      "https://user:secret@example.com",
      "https://example.com/?token=secret",
      "https://example.com/#secret",
    ]) {
      assert.throws(
        () => saveStoredConfig(path, { mode: "custom", baseUrl }),
        (error: Error) =>
          !error.message.includes("secret") && /baseUrl/.test(error.message),
      );
      assert.throws(() => readFileSync(path, "utf8"), /ENOENT/);
    }
    writeFileSync(
      path,
      JSON.stringify({
        mode: "custom",
        baseUrl: "https://example.com/?token=secret",
      }),
    );
    assert.throws(() => loadStoredConfig(path), /baseUrl/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("rejects malformed settings and refuses stored secrets", () => {
  const dir = mkdtempSync(join(tmpdir(), "so-config-"));
  try {
    const path = join(dir, "pi-system-one.json");
    writeFileSync(path, JSON.stringify({ mode: "typesafe", apiKey: "secret" }));
    assert.throws(() => loadStoredConfig(path), /apiKey/);
    writeFileSync(path, "{");
    assert.throws(() => loadStoredConfig(path), /pi-system-one.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
