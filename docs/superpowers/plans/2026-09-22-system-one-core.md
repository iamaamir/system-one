# system-one-core v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `system-one-core@0.1.0` — provider-neutral System One runtime (choice/noul/score, typed answers, HTTP provider, validation, mock) that works unchanged against Reflex and TypeSafe Jev.

**Architecture:** Flat monorepo root with `system-one-core/` (new runtime) + `pi-system-one/` (untouched placeholder); `pi-bifrost` symlink is reference-only. Core exposes `SystemOneProvider` interface, `SystemOne` client with `evaluate()`, one `HttpSystemOneProvider` for all `/v1/systemone` endpoints, fail-closed validation, no thresholds/fallbacks.

**Tech Stack:** TypeScript ESM (`type: module`, `NodeNext`, `ES2022`, `strict`), native `fetch` + `AbortController`, `node --test --experimental-strip-types` for tests, `tsc --noEmit` for typecheck. No runtime dependencies.

---

## File Structure

New files (all under `/Users/mak/git/system-one/`):

- Create: `package.json` — private root, workspaces `["system-one-core", "pi-system-one"]`
- Create: `tsconfig.base.json` — shared strict config
- Create: `system-one-core/package.json` — name `system-one-core`, version `0.1.0`, zero deps
- Create: `system-one-core/tsconfig.json` — extends base
- Create: `system-one-core/src/types.ts` — `JsonPrimitive`, `JsonValue`, `SystemOneState`
- Create: `system-one-core/src/errors.ts` — error hierarchy with `code`
- Create: `system-one-core/src/questions.ts` — question types + `choice`/`noul`/`score` builders
- Create: `system-one-core/src/responses.ts` — answer types + `AnswerFor`/`AnswersFor`
- Create: `system-one-core/src/provider.ts` — `SystemOneProvider`, `SystemOneRequest`, `SystemOneCallOptions`, `SystemOneCapabilities`
- Create: `system-one-core/src/client.ts` — `SystemOne` class + `createSystemOne`
- Create: `system-one-core/src/validation.ts` — `validateResponse`
- Create: `system-one-core/src/providers/http.ts` — `HttpSystemOneProvider`
- Create: `system-one-core/src/providers/mock.ts` — `MockSystemOneProvider`
- Create: `system-one-core/src/index.ts` — public exports
- Create: `system-one-core/tests/questions.test.ts`
- Create: `system-one-core/tests/validation.test.ts`
- Create: `system-one-core/tests/http.test.ts`
- Create: `system-one-core/tests/client.test.ts`
- Create: `system-one-core/tests/contract.test.ts` — env-gated, skipped by default

Modified: none (`pi-system-one/` and `pi-bifrost` symlink untouched).

---

### Task 1: Repo foundation

**Files:**
- Create: `/Users/mak/git/system-one/package.json`
- Create: `/Users/mak/git/system-one/tsconfig.base.json`
- Create: `/Users/mak/git/system-one/system-one-core/package.json`
- Create: `/Users/mak/git/system-one/system-one-core/tsconfig.json`

- [ ] **Step 1: Create root workspace files**

```json
// /Users/mak/git/system-one/package.json
{
  "private": true,
  "type": "module",
  "workspaces": ["system-one-core", "pi-system-one"],
  "scripts": {
    "test": "npm --workspace system-one-core run test",
    "typecheck": "npm --workspace system-one-core run typecheck"
  }
}
```

```json
// /Users/mak/git/system-one/tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

```json
// /Users/mak/git/system-one/system-one-core/package.json
{
  "name": "system-one-core",
  "version": "0.1.0",
  "description": "Provider-neutral System One runtime for TypeScript. Plug in TypeSafe Jev, Reflex, or your own provider.",
  "type": "module",
  "license": "MIT",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "node --test --experimental-strip-types \"tests/*.test.ts\"",
    "typecheck": "tsc --noEmit"
  }
}
```

```json
// /Users/mak/git/system-one/system-one-core/tsconfig.json
{
  "extends": "../tsconfig.base.json",
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: Verify workspace resolves**

Run: `npm --prefix /Users/mak/git/system-one install --package-lock-only --ignore-scripts 2>&1 | tail -n 5`
Expected: lockfile generated without errors (pi-system-one has no deps, core has none).

- [ ] **Step 3: Commit**

```bash
git -C /Users/mak/git/system-one status 2>&1 | head -n 5
```

Note: root is currently not a git repo. If `git init` is approved, run `git init` + initial commit; otherwise leave uncommitted and proceed. Do NOT commit inside `pi-system-one/` or via the `pi-bifrost` symlink.

---

### Task 2: Types + errors

**Files:**
- Create: `system-one-core/src/types.ts`
- Create: `system-one-core/src/errors.ts`
- Test: `system-one-core/tests/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// system-one-core/tests/errors.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SystemOneTimeoutError, SystemOneProtocolError } from "../src/errors.ts";

describe("errors", () => {
  it("exposes machine-readable codes", () => {
    assert.equal(new SystemOneTimeoutError("slow").code, "SYSTEM_ONE_TIMEOUT");
    assert.equal(new SystemOneProtocolError("bad").code, "SYSTEM_ONE_PROTOCOL");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types system-one-core/tests/errors.test.ts`
Expected: FAIL with "Cannot find module ... errors.ts".

- [ ] **Step 3: Write minimal implementation**

```ts
// system-one-core/src/types.ts
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type SystemOneState = JsonValue;
```

```ts
// system-one-core/src/errors.ts
export class SystemOneError extends Error {
  readonly code: string;
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SystemOneError";
    this.code = code;
  }
}
export class SystemOneConfigurationError extends SystemOneError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "SYSTEM_ONE_CONFIGURATION", options);
    this.name = "SystemOneConfigurationError";
  }
}
export class SystemOneTransportError extends SystemOneError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "SYSTEM_ONE_TRANSPORT", options);
    this.name = "SystemOneTransportError";
  }
}
export class SystemOneTimeoutError extends SystemOneError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "SYSTEM_ONE_TIMEOUT", options);
    this.name = "SystemOneTimeoutError";
  }
}
export class SystemOneHttpError extends SystemOneError {
  readonly status: number;
  readonly provider: string;
  readonly requestId?: string;
  constructor(message: string, opts: { status: number; provider: string; requestId?: string }, options?: ErrorOptions) {
    super(message, "SYSTEM_ONE_HTTP", options);
    this.name = "SystemOneHttpError";
    this.status = opts.status;
    this.provider = opts.provider;
    this.requestId = opts.requestId;
  }
}
export class SystemOneProtocolError extends SystemOneError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "SYSTEM_ONE_PROTOCOL", options);
    this.name = "SystemOneProtocolError";
  }
}
export class SystemOneCapabilityError extends SystemOneError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "SYSTEM_ONE_CAPABILITY", options);
    this.name = "SystemOneCapabilityError";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types system-one-core/tests/errors.test.ts`
Expected: PASS (2 subtests or 1 test pass, 0 fail). Then `tsc --noEmit -p system-one-core`.

- [ ] **Step 5: Commit** (when root repo exists; otherwise skip)

---

### Task 3: Question builders + typed answers

**Files:**
- Create: `system-one-core/src/questions.ts`
- Create: `system-one-core/src/responses.ts`
- Test: `system-one-core/tests/questions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// system-one-core/tests/questions.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { choice, noul, score } from "../src/questions.ts";

describe("builders", () => {
  it("builds typed choice/noul/score questions", () => {
    const q = choice("Which?", { coding: "impl", research: null });
    assert.equal(q.type, "choice");
    assert.deepEqual(Object.keys(q.criteria), ["coding", "research"]);
    assert.equal(noul("Is it hard?").type, "noul");
    assert.equal(score("How hard?", ["easy", "hard"]).type, "score");
  });
  it("infers choice keys", () => {
    const q = choice("Which?", { a: null, b: null } as const);
    const k: keyof typeof q.criteria = "a";
    assert.equal(k, "a");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types system-one-core/tests/questions.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// system-one-core/src/questions.ts
import type { JsonValue } from "./types.ts";

export interface NoulQuestion {
  type: "noul";
  instructions: JsonValue;
  criteria?: Record<string, JsonValue | null>;
}
export interface ChoiceQuestion<T extends Record<string, JsonValue | null> = Record<string, JsonValue | null>> {
  type: "choice";
  instructions: JsonValue;
  criteria: T;
}
export interface ScoreQuestion<T extends readonly JsonValue[] = readonly JsonValue[]> {
  type: "score";
  instructions: JsonValue;
  criteria: T;
}
export type Question = NoulQuestion | ChoiceQuestion<any> | ScoreQuestion<any>;
export type QuestionMap = Record<string, Question>;

export function noul(instructions: JsonValue, criteria?: Record<string, JsonValue | null>): NoulQuestion {
  return criteria ? { type: "noul", instructions, criteria } : { type: "noul", instructions };
}
export function choice<const T extends Record<string, JsonValue | null>>(instructions: JsonValue, criteria: T): ChoiceQuestion<T> {
  return { type: "choice", instructions, criteria };
}
export function score<const T extends readonly JsonValue[]>(instructions: JsonValue, criteria: T): ScoreQuestion<T> {
  return { type: "score", instructions, criteria };
}
```

```ts
// system-one-core/src/responses.ts
export interface NoulAnswer { type: "noul"; noul: number; }
export interface ChoiceAnswer<TChoice extends string = string> {
  type: "choice"; choice: TChoice; probabilities: Record<TChoice, number>; confidence: number;
}
export interface ScoreAnswer {
  type: "score"; score: number; probabilities: Record<string, number>;
  legend: Record<string, unknown>; confidence: number;
}
export type Answer = NoulAnswer | ChoiceAnswer<any> | ScoreAnswer;
export type AnswerFor<Q> = Q extends import("./questions.ts").NoulQuestion ? NoulAnswer
  : Q extends import("./questions.ts").ChoiceQuestion<infer C> ? ChoiceAnswer<Extract<keyof C, string>>
  : Q extends import("./questions.ts").ScoreQuestion<any> ? ScoreAnswer : never;
export type AnswersFor<Q extends import("./questions.ts").QuestionMap> = { [K in keyof Q]: AnswerFor<Q[K]> };
export interface SystemOneResponse<Q extends import("./questions.ts").QuestionMap = import("./questions.ts").QuestionMap> {
  model?: string;
  answers: AnswersFor<Q>;
  usage?: { inputTokens?: number; outputTokens?: number };
  requestId?: string;
  metadata: { provider: string; latencyMs?: number };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types system-one-core/tests/questions.test.ts`
Expected: PASS. Then typecheck.

- [ ] **Step 5: Commit**

---

### Task 4: Provider interface + client

**Files:**
- Create: `system-one-core/src/provider.ts`
- Create: `system-one-core/src/client.ts`
- Test: `system-one-core/tests/client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// system-one-core/tests/client.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SystemOne } from "../src/client.ts";
import { noul } from "../src/questions.ts";
import type { SystemOneProvider } from "../src/provider.ts";

describe("client", () => {
  it("delegates evaluate to provider and tags metadata", async () => {
    const provider: SystemOneProvider = {
      id: "fake",
      async evaluate(req) {
        return { answers: { q: { type: "noul", noul: 0.7 } }, metadata: { provider: "fake" } } as any;
      },
    };
    const s1 = new SystemOne({ provider });
    const res = await s1.evaluate({ state: "x", questions: { q: noul("Is it?") } });
    assert.equal((res.answers.q as any).noul, 0.7);
    assert.equal(res.metadata.provider, "fake");
  });
  it("rejects empty questions", async () => {
    const provider: SystemOneProvider = { id: "f", async evaluate() { throw new Error("should not call"); } };
    await assert.rejects(() => new SystemOne({ provider }).evaluate({ state: "x", questions: {} } as any));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types system-one-core/tests/client.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// system-one-core/src/provider.ts
import type { QuestionMap } from "./questions.ts";
import type { SystemOneResponse } from "./responses.ts";
import type { SystemOneState } from "./types.ts";

export interface SystemOneRequest<Q extends QuestionMap = QuestionMap> {
  state: SystemOneState;
  questions: Q;
  model?: string;
}
export interface SystemOneCallOptions { signal?: AbortSignal; model?: string; }
export interface SystemOneCapabilities {
  questionTypes?: Array<"choice" | "noul" | "score">;
  batching?: boolean;
  structuredState?: boolean;
  multimodal?: boolean | "unknown";
  limits?: { maxQuestions?: number; maxChoiceOptions?: number; maxStateBytes?: number };
}
export interface SystemOneProvider {
  readonly id: string;
  evaluate<Q extends QuestionMap>(request: SystemOneRequest<Q>, options?: SystemOneCallOptions): Promise<SystemOneResponse<Q>>;
  capabilities?(): SystemOneCapabilities | Promise<SystemOneCapabilities>;
}
```

```ts
// system-one-core/src/client.ts
import { SystemOneConfigurationError } from "./errors.ts";
import type { QuestionMap } from "./questions.ts";
import type { SystemOneRequest, SystemOneProvider, SystemOneCallOptions } from "./provider.ts";
import type { SystemOneResponse } from "./responses.ts";

export interface SystemOneOptions { provider: SystemOneProvider; }
export class SystemOne {
  readonly provider: SystemOneProvider;
  constructor(options: SystemOneOptions) {
    if (!options?.provider) throw new SystemOneConfigurationError("provider is required");
    this.provider = options.provider;
  }
  async evaluate<Q extends QuestionMap>(request: SystemOneRequest<Q>, options?: SystemOneCallOptions): Promise<SystemOneResponse<Q>> {
    if (!request || !request.questions || Object.keys(request.questions).length === 0) {
      throw new SystemOneConfigurationError("at least one question is required");
    }
    return this.provider.evaluate(request, options);
  }
}
export function createSystemOne(options: SystemOneOptions): SystemOne {
  return new SystemOne(options);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types system-one-core/tests/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

---

### Task 5: Fail-closed validation

**Files:**
- Create: `system-one-core/src/validation.ts`
- Test: `system-one-core/tests/validation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// system-one-core/tests/validation.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateResponse } from "../src/validation.ts";
import { choice, noul } from "../src/questions.ts";

describe("validation", () => {
  it("accepts a valid mixed response", () => {
    const questions = { c: choice("Which?", { a: null, b: null }), n: noul("Is it?") };
    const raw = { answers: {
      c: { type: "choice", choice: "a", probabilities: { a: 0.8, b: 0.2 }, confidence: 0.8 },
      n: { type: "noul", noul: 0.3 },
    } };
    const out = validateResponse(questions, raw, "p");
    assert.equal((out.answers.c as any).choice, "a");
  });
  it("rejects unknown choice, bad probabilities, NaN", () => {
    const questions = { c: choice("Which?", { a: null, b: null }) };
    for (const bad of [
      { answers: { c: { type: "choice", choice: "zzz", probabilities: { a: 0.5, b: 0.5 }, confidence: 0.5 } } },
      { answers: { c: { type: "choice", choice: "a", probabilities: { a: 1.5, b: 0 }, confidence: 0.5 } } },
      { answers: { c: { type: "choice", choice: "a", probabilities: { a: NaN, b: 0.5 }, confidence: 0.5 } } },
      { answers: {} },
    ]) {
      assert.throws(() => validateResponse(questions, bad, "p"), /SYSTEM_ONE_PROTOCOL|protocol/i);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types system-one-core/tests/validation.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// system-one-core/src/validation.ts
import { SystemOneProtocolError } from "./errors.ts";
import type { QuestionMap } from "./questions.ts";
import type { SystemOneResponse } from "./responses.ts";

function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}
function assertProb(n: unknown, what: string): void {
  if (!isFiniteNum(n) || n < 0 || n > 1) throw new SystemOneProtocolError(`invalid probability for ${what}`);
}

export function validateResponse<Q extends QuestionMap>(questions: Q, raw: unknown, providerId: string): SystemOneResponse<Q> {
  if (!raw || typeof raw !== "object") throw new SystemOneProtocolError("response is not an object");
  const r = raw as Record<string, any>;
  if (!r.answers || typeof r.answers !== "object") throw new SystemOneProtocolError("missing answers");
  const answers: Record<string, any> = {};
  for (const [id, q] of Object.entries(questions)) {
    const a = r.answers[id];
    if (!a || typeof a !== "object") throw new SystemOneProtocolError(`missing answer for ${id}`);
    if (a.type !== (q as any).type) throw new SystemOneProtocolError(`wrong answer type for ${id}`);
    if (q.type === "noul") {
      if (!isFiniteNum(a.noul) || a.noul < 0 || a.noul > 1) throw new SystemOneProtocolError(`invalid noul for ${id}`);
      answers[id] = { type: "noul", noul: a.noul };
    } else if (q.type === "choice") {
      const criteria = (q as any).criteria as Record<string, unknown>;
      const keys = Object.keys(criteria);
      if (!keys.includes(a.choice)) throw new SystemOneProtocolError(`unknown choice for ${id}`);
      if (!a.probabilities || typeof a.probabilities !== "object") throw new SystemOneProtocolError(`missing probabilities for ${id}`);
      for (const k of keys) assertProb(a.probabilities[k], `${id}.${k}`);
      if (!isFiniteNum(a.confidence) || a.confidence < 0 || a.confidence > 1) throw new SystemOneProtocolError(`invalid confidence for ${id}`);
      answers[id] = { type: "choice", choice: a.choice, probabilities: a.probabilities, confidence: a.confidence };
    } else {
      if (!isFiniteNum(a.score)) throw new SystemOneProtocolError(`invalid score for ${id}`);
      if (!isFiniteNum(a.confidence) || a.confidence < 0 || a.confidence > 1) throw new SystemOneProtocolError(`invalid confidence for ${id}`);
      if (!a.legend || typeof a.legend !== "object") throw new SystemOneProtocolError(`missing legend for ${id}`);
      if (!a.probabilities || typeof a.probabilities !== "object") throw new SystemOneProtocolError(`missing probabilities for ${id}`);
      for (const v of Object.values(a.probabilities)) assertProb(v, `${id}.prob`);
      answers[id] = { type: "score", score: a.score, probabilities: a.probabilities, legend: a.legend, confidence: a.confidence };
    }
  }
  return {
    model: typeof r.model === "string" ? r.model : undefined,
    answers: answers as any,
    usage: r.usage,
    requestId: typeof r.requestId === "string" ? r.requestId : undefined,
    metadata: { provider: providerId },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types system-one-core/tests/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

---

### Task 6: HTTP provider

**Files:**
- Create: `system-one-core/src/providers/http.ts`
- Test: `system-one-core/tests/http.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// system-one-core/tests/http.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HttpSystemOneProvider } from "../src/providers/http.ts";
import { choice } from "../src/questions.ts";

describe("http provider", () => {
  it("POSTs to /v1/systemone with auth and validates", async () => {
    const seen: any = {};
    const fakeFetch = async (url: any, init: any) => {
      seen.url = String(url); seen.init = init;
      return new Response(JSON.stringify({ answers: {
        c: { type: "choice", choice: "a", probabilities: { a: 0.9, b: 0.1 }, confidence: 0.9 },
      } }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const p = new HttpSystemOneProvider({ id: "t", baseUrl: "https://api.example.com", apiKey: "secret", fetch: fakeFetch as any });
    const res = await p.evaluate({ state: "hi", questions: { c: choice("Which?", { a: null, b: null }) } });
    assert.match(seen.url, /\/v1\/systemone$/);
    assert.equal(seen.init.headers["Authorization"], "Bearer secret");
    assert.equal((res.answers.c as any).choice, "a");
    assert.equal(res.metadata.provider, "t");
  });
  it("maps 401 to HttpError without leaking key", async () => {
    const fakeFetch = async () => new Response("nope", { status: 401 });
    const p = new HttpSystemOneProvider({ baseUrl: "https://x.example", apiKey: "s3cr3t", fetch: fakeFetch as any });
    try {
      await p.evaluate({ state: "x", questions: { c: choice("W?", { a: null }) } });
      assert.fail("should throw");
    } catch (e: any) {
      assert.equal(e.code, "SYSTEM_ONE_HTTP");
      assert.doesNotMatch(String(e.stack) + JSON.stringify(e), /s3cr3t/);
    }
  });
  it("times out", async () => {
    const fakeFetch = async (_u: any, init: any) => new Promise((_res, rej) => {
      init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
    const p = new HttpSystemOneProvider({ baseUrl: "https://x.example", timeoutMs: 20, fetch: fakeFetch as any });
    await assert.rejects(
      p.evaluate({ state: "x", questions: { c: choice("W?", { a: null }) } }),
      /SYSTEM_ONE_TIMEOUT|timeout/i
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types system-one-core/tests/http.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// system-one-core/src/providers/http.ts
import { SystemOneHttpError, SystemOneTimeoutError, SystemOneTransportError } from "../errors.ts";
import type { QuestionMap } from "../questions.ts";
import type { SystemOneCallOptions, SystemOneProvider, SystemOneRequest } from "../provider.ts";
import type { SystemOneResponse } from "../responses.ts";
import { validateResponse } from "../validation.ts";

export interface RetryOptions { maxRetries?: number; retryOn?: number[]; }
export interface HttpSystemOneProviderOptions {
  id?: string;
  baseUrl: string;
  path?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  defaultModel?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  maxResponseBytes?: number;
  retry?: RetryOptions;
}

const DEFAULT_PATH = "/v1/systemone";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1_000_000;

export class HttpSystemOneProvider implements SystemOneProvider {
  readonly id: string;
  private readonly opts: Required<Pick<HttpSystemOneProviderOptions, "baseUrl" | "path" | "timeoutMs" | "maxResponseBytes">> & HttpSystemOneProviderOptions;
  constructor(options: HttpSystemOneProviderOptions) {
    if (!options?.baseUrl) throw new Error("baseUrl is required");
    this.id = options.id ?? "http";
    this.opts = {
      ...options,
      baseUrl: options.baseUrl.replace(/\/$/, ""),
      path: options.path ?? DEFAULT_PATH,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxResponseBytes: options.maxResponseBytes ?? DEFAULT_MAX_BYTES,
    };
  }
  async evaluate<Q extends QuestionMap>(request: SystemOneRequest<Q>, options?: SystemOneCallOptions): Promise<SystemOneResponse<Q>> {
    const started = Date.now();
    const fetchFn = this.opts.fetch ?? globalThis.fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    if (options?.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    try {
      const headers: Record<string, string> = { "content-type": "application/json", ...this.opts.headers };
      if (this.opts.apiKey) headers["Authorization"] = `Bearer ${this.opts.apiKey}`;
      const model = options?.model ?? request.model ?? this.opts.defaultModel;
      let res: Response;
      try {
        res = await fetchFn(`${this.opts.baseUrl}${this.opts.path}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ state: request.state, questions: request.questions, ...(model ? { model } : {}) }),
          signal: controller.signal,
        });
      } catch (e: any) {
        if (e?.name === "AbortError") throw new SystemOneTimeoutError(`request timed out after ${this.opts.timeoutMs}ms`);
        throw new SystemOneTransportError(e?.message ?? "transport failure");
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        throw new SystemOneHttpError(`provider error ${res.status}`, {
          status: res.status, provider: this.id, requestId: res.headers.get("x-request-id") ?? undefined,
        });
      }
      const text = await res.text();
      if (text.length > this.opts.maxResponseBytes) throw new SystemOneHttpError("response too large", { status: 200, provider: this.id });
      let json: unknown;
      try { json = JSON.parse(text); } catch { throw new SystemOneHttpError("invalid JSON", { status: 200, provider: this.id }); }
      const out = validateResponse(request.questions, json, this.id);
      out.metadata.latencyMs = Date.now() - started;
      return out;
    } finally {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types system-one-core/tests/http.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

---

### Task 7: Mock provider + public exports

**Files:**
- Create: `system-one-core/src/providers/mock.ts`
- Create: `system-one-core/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// inline check (add to client.test.ts or run node -e):
import { MockSystemOneProvider } from "../src/providers/mock.ts";
// should return canned answers with provider metadata
```

Full test:

```ts
// append to system-one-core/tests/client.test.ts in a new it() block:
it("mock provider returns canned answers", async () => {
  const { MockSystemOneProvider } = await import("../src/providers/mock.ts");
  const m = new MockSystemOneProvider({ id: "mock", answers: { q: { type: "noul", noul: 1 } } });
  const r = await m.evaluate({ state: "x", questions: { q: noul("Is it?") } });
  assert.equal((r.answers.q as any).noul, 1);
});
```

- [ ] **Step 2: Run to verify it fails** (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// system-one-core/src/providers/mock.ts
import type { QuestionMap } from "../questions.ts";
import type { SystemOneCallOptions, SystemOneProvider, SystemOneRequest } from "../provider.ts";
import type { SystemOneResponse } from "../responses.ts";

export class MockSystemOneProvider implements SystemOneProvider {
  readonly id: string;
  private readonly canned: Record<string, any>;
  constructor(options: { id?: string; answers: Record<string, any> }) {
    this.id = options.id ?? "mock";
    this.canned = options.answers;
  }
  async evaluate<Q extends QuestionMap>(request: SystemOneRequest<Q>, _options?: SystemOneCallOptions): Promise<SystemOneResponse<Q>> {
    const answers: Record<string, any> = {};
    for (const id of Object.keys(request.questions)) {
      if (!(id in this.canned)) throw new Error(`mock has no answer for ${id}`);
      answers[id] = this.canned[id];
    }
    return { answers: answers as any, metadata: { provider: this.id } };
  }
}
```

```ts
// system-one-core/src/index.ts
export * from "./types.ts";
export * from "./errors.ts";
export * from "./questions.ts";
export * from "./responses.ts";
export * from "./provider.ts";
export * from "./client.ts";
export * from "./validation.ts";
export { HttpSystemOneProvider } from "./providers/http.ts";
export type { HttpSystemOneProviderOptions } from "./providers/http.ts";
export { MockSystemOneProvider } from "./providers/mock.ts";
```

- [ ] **Step 4: Run full suite**

Run: `node --test --experimental-strip-types "system-one-core/tests/*.test.ts"`
Expected: all PASS. Run: `tsc --noEmit -p system-one-core` — clean.

- [ ] **Step 5: Commit**

---

### Task 8: Contract tests (env-gated) + release prep

**Files:**
- Create: `system-one-core/tests/contract.test.ts`

- [ ] **Step 1: Write contract test (skipped without env)**

```ts
// system-one-core/tests/contract.test.ts
import { describe, it } from "node:test";
import { HttpSystemOneProvider } from "../src/providers/http.ts";
import { SystemOne } from "../src/client.ts";
import { choice, noul, score } from "../src/questions.ts";

const cases = [
  ["reflex", process.env.SYSTEM_ONE_TEST_REFLEX === "1", process.env.SYSTEM_ONE_REFLEX_URL ?? "http://localhost:8008", undefined],
  ["typesafe", process.env.SYSTEM_ONE_TEST_TYPESAFE === "1", "https://api.typesafe.ai", process.env.TYPESAFE_API_KEY],
] as const;

for (const [name, enabled, baseUrl, apiKey] of cases) {
  describe(`contract:${name}`, { skip: !enabled }, () => {
    it("answers mixed batch with valid protocol", async () => {
      const s1 = new SystemOne({ provider: new HttpSystemOneProvider({ id: name, baseUrl, apiKey }) });
      const res = await s1.evaluate({
        state: "The export button crashes in Safari.",
        questions: {
          team: choice("Which team?", { frontend: null, backend: null }),
          browser: noul("Is this browser specific?"),
          level: score("How hard?", ["easy", "hard"] as const),
        },
      });
      if ((res.answers.team as any).type !== "choice") throw new Error("bad team");
      if ((res.answers.browser as any).type !== "noul") throw new Error("bad browser");
      if ((res.answers.level as any).type !== "score") throw new Error("bad level");
    });
  });
}
```

- [ ] **Step 2: Run default suite (contracts skip)**

Run: `node --test --experimental-strip-types "system-one-core/tests/*.test.ts"`
Expected: unit tests PASS, contract suites SKIP (0 fail).

- [ ] **Step 3: Publish dry-run, then real publish (2FA manual)**

Run: `npm --prefix system-one-core publish --dry-run 2>&1 | tail -n 15`
Expected: tarball lists `src/*.ts`, size small, no secrets.

Then (user runs, needs OTP like `pi-system-one`):

```bash
cd /Users/mak/git/system-one/system-one-core
npm publish --access public
# or: npm publish --access public --otp=123456
npm view system-one-core version
```

Expected: `0.1.0`.

---

## Self-Review

- Spec coverage: provider interface (§9), client (§10), state (§11), noul/choice/score (§12–15), builders (§16), typed mapping (§17), request (§18), response (§19), HTTP provider (§20), capabilities stub via interface (§23), validation (§24), errors (§25–26), retries=0/timeout/abort (§27–29), no fallbacks/thresholds (§30–31), security/size/observability/logging (§51–55), tests (§56–61 contract opt-in), perf/deps/ESM/versioning (§66–70), v0.1 scope (§71), non-goals excluded (§4, §72). Pi tool (§32–39) and Bifrost (§40–44) explicitly deferred.
- Placeholders: none — all steps show exact paths, code, commands.
- Type consistency: `SystemOneResponse.metadata.provider`, `AnswerFor`/`AnswersFor`, `HttpSystemOneProviderOptions` names match across tasks.
