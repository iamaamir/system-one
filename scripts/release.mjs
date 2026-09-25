#!/usr/bin/env node

// Monorepo release helper. Bumps workspace versions, syncs the lockfile,
// runs gates, commits, and tags. Pushing (which triggers the Release
// workflow) only happens with --publish.
//
//   node scripts/release.mjs --patch system-one-core --dry-run
//   node scripts/release.mjs --minor pi-system-one
//   node scripts/release.mjs --patch system-one-core pi-system-one --publish
//
// Convention (must hold for the Release workflow): workspace directory
// name == npm package name == tag prefix (<name>@<version>).

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const PKGS = [
  { name: "system-one-core", dir: "system-one-core" },
  { name: "pi-system-one", dir: "pi-system-one" },
  { name: "opencode-system-one", dir: "opencode-system-one" },
];

function usage() {
  console.log(`usage: release.mjs [--major|--minor|--patch] [pkg...] [--publish] [--dry-run]
  run bare for fully interactive: pick packages, bump type, then dry-run or publish.
  flags preselect steps (useful non-interactively); omitted steps prompt.
  one bump type applies uniformly to all selected packages.
  pkg: system-one-core, pi-system-one, opencode-system-one
  --publish: push main + created tags (triggers Release workflow)
  --dry-run: print plan, change nothing (mutually exclusive with --publish)`);
}

function parseArgs(argv) {
  const args = { pkgs: [], dryRun: false, publish: false, bump: null };
  for (const a of argv) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--publish") args.publish = true;
    else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else if (a === "--minor" || a === "--patch" || a === "--major") {
      if (args.bump) {
        console.error("only one bump type allowed");
        process.exit(1);
      }
      args.bump = a.slice(2);
    } else if (a.startsWith("-")) {
      console.error(`unknown flag: ${a}`);
      process.exit(1);
    } else args.pkgs.push(a);
  }
  return args;
}

function sh(cmd, opts = {}) {
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: "utf8", ...opts });
    return typeof out === "string" ? out.trim() : "";
  } catch (e) {
    const detail = [e.stdout, e.stderr].filter(Boolean).join("\n");
    throw new Error(`command failed: ${cmd}${detail ? `\n${detail}` : ""}`);
  }
}

function bumpVersion(version, type) {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(`not a semver version: ${version}`);
  }
  const [maj, min, pat] = parts;
  if (type === "major") return `${maj + 1}.0.0`;
  if (type === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

function getDepRange(current, newVersion) {
  // Keep the existing range style, retarget at the bumped version.
  if (current.startsWith("^")) return `^${newVersion}`;
  if (current.startsWith("~")) return `~${newVersion}`;
  if (/^\d+\.\d+\.\d+$/.test(current)) return newVersion;
  throw new Error(`unsupported dependency range style: ${current}`);
}

function readPkg(dir) {
  const p = path.join(ROOT, dir, "package.json");
  return { path: p, json: JSON.parse(readFileSync(p, "utf8")) };
}

function writePkg(pkgPath, json) {
  writeFileSync(pkgPath, `${JSON.stringify(json, null, 2)}\n`);
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function selectInteractive() {
  return new Promise((resolve) => {
    console.log("\nSelect package(s) to release (comma-separated numbers):\n");
    for (const [i, p] of PKGS.entries()) {
      const { json } = readPkg(p.dir);
      console.log(`  ${i + 1}. ${p.name} (current: ${json.version})`);
    }
    console.log();
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("> ", (answer) => {
      rl.close();
      const selected = answer
        .split(",")
        .map((s) => PKGS[Number.parseInt(s.trim(), 10) - 1])
        .filter(Boolean);
      resolve(selected);
    });
  });
}

function requireTTY(step) {
  if (!process.stdin.isTTY) {
    console.error(`no ${step} given and stdin is not interactive`);
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let selected = PKGS.filter((p) => args.pkgs.includes(p.name));
  const unknown = args.pkgs.filter((n) => !PKGS.some((p) => p.name === n));
  if (unknown.length > 0) {
    console.error(`unknown package(s): ${unknown.join(", ")}`);
    process.exit(1);
  }
  if (selected.length === 0) {
    requireTTY("packages");
    selected = await selectInteractive();
  }
  if (selected.length === 0) {
    console.error("nothing selected");
    process.exit(1);
  }

  let bump = args.bump;
  if (!bump) {
    requireTTY("bump type");
    const { json } = readPkg(selected[0].dir);
    console.log(`\nBump type for ${selected.map((p) => p.name).join(", ")}:\n`);
    for (const [i, t] of ["patch", "minor", "major"].entries()) {
      const preview =
        selected.length === 1
          ? ` (${json.version} -> ${bumpVersion(json.version, t)})`
          : "";
      console.log(`  ${i + 1}. ${t}${preview}`);
    }
    console.log();
    const answer = await ask("> ");
    bump = ["patch", "minor", "major"][Number.parseInt(answer, 10) - 1];
    if (!bump) {
      console.error("invalid bump type");
      process.exit(1);
    }
  }

  if (args.publish && args.dryRun) {
    console.error("--publish and --dry-run are mutually exclusive");
    process.exit(1);
  }
  let mode = args.publish ? "publish" : args.dryRun ? "dry-run" : null;
  if (!mode) {
    requireTTY("mode");
    console.log(
      "\nMode:\n\n  1. dry-run (plan only, change nothing)\n  2. publish (bump, tag, push - triggers Release workflow)\n",
    );
    const answer = await ask("> ");
    mode = answer === "2" ? "publish" : answer === "1" ? "dry-run" : null;
    if (!mode) {
      console.error("invalid mode");
      process.exit(1);
    }
  }
  const dryRun = mode === "dry-run";

  // Plan first: compute every new version before touching anything.
  const plan = selected.map((p) => {
    const { json } = readPkg(p.dir);
    return {
      ...p,
      oldVersion: json.version,
      newVersion: bumpVersion(json.version, bump),
    };
  });
  for (const b of plan) {
    if (
      sh(
        `git rev-parse -q --verify refs/tags/${b.name}@${b.newVersion} || true`,
      ) !== ""
    ) {
      console.error(`tag already exists: ${b.name}@${b.newVersion}`);
      process.exit(1);
    }
  }
  console.log(`\nRelease: bump ${bump}`);
  for (const b of plan)
    console.log(`  ${b.name}: ${b.oldVersion} -> ${b.newVersion}`);
  if (dryRun) {
    console.log("(dry-run - nothing changed)");
    return;
  }
  if (sh("git status --porcelain") !== "") {
    console.error("working tree is dirty - commit or stash first");
    process.exit(1);
  }

  // Gates: do not tag a release that fails checks.
  console.log("running gates (typecheck, lint, tests)...");
  sh("npm run typecheck", { stdio: "inherit" });
  sh("npm run lint", { stdio: "inherit" });
  sh("npm test", { stdio: "inherit" });

  // A core major exiles dependents: refuse unless pi rides along.
  const coreBump = plan.find((b) => b.name === "system-one-core");
  if (
    coreBump &&
    bump === "major" &&
    !plan.some((b) => b.name === "pi-system-one")
  ) {
    console.error(
      "core major bump requires pi-system-one in the same release (its dependency range would be orphaned)",
    );
    process.exit(1);
  }

  for (const b of plan) {
    const { path: pkgPath, json } = readPkg(b.dir);
    json.version = b.newVersion;
    // Keep dependent workspace ranges pointed at the bumped core.
    if (b.name === "pi-system-one") {
      const core = plan.find((x) => x.name === "system-one-core");
      if (core && json.dependencies?.["system-one-core"]) {
        json.dependencies["system-one-core"] = getDepRange(
          json.dependencies["system-one-core"],
          core.newVersion,
        );
        console.log(
          `  ${b.name}: system-one-core dep -> ${json.dependencies["system-one-core"]}`,
        );
      }
    }
    writePkg(pkgPath, json);
  }
  // Keep package-lock.json in sync or `npm ci` (and CI) fails.
  sh(
    "npm install --package-lock-only --offline || npm install --package-lock-only",
  );

  // One commit for all bumps: lockfile and package.jsons stay consistent.
  for (const b of plan) sh(`git add ${b.dir}/package.json`);
  sh("git add package-lock.json");
  const names = plan.map((b) => `${b.name} to ${b.newVersion}`).join(", ");
  sh(`git commit -m "chore: bump ${names}"`);
  for (const b of plan) {
    sh(`git tag ${b.name}@${b.newVersion}`);
    console.log(`committed + tagged ${b.name}@${b.newVersion}`);
  }

  if (mode === "publish") {
    const branch = sh("git branch --show-current");
    if (branch !== "main") {
      console.error(
        `refusing to publish from branch "${branch}" (must be main)`,
      );
      process.exit(1);
    }
    const tags = plan.map((b) => `${b.name}@${b.newVersion}`).join(" ");
    sh(`git push origin main ${tags}`, { stdio: "inherit" });
    console.log("pushed main + tags (Release workflow triggered)");
  } else {
    console.log(
      "not pushed. Re-run with --publish to push (triggers Release workflow).",
    );
  }
}

main().catch((e) => {
  console.error(`release failed: ${e.message}`);
  process.exit(1);
});
