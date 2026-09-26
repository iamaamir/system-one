import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

describe("npm package metadata", () => {
  it("passes current npm publish validation and retains the executable bin", () => {
    const cache = mkdtempSync(join(tmpdir(), "systemone-mcp-npm-cache-"));
    const destination = mkdtempSync(join(tmpdir(), "systemone-mcp-pack-"));
    try {
      const publish = spawnSync(
        "npm",
        [
          "publish",
          "--dry-run",
          "--tag",
          "next",
          "--offline",
          "--cache",
          cache,
          "--ignore-scripts",
          "--loglevel",
          "notice",
        ],
        { cwd: packageRoot, encoding: "utf8", timeout: 30_000 },
      );
      assert.equal(publish.status, 0, publish.stderr);
      const publishOutput = `${publish.stdout}${publish.stderr}`;
      assert.doesNotMatch(
        publishOutput,
        /script name dist\/index\.js was invalid and removed/,
      );

      const packOutput = execFileSync(
        "npm",
        [
          "pack",
          "--json",
          "--ignore-scripts",
          "--pack-destination",
          destination,
        ],
        {
          cwd: packageRoot,
          encoding: "utf8",
          env: { ...process.env, npm_config_cache: cache },
        },
      );
      const [{ filename }] = JSON.parse(packOutput) as [{ filename: string }];
      const packedManifest = execFileSync(
        "tar",
        ["-xOf", join(destination, filename), "package/package.json"],
        { encoding: "utf8" },
      );
      assert.deepEqual(JSON.parse(packedManifest).bin, {
        "systemone-mcp": "dist/index.js",
      });
    } finally {
      rmSync(cache, { recursive: true, force: true });
      rmSync(destination, { recursive: true, force: true });
    }
  });
});
