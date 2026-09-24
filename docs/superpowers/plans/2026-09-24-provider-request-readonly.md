# Provider Request Immutability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]` / `- [x]`) syntax for tracking.

**Goal:** Make `system-one-core` provider request contracts readonly at the compile-time ownership boundary without runtime changes or a `JsonValue` redesign.

**Architecture:** Keep the existing generic `SystemOneRequest<Q>` as the sole request type. Make question interfaces, criteria containers, and request map fields readonly; add a conditional `ReadonlyQuestion<T>` helper and mapped `ReadonlyQuestionMap<Q>` so inline object literals retain concrete question and response inference. Give `validateResponse` one union parameter (`Q | ReadonlyQuestionMap<Q>`) so ordinary maps and provider request views both return `SystemOneResponse<Q>`.

**Tech Stack:** TypeScript 5.9 strict ESM, `node --test --experimental-strip-types`, Biome 2.5, npm workspaces. No new dependencies or runtime mechanisms.

---

## File Structure

The completed change set contains exactly these files:

- `.gitignore:12` — ignore local worktree setup metadata.
- `docs/superpowers/plans/2026-09-24-provider-request-readonly.md` — this implementation record.
- `docs/superpowers/specs/2026-09-24-provider-request-readonly-design.md` — the ownership and compatibility design.
- `system-one-core/src/questions.ts` — readonly question contracts, builder bounds, broad `Question` union, conditional `ReadonlyQuestion<T>`, and mapped request view.
- `system-one-core/src/provider.ts` — readonly `SystemOneRequest` fields using `ReadonlyQuestionMap<Q>`.
- `system-one-core/src/validation.ts` — the public union signature for ordinary and readonly mapped question maps; the validation body remains unchanged.
- `system-one-core/tests/questions.test.ts` — compile-only readonly checks plus positive builder, inference, and construction coverage.
- `system-one-core/tests/validation.test.ts` — ordinary generic and external `SystemOneRequest<Q>` wrapper inference regressions.

No HTTP runtime file changed. `system-one-core/src/providers/http.ts:330` already calls `validateResponse(request.questions, json, this.id)` without an explicit type argument. `src/types.ts`, `src/client.ts`, `src/providers/mock.ts`, `src/responses.ts`, `pi-system-one/`, fixtures, and benchmarks are also unchanged.

### Task 1: Add failing readonly contract checks

**Files:**
- Modify: `system-one-core/tests/questions.test.ts:1-138`

- [x] **Step 1: Add compile-only type fixtures**

The committed fixture uses a mutable widened `ScoreQuestion<string[]>` criteria type, includes Choice, Score, and Noul request checks, and retains positive inline response-inference and mutable-construction checks:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SystemOne } from "../src/client.ts";
import type { SystemOneRequest } from "../src/provider.ts";
import {
  type ChoiceQuestion,
  choice,
  type NoulQuestion,
  noul,
  type ScoreQuestion,
  score,
} from "../src/questions.ts";

type ReadonlyRequestQuestions = {
  choice: ChoiceQuestion<{ a: null; b: "b" }>;
  score: ScoreQuestion<string[]>;
  noul: NoulQuestion;
};

function checkRequestReadonlyContract(): void {
  const choiceQuestion = choice("Which?", { a: null, b: "b" });
  const scoreCriteria: string[] = ["low", "high"];
  const scoreQuestion = score("How?", scoreCriteria);
  const noulQuestion = noul("Is it hard?", {
    coding: "impl",
    research: null,
  });
  const request: SystemOneRequest<ReadonlyRequestQuestions> = {
    state: "state",
    questions: {
      choice: choiceQuestion,
      score: scoreQuestion,
      noul: noulQuestion,
    },
  };

  // @ts-expect-error - request slots are readonly
  request.state = "changed";
  // @ts-expect-error - request slots are readonly
  request.questions = {
    choice: choiceQuestion,
    score: scoreQuestion,
    noul: noulQuestion,
  };
  // @ts-expect-error - request slots are readonly
  request.model = "changed";
  // @ts-expect-error - question map entries are readonly
  request.questions.choice = choiceQuestion;
  // @ts-expect-error - question fields are readonly
  request.questions.choice.instructions = "changed";
  // @ts-expect-error - question criteria are readonly
  request.questions.choice.criteria = choiceQuestion.criteria;
  // @ts-expect-error - choice criteria entries are readonly
  request.questions.choice.criteria.a = null;
  // @ts-expect-error - score criteria arrays are readonly
  request.questions.score.criteria.push("new");
  // @ts-expect-error - score criteria entries are readonly
  request.questions.score.criteria[0] = "new";
  // @ts-expect-error - noul question fields are readonly
  request.questions.noul.instructions = "changed";
  // @ts-expect-error - noul criteria are readonly
  request.questions.noul.criteria = noulQuestion.criteria;
  if (request.questions.noul.criteria) {
    // @ts-expect-error - noul criteria entries are readonly
    request.questions.noul.criteria.coding = "changed";
  }
  void request;
}

async function checkInlineResponseInference(client: SystemOne) {
  const result = await client.evaluate({
    state: "state",
    questions: {
      c: {
        type: "choice",
        instructions: "Which?",
        criteria: { a: null, b: null },
      },
      s: {
        type: "score",
        instructions: "How severe?",
        criteria: ["low", "high"],
      },
    },
  });
  const choice: "a" | "b" = result.answers.c.choice;
  const score: number = result.answers.s.score;
  return { choice, score };
}

function checkMutableConstruction() {
  const questions = {
    c: {
      type: "choice" as const,
      instructions: "Which?",
      criteria: { a: null, b: null },
    },
  };
  const request: SystemOneRequest = {
    state: "state",
    questions,
  };
  void request;
}

void checkRequestReadonlyContract;
void checkInlineResponseInference;
void checkMutableConstruction;
```

Coverage includes readonly request slots, question-map entries, Choice and Noul fields/criteria, Choice criteria entries, Score array methods and indexed assignment, positive inline response-key/number inference, and positive mutable request construction.

- [x] **Step 2: Run typecheck to confirm the checks fail before implementation**

Run:

```bash
npm --workspace system-one-core run typecheck
```

Completed: the red fixture exposed the mutable contracts before implementation; the final typecheck passes with every `@ts-expect-error` directive consumed.

- [x] **Step 3: Commit the red test fixture**

Completed in commits `4f5bd7a` and `a9f89ed` with message `test(core): specify readonly provider request contract` and its strengthening follow-up.

### Task 2: Make question and builder contracts readonly

**Files:**
- Modify: `system-one-core/src/questions.ts:1-63`

- [x] **Step 1: Replace the question type and builder declarations**

The committed implementation is:

```ts
import type { JsonValue } from "./types.ts";

export interface NoulQuestion {
  readonly type: "noul";
  readonly instructions: JsonValue;
  readonly criteria?: Readonly<Record<string, JsonValue | null>>;
}

export interface ChoiceQuestion<
  T extends Readonly<Record<string, JsonValue | null>> = Readonly<
    Record<string, JsonValue | null>
  >,
> {
  readonly type: "choice";
  readonly instructions: JsonValue;
  readonly criteria: Readonly<T>;
}

export interface ScoreQuestion<
  T extends readonly JsonValue[] = readonly JsonValue[],
> {
  readonly type: "score";
  readonly instructions: JsonValue;
  readonly criteria: Readonly<T>;
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type QuestionMap = Readonly<Record<string, Question>>;
type ReadonlyQuestionFields<T extends Question> = {
  readonly [P in keyof T]: P extends "criteria" ? Readonly<T[P]> : T[P];
};
export type ReadonlyQuestion<T extends Question = Question> =
  ReadonlyQuestionFields<T> &
    (T extends ChoiceQuestion<infer C>
      ? ChoiceQuestion<C>
      : T extends ScoreQuestion<infer C>
        ? ScoreQuestion<C>
        : NoulQuestion);
export type ReadonlyQuestionMap<Q extends QuestionMap = QuestionMap> = {
  readonly [K in keyof Q]: ReadonlyQuestion<Q[K]>;
};

export function noul(
  instructions: JsonValue,
  criteria?: Readonly<Record<string, JsonValue | null>>,
): NoulQuestion {
  return criteria
    ? { type: "noul", instructions, criteria }
    : { type: "noul", instructions };
}

export function choice<
  const T extends Readonly<Record<string, JsonValue | null>>,
>(instructions: JsonValue, criteria: T): ChoiceQuestion<T> {
  return { type: "choice", instructions, criteria };
}

export function score<const T extends readonly JsonValue[]>(
  instructions: JsonValue,
  criteria: T,
): ScoreQuestion<T> {
  return { type: "score", instructions, criteria };
}
```

Mutable object and array inputs remain assignable to the readonly builder bounds, and the broad `Question` union uses readonly-compatible defaults without `any`.

- [x] **Step 2: Run the focused typecheck**

Run:

```bash
npm --workspace system-one-core run typecheck
```

Completed successfully: builder inference and criteria checks pass, with the request-level directives now consumed by the readonly contracts.

- [x] **Step 3: Commit the question contract change**

Completed in commits `28ea821` and `973c035`.

### Task 3: Apply the mapped readonly request boundary

**Files:**
- Modify: `system-one-core/src/provider.ts:1-8`
- Modify: `system-one-core/src/validation.ts:3-7,51-60`
- Modify: `system-one-core/tests/validation.test.ts:1-24`

- [x] **Step 1: Update `SystemOneRequest`**

The committed request boundary is:

```ts
import type { QuestionMap, ReadonlyQuestionMap } from "./questions.ts";

export interface SystemOneRequest<Q extends QuestionMap = QuestionMap> {
  readonly state: SystemOneState;
  readonly questions: ReadonlyQuestionMap<Q>;
  readonly model?: string;
}
```

The provider method signature and `SystemOneResponse<Q>` generic remain unchanged.

- [x] **Step 2: Add the union `validateResponse` signature and wrapper regression**

The public signature accepts either an ordinary map or its readonly request view while preserving the concrete response generic:

```ts
export function validateResponse<Q extends QuestionMap>(
  questions: Q | ReadonlyQuestionMap<Q>,
  raw: unknown,
  providerId: string,
): SystemOneResponse<Q>;

export function validateResponse(
  questions: Readonly<Record<string, Question>>,
  raw: unknown,
  providerId: string,
): SystemOneResponse<QuestionMap> {
```

The implementation signature stays broad and the validation body is unchanged. `system-one-core/tests/validation.test.ts:9-24` adds compile-only regressions for both paths:

```ts
function checkGenericValidationInference<Q extends QuestionMap>(
  questions: Q,
  raw: unknown,
): SystemOneResponse<Q> {
  return validateResponse(questions, raw, "p");
}

function checkRequestValidationInference<Q extends QuestionMap>(
  request: SystemOneRequest<Q>,
  raw: unknown,
): SystemOneResponse<Q> {
  return validateResponse(request.questions, raw, "p");
}
```

`system-one-core/src/providers/http.ts:330` is unchanged and already calls `validateResponse(request.questions, json, this.id)` without an explicit type argument; no HTTP runtime change was required.

- [x] **Step 3: Run typecheck and focused tests**

Run:

```bash
npm --workspace system-one-core run typecheck
npm --workspace system-one-core run test
```

Completed successfully: all type-level directives are consumed and the core test suite passes.

- [x] **Step 4: Commit the request boundary change**

Completed in commits `85460e5`, `90e89e8`, and `0d6ac65`; no HTTP source file was changed.

### Task 4: Review the diff and audit scope

**Files:**
- Review: `.gitignore:12`
- Review: `docs/superpowers/plans/2026-09-24-provider-request-readonly.md`
- Review: `docs/superpowers/specs/2026-09-24-provider-request-readonly-design.md`
- Review: `system-one-core/src/questions.ts`
- Review: `system-one-core/src/provider.ts`
- Review: `system-one-core/src/validation.ts`
- Review: `system-one-core/tests/questions.test.ts`
- Review: `system-one-core/tests/validation.test.ts`
- Read-only verification: `system-one-core/src/providers/http.ts:330` (unchanged)

- [x] **Step 1: Inspect the complete diff**

Run:

```bash
rtk git status --short
rtk git diff origin/main...HEAD -- .gitignore docs/superpowers/plans/2026-09-24-provider-request-readonly.md docs/superpowers/specs/2026-09-24-provider-request-readonly-design.md system-one-core/src/questions.ts system-one-core/src/provider.ts system-one-core/src/validation.ts system-one-core/tests/questions.test.ts system-one-core/tests/validation.test.ts
```

Completed: the final change set is limited to the eight listed paths. HTTP, Mock, client, `JsonValue`, Pi, fixtures, and benchmark paths are unchanged.

- [x] **Step 2: Search for request mutations**

Run:

```bash
rg -n 'request\.(state|questions|model)\s*=|request\.questions\.[A-Za-z_$][\w$]*\s*=|\.criteria\.(push|pop|splice|shift|unshift)|delete\s+request\.' system-one-core pi-system-one bench
```

Completed: there are no production request mutations. The compile-only expected-error writes in `system-one-core/tests/questions.test.ts:38-65` and the plan examples are not runtime behavior. Writes to fresh HTTP header/body/response objects, Mock/validation answer objects, and Pi normalization outputs are distinct and do not mutate requests.

- [x] **Step 3: Review generated declarations after the core build**

Run:

```bash
npm run build --workspace system-one-core
```

Completed: the build exits successfully and leaves ignored declarations in `system-one-core/dist/`. Readonly question/map/criteria declarations are in `dist/questions.d.ts:2-28`, request slots are in `dist/provider.d.ts:4-8`, and the union validation signature is in `dist/validation.d.ts:3`; `dist/types.d.ts:1-5` confirms `JsonValue` remains mutable and unchanged.

### Task 5: Run final validation

- [x] **Step 1: Run the exact requested commands**

```bash
npm test
npm run typecheck
biome check .
npm run build --workspace system-one-core
```

Expected: all commands exit 0. `biome check .` must not rewrite files; run it without `--write`.

- [x] **Step 2: Re-run the mutation audit and inspect repository status**

```bash
rg -n 'request\.(state|questions|model)\s*=|request\.questions\.[A-Za-z_$][\w$]*\s*=|\.criteria\.(push|pop|splice|shift|unshift)|delete\s+request\.' system-one-core pi-system-one bench
rtk git status --short
```

Expected: no request mutations and no unrelated files changed.

- [x] **Step 3: No formatting correction was required**

Biome reported no fixes; no generated `dist`, fixtures, dependency, or Pi files were changed.

### Task 6: Open the PR

- [ ] **Step 1: Confirm branch and commits**

```bash
rtk git status --short --branch
rtk git log --oneline --decorate -6
```

Expected: branch `api/readonly-provider-requests` contains the design, type, and test commits and has no uncommitted files.

- [ ] **Step 2: Push the branch**

```bash
rtk git push -u origin api/readonly-provider-requests
```

- [ ] **Step 3: Write the PR body**

Write `/tmp/system-one-provider-readonly-pr-body.md` with these sections and the final command results:

```md
## Contract changes

- `SystemOneRequest` request slots are readonly and use `ReadonlyQuestionMap<Q>`.
- `NoulQuestion`, `ChoiceQuestion`, `ScoreQuestion`, `QuestionMap`, Choice/Noul criteria, and Score criteria are readonly.
- `validateResponse` accepts `Q | ReadonlyQuestionMap<Q>` and returns `SystemOneResponse<Q>`.

## Compatibility

Ordinary mutable object literals remain assignable; builder key/tuple inference and inline response inference are preserved.

## Mutation audit

No request mutations were found in `system-one-core` or `pi-system-one`.

## Runtime impact

None.

## Tests

Compile-only readonly checks cover request slots, question-map entries, question fields, Choice criteria, and Score criteria; positive construction/inference checks were retained.

## Validation

Record the exact results of `npm test`, `npm run typecheck`, `biome check .`, and `npm run build --workspace system-one-core`.

## Deferred

Deep readonly JSON projection, global `JsonValue` redesign, readonly responses, and runtime enforcement remain out of scope.
```

- [ ] **Step 4: Create the PR against `main`**

```bash
gh pr create --base main --head api/readonly-provider-requests --title "refactor(core): make provider requests readonly" --body-file /tmp/system-one-provider-readonly-pr-body.md
```

The PR body must separately report contract changes, compatibility, mutation audit, runtime impact, type-level tests, exact validation commands/results, and deferred deep-JSON immutability work. Do not claim success until the commands above have passed.
