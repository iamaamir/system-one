# pi-system-one (Pi Extension) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `pi-system-one` placeholder into a real Pi extension exposing one `system_one` LLM tool backed by `system-one-core`.

**Architecture:** Thin adapter — Pi tool call → `SystemOne.evaluate()` → provider. All decision logic lives in `system-one-core`; this package owns only Pi API translation (TypeBox schema, config, rendering). No Bifrost imports, no thresholds, no fallbacks.

**Tech Stack:** TypeScript ESM (`NodeNext`, strict, base config), `system-one-core` (workspace), `typebox` (peer via Pi), `@earendil-works/pi-coding-agent` (peer, types only). Tests: `node --test --experimental-strip-types`, `tsc --noEmit`.

---

## File Structure

All under `/Users/mak/git/system-one/pi-system-one/` (existing placeholder files `index.js`, `README.md`, `package.json` get replaced):

- Modify: `package.json` — real manifest (version `1.1.0`, deps, `pi.extensions`)
- Create: `tsconfig.json` — extends base
- Create: `src/config.ts` — env config load + redacted display
- Create: `src/tool.ts` — TypeBox `systemOneParams` schema + `systemOneTool` definition + `execute`
- Create: `src/render.ts` — human/LLM text renderer (spec §35 format)
- Create: `src/extension.ts` — `export default function(pi)` registering the tool
- Create: `tests/config.test.ts`
- Create: `tests/tool.test.ts` (mock provider, no live calls)
- Modify: `README.md` — install + configure (replaces placeholder)

Ground truths (verified 2026-09-22, do NOT re-derive):
- `ToolDefinition`: `{ name, label, description, parameters: TParams(TypeBox), execute(toolCallId, params, signal, onUpdate, ctx): Promise<AgentToolResult<TDetails>>, renderCall?, renderResult? }` — source: `pi-bifrost/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:343-377`
- Registration: `pi.registerTool(tool): void` (same file:950); entry: `export default function name(pi: ExtensionAPI)` (pi-bifrost `index.ts:161` pattern)
- `typebox@1.3.27` is a dependency of `@earendil-works/pi-coding-agent` (its package.json:68)

---

### Task 0: API spike (read-only, no commit)

**Files:** none created/modified.

- [ ] **Step 1: Resolve `AgentToolResult` shape**

Run: `rg -n "AgentToolResult\s*=" node_modules/@earendil-works/pi-coding-agent/dist/bundle/chunks/*.js | head -n 5` (from `/Users/mak/git/pi-bifrost`)
Then: `rg -n -B2 -A25 "function.*registerTool|registerTool\(tool" node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js | head -n 60`
Record: (a) result object fields (`content`? `text`? `details`? `isError`?), (b) whether tool errors must be thrown or returned as error-results, (c) the exact TypeBox import specifier Pi code uses (`typebox` vs `@sinclair/typebox`).

- [ ] **Step 2: Report findings**

Write findings to the task report (no file). Task 1–4 code MUST use the verified field names. If `registerTool` validates `parameters` with a TypeBox compiler, note which (e.g. `TypeCompiler.Compile`) — schema must be compatible.

Expected: 30-line report, zero code changes.

---

### Task 1: Package manifest + tsconfig

**Files:**
- Modify: `pi-system-one/package.json`
- Create: `pi-system-one/tsconfig.json`

- [ ] **Step 1: Write the manifest**

```json
{
  "name": "pi-system-one",
  "version": "1.1.0",
  "description": "System One decisions for Pi. Plug in TypeSafe Jev, Reflex, or your own provider.",
  "type": "module",
  "license": "MIT",
  "exports": { ".": "./src/extension.ts" },
  "scripts": {
    "test": "node --test --experimental-strip-types \"tests/*.test.ts\"",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "system-one-core": "^0.1.1"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "typebox": "*"
  },
  "pi": {
    "extensions": ["./src/extension.ts"]
  }
}
```

Why `1.1.0`: placeholder squats `1.0.0` on the registry; next publishable is `1.0.1+`, and this is new functionality → `1.1.0`. Why `^0.1.1` (not `workspace:*`, which is pnpm-only syntax npm rejects): npm still symlinks the local workspace for `^0.1.1`, and the value is registry-publishable as-is — Task 6's pin step is therefore verify-only.

```json
// pi-system-one/tsconfig.json
{
  "extends": "../tsconfig.base.json",
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Delete legacy `pi-system-one/index.js` (placeholder stub): `rm pi-system-one/index.js`.

- [ ] **Step 2: Verify install + typecheck skeleton**

Run: `npm --prefix /Users/mak/git/system-one install --package-lock-only --ignore-scripts 2>&1 | tail -n 2`
Expected: lockfile updates, 0 vulnerabilities, no errors about `workspace:*`.

- [ ] **Step 3: Commit**

```bash
git add pi-system-one/package.json pi-system-one/tsconfig.json package-lock.json
git commit -m "feat(pi-system-one): real manifest 1.1.0, workspace core dep, Pi entry"
```

---

### Task 2: Config (env + redaction)

**Files:**
- Create: `pi-system-one/src/config.ts`
- Test: `pi-system-one/tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// pi-system-one/tests/config.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadSystemOneConfig, describeConfig } from "../src/config.ts";

describe("config", () => {
  it("loads from env with localhost default", () => {
    const cfg = loadSystemOneConfig({ SYSTEM_ONE_BASE_URL: "http://localhost:8008" });
    assert.equal(cfg.baseUrl, "http://localhost:8008");
    assert.equal(cfg.timeoutMs, 10_000);
  });
  it("never exposes the key", () => {
    const shown = describeConfig(loadSystemOneConfig({ SYSTEM_ONE_BASE_URL: "https://api.typesafe.ai", SYSTEM_ONE_API_KEY: "sk-live-123" }));
    assert.doesNotMatch(shown, /sk-live-123/);
    assert.match(shown, /configured/);
  });
  it("rejects missing baseUrl", () => {
    assert.throws(() => loadSystemOneConfig({}), /SYSTEM_ONE_BASE_URL/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types pi-system-one/tests/config.test.ts` (from repo root)
Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// pi-system-one/src/config.ts
export interface SystemOneEnv {
  SYSTEM_ONE_BASE_URL?: string;
  SYSTEM_ONE_API_KEY?: string;
  SYSTEM_ONE_MODEL?: string;
  SYSTEM_ONE_TIMEOUT_MS?: string;
}
export interface SystemOneExtConfig {
  baseUrl: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
}
export function loadSystemOneConfig(env: SystemOneEnv = process.env): SystemOneExtConfig {
  const baseUrl = env.SYSTEM_ONE_BASE_URL;
  if (!baseUrl) throw new Error("SYSTEM_ONE_BASE_URL is required (e.g. http://localhost:8008 or https://api.typesafe.ai)");
  const timeoutMs = env.SYSTEM_ONE_TIMEOUT_MS ? Number(env.SYSTEM_ONE_TIMEOUT_MS) : 10_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("SYSTEM_ONE_TIMEOUT_MS must be a positive number");
  return { baseUrl, apiKey: env.SYSTEM_ONE_API_KEY || undefined, model: env.SYSTEM_ONE_MODEL || undefined, timeoutMs };
}
export function describeConfig(cfg: SystemOneExtConfig): string {
  return [`Provider endpoint: ${cfg.baseUrl}`, `API key: ${cfg.apiKey ? "configured" : "absent"}`, `Model: ${cfg.model ?? "server default"}`, `Timeout: ${cfg.timeoutMs}ms`].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: same test command. Expected: PASS 3/3. Then `tsc --noEmit -p pi-system-one` clean.

- [ ] **Step 5: Commit**

```bash
git add pi-system-one/src/config.ts pi-system-one/tests/config.test.ts
git commit -m "feat(pi-system-one): env config with redacted display"
```

---

### Task 3: Renderer (spec §35 format)

**Files:**
- Create: `pi-system-one/src/render.ts`
- Test: extend `pi-system-one/tests/tool.test.ts` later; self-test here via inline asserts in test file `pi-system-one/tests/render.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// pi-system-one/tests/render.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderSystemOneResult } from "../src/render.ts";

describe("render", () => {
  it("renders mixed answers human-readably with full distributions", () => {
    const text = renderSystemOneResult({
      answers: {
        task: { type: "choice", choice: "coding", probabilities: { coding: 0.91, research: 0.06, writing: 0.03 }, confidence: 0.91 },
        complex: { type: "noul", noul: 0.82 },
        difficulty: { type: "score", score: 1.7, probabilities: { "0": 0.1, "1": 0.2, "2": 0.7 }, legend: { "0": "easy", "1": "medium", "2": "hard" }, confidence: 0.84 },
      },
    } as any);
    assert.match(text, /task:[\s\S]*choice: coding/);
    assert.match(text, /probabilities:[\s\S]*coding: 0\.91/);
    assert.match(text, /complex:[\s\S]*noul: 0\.82/);
    assert.match(text, /difficulty:[\s\S]*score: 1\.7/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// pi-system-one/src/render.ts
export function renderSystemOneResult(response: { answers: Record<string, any> }): string {
  const lines = ["System One result", ""];
  for (const [id, a] of Object.entries(response.answers)) {
    if (a?.type === "choice") {
      lines.push(`${id}:`, `  choice: ${a.choice}`, `  confidence: ${a.confidence}`, `  probabilities:`);
      for (const [k, v] of Object.entries(a.probabilities ?? {})) lines.push(`    ${k}: ${v}`);
    } else if (a?.type === "noul") {
      lines.push(`${id}:`, `  noul: ${a.noul}`);
    } else {
      lines.push(`${id}:`, `  score: ${a.score}`, `  confidence: ${a.confidence}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS. Typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add pi-system-one/src/render.ts pi-system-one/tests/render.test.ts
git commit -m "feat(pi-system-one): human-readable result renderer"
```

---

### Task 4: Tool definition + execution

**Files:**
- Create: `pi-system-one/src/tool.ts`
- Test: `pi-system-one/tests/tool.test.ts`

Depends on Task 0 findings (RESOLVED 2026-09-22): `AgentToolResult = { content, details, usage?, terminate? }` — NO `isError` field (harness attaches it); `execute` MUST THROW on failure, never return error-results (pi-agent-core contract: "Throw on failure instead of encoding errors in content"). The code below reflects this — it lets errors propagate unwrapped (safe: core error messages never contain secrets, proven by Task 6 test).

- [ ] **Step 1: Write the failing test**

```ts
// pi-system-one/tests/tool.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSystemOneTool } from "../src/tool.ts";
import { MockSystemOneProvider } from "system-one-core";

describe("system_one tool", () => {
  it("delegates a mixed batch and preserves details", async () => {
    const tool: any = buildSystemOneTool({
      provider: new MockSystemOneProvider({ answers: { t: { type: "choice", choice: "a", probabilities: { a: 1 }, confidence: 1 } } }),
    });
    const res = await tool.execute("id-1", { state: "hi", questions: { t: { type: "choice", instructions: "W?", criteria: { a: null } } } }, undefined, undefined, {});
    const text = JSON.stringify(res);
    assert.match(text, /"a"/);
    assert.equal(res.details.answers.t.choice, "a");
  });
  it("propagates provider errors by throwing (never error-results)", async () => {
    const tool: any = buildSystemOneTool({
      provider: { id: "boom", async evaluate() { throw new Error("down"); } },
    });
    await assert.rejects(
      tool.execute("id-2", { state: "x", questions: { q: { type: "noul", instructions: "Is it?" } } }, undefined, undefined, {}),
      /down/
    );
  });
});
```

Note: `from "system-one-core"` bare specifier relies on workspaces symlink + NodeNext resolution (package `exports` maps `.` → `./src/index.ts`; published 0.1.0 maps to dist — both expose the same names). If resolution fails, fall back to relative `../../system-one-core/src/index.ts` and note it.

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// pi-system-one/src/tool.ts
import { Type } from "typebox";
import type { Static } from "typebox";
import { SystemOne, type SystemOneProvider } from "system-one-core";
import { renderSystemOneResult } from "./render.ts";

const ChoiceQ = Type.Object({
  type: Type.Literal("choice"),
  instructions: Type.Any(),
  criteria: Type.Record(Type.String(), Type.Union([Type.Any(), Type.Null()])),
});
const NoulQ = Type.Object({
  type: Type.Literal("noul"),
  instructions: Type.Any(),
  criteria: Type.Optional(Type.Record(Type.String(), Type.Union([Type.Any(), Type.Null()]))),
});
const ScoreQ = Type.Object({
  type: Type.Literal("score"),
  instructions: Type.Any(),
  criteria: Type.Array(Type.Any()),
});
export const systemOneParams = Type.Object({
  state: Type.Union([Type.String(), Type.Record(Type.String(), Type.Any()), Type.Array(Type.Any())]),
  questions: Type.Record(Type.String(), Type.Union([ChoiceQ, NoulQ, ScoreQ])),
  model: Type.Optional(Type.String()),
});
export type SystemOneParams = Static<typeof systemOneParams>;

export function buildSystemOneTool(deps: { provider: SystemOneProvider }) {
  const systemOne = new SystemOne({ provider: deps.provider });
  return {
    name: "system_one",
    label: "System One",
    description:
      "Evaluate one or more bounded decision questions against shared state using the configured System One provider. " +
      "Use this when the answer space is known and a fast probabilistic decision is preferable to generating free-form text. " +
      "Multiple independent choice, noul, and score questions should be batched into one call when they share the same state.",
    parameters: systemOneParams,
    async execute(_toolCallId: string, params: SystemOneParams, signal: AbortSignal | undefined) {
      // Throw on failure per Pi contract — never encode errors in content.
      // Safe to propagate unwrapped: core error messages/codes never contain secrets.
      const response = await systemOne.evaluate(
        { state: params.state as any, questions: params.questions as any, ...(params.model ? { model: params.model } : {}) },
        { signal }
      );
      const text = renderSystemOneResult(response as any);
      return { content: [{ type: "text", text }], details: { answers: response.answers, model: response.model, usage: response.usage } };
    },
  };
}
```

Result shape per Task 0: `{ content: [{ type: "text", text }], details }` (no `isError` — harness-owned). Never include apiKey/config in results.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS 2/2. Typecheck clean (may need `import type { ExtensionAPI }` unused — don't import what you don't use).

- [ ] **Step 5: Commit**

```bash
git add pi-system-one/src/tool.ts pi-system-one/tests/tool.test.ts
git commit -m "feat(pi-system-one): system_one tool backed by SystemOne client"
```

---

### Task 5: Extension entry + README + workspace wiring

**Files:**
- Create: `pi-system-one/src/extension.ts`
- Modify: `pi-system-one/README.md`
- Modify: root `package.json` workspaces (already `["system-one-core", "pi-system-one"]` — verify, no change expected)

- [ ] **Step 1: Write entry + README**

```ts
// pi-system-one/src/extension.ts
import { HttpSystemOneProvider } from "system-one-core";
import { loadSystemOneConfig } from "./config.ts";
import { buildSystemOneTool } from "./tool.ts";

export default function piSystemOneExtension(pi: { registerTool(t: unknown): void }) {
  const cfg = loadSystemOneConfig();
  const tool = buildSystemOneTool({
    provider: new HttpSystemOneProvider({
      id: "configured",
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      defaultModel: cfg.model,
      timeoutMs: cfg.timeoutMs,
    }),
  });
  pi.registerTool(tool);
}
```

Type the param properly if `ExtensionAPI` is importable as a type without heavy deps: `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"` (pi-bifrost does exactly this, `index.ts:1`). If that import breaks typecheck (missing dep), keep the structural minimal type above and note it.

```md
# pi-system-one

System One decisions for Pi. Plug in TypeSafe Jev, Reflex, or your own provider.

```bash
pi install npm:pi-system-one
export SYSTEM_ONE_BASE_URL=http://localhost:8008
```

TypeSafe: `SYSTEM_ONE_BASE_URL=https://api.typesafe.ai SYSTEM_ONE_API_KEY=... SYSTEM_ONE_MODEL=jev-latest`.
```

- [ ] **Step 2: Verify full suite + typecheck**

Run: `npm --prefix /Users/mak/git/system-one install --ignore-scripts 2>&1 | tail -n 2` then `npm --workspace pi-system-one run test 2>&1 | tail -n 4` (expect all pass, mock-only) and `npm --workspace pi-system-one run typecheck` clean.

- [ ] **Step 3: Commit**

```bash
git add pi-system-one/src/extension.ts pi-system-one/README.md
git commit -m "feat(pi-system-one): extension entry + install docs"
```

---

### Task 6: Release prep (no publish)

**Files:** none (verification only) + version-pin edit for release.

- [ ] **Step 1: Verify publishable pin (already `^0.1.1` from Task 1 — no edit needed)**

Confirm `pi-system-one/package.json` has `"system-one-core": "^0.1.1"` (npm symlinks the workspace locally AND accepts the range at publish; `workspace:*` was rejected as pnpm-only syntax). Also stage the legacy deletion: `git rm --cached` is wrong (file deleted on disk, unstaged) — run `git add -u pi-system-one/index.js` to stage the deletion and include it in the Task 6 verification commit... actually simplest: `git add -A pi-system-one` in the final commit. DO NOT touch `main`.

- [ ] **Step 2: Dry-run + secret scan**

Run: `npm --workspace pi-system-one publish --dry-run 2>&1 | tail -n 12` — expect src+README+package.json only.
Run: `rg -i "sk-|bearer\s+sk|api[_-]?key\s*[:=]\s*['\"][^'\"]" pi-system-one/src pi-system-one/tests` — expect zero hits.

- [ ] **Step 3: Report**

Report dry-run file list + scan result. DO NOT publish (user publishes with 2FA). DO NOT commit the pin on `main`.

---

## Self-Review

- Spec coverage: one primary tool `system_one` (§32) with batched heterogeneous input (§33), teaching description (§34), text + details result (§35), env config (§36) with redaction (§51), no secrets in errors (§25–26), no thresholds/fallbacks (§30–31), manifest shape (§39 — `pi.extensions` entry + core dep). Deferred per spec: profiles (§37), commands (§38), Bifrost (§40–44).
- Type consistency: `SystemOneParams` (TypeBox Static) → cast to core `SystemOneRequest` at one boundary in `execute`; `details` carries `{ answers, model, usage }`; config field names match env vars.
- Open risk (owned by Task 0): exact `AgentToolResult` field names — plan code assumes `content/details/isError`; Task 0 MUST confirm or correct before Task 4 implementation.
