import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

interface PackageManifest {
  name: string;
  main: string;
  types: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface PackResult {
  files: Array<{ path: string }>;
}

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readManifest(): PackageManifest {
  return JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  ) as PackageManifest;
}

function readPackResult(): PackResult[] {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  return JSON.parse(output) as PackResult[];
}

describe("OpenCode System One packaging", () => {
  it("publishes the expected package entry points and dependencies", () => {
    const manifest = readManifest();

    assert.equal(manifest.name, "opencode-system-one");
    assert.equal(manifest.main, "./dist/index.js");
    assert.equal(manifest.types, "./dist/index.d.ts");
    assert.equal(manifest.dependencies?.["@opencode-ai/plugin"], "^1.18.32");
    assert.equal(manifest.dependencies?.["system-one-core"], "^0.2.1");
    assert.equal(manifest.dependencies?.zod, undefined);
    assert.equal(manifest.devDependencies?.zod, undefined);
    assert.equal(manifest.optionalDependencies?.zod, undefined);
    assert.equal(manifest.peerDependencies?.zod, undefined);
  });

  it("includes built runtime artifacts and documentation, but not tests", () => {
    const [{ files }] = readPackResult();
    const paths = files.map(({ path }) => path);

    assert.ok(paths.includes("dist/index.js"));
    assert.ok(paths.includes("dist/index.d.ts"));
    assert.ok(
      paths.some((path) => path.startsWith("dist/") && path.endsWith(".map")),
    );
    assert.ok(paths.includes("README.md"));
    assert.equal(
      paths.some(
        (path) => path.startsWith("tests/") || path.includes(".test."),
      ),
      false,
    );
  });
});
