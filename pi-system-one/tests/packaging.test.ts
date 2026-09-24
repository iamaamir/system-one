// pi-system-one/tests/packaging.test.ts
//
// The skill and /judge prompt are runtime behavior (served via
// resources_discover), not just docs. Assert the published tarball
// actually contains them by inspecting the real `npm pack` file list
// rather than the source checkout.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

function packedFiles(): string[] {
  const stdout = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: packageRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed: unknown = JSON.parse(stdout);
  const entry = Array.isArray(parsed) ? parsed[0] : undefined;
  const files = (entry as { files?: Array<{ path?: string }> } | undefined)
    ?.files;
  assert.ok(
    Array.isArray(files) && files.length > 0,
    "npm pack --dry-run --json returned no files",
  );
  return (files as Array<{ path?: string }>)
    .map((f) => f.path ?? "")
    .filter((p) => p.length > 0);
}

describe("npm package runtime resources", () => {
  it("packs the skill, its references, and the /judge prompt", () => {
    const files = packedFiles();
    for (const required of [
      "skills/system-one/SKILL.md",
      "skills/system-one/references/use-cases.md",
      "prompts/judge.md",
      "src/extension.ts",
    ]) {
      assert.ok(
        files.includes(required),
        `published package is missing runtime resource: ${required}`,
      );
    }
  });
});
