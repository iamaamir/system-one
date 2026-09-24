# Provider Request Immutability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `system-one-core` provider request contracts readonly at the compile-time ownership boundary without runtime changes or a `JsonValue` redesign.

**Architecture:** Keep the existing generic `SystemOneRequest<Q>` as the sole request type. Make question interfaces, criteria containers, and request map fields readonly; add a mapped `ReadonlyQuestionMap<Q>` so inline object literals retain concrete question and response inference. Add a readonly-map overload to `validateResponse` so built-in providers can consume the view while returning `SystemOneResponse<Q>`.

**Tech Stack:** TypeScript 5.9 strict ESM, `node --test --experimental-strip-types`, Biome 2.5, npm workspaces. No new dependencies or runtime mechanisms.

---

## File Structure

Modify only these source/test files:

- `system-one-core/src/questions.ts` — readonly question contracts, builder bounds, broad `Question` union, and mapped request view.
- `system-one-core/src/provider.ts` — readonly `SystemOneRequest` fields using `ReadonlyQuestionMap<Q>`.
- `system-one-core/src/validation.ts` — type-only overloads for readonly mapped and ordinary question maps; implementation body remains unchanged.
- `system-one-core/tests/questions.test.ts` — compile-only positive and negative readonly assertions using the existing `@ts-expect-error` style.

Do not modify `src/types.ts`, `src/client.ts`, `src/providers/http.ts`, `src/providers/mock.ts`, `src/responses.ts`, or `pi-system-one/`.

### Task 1: Add failing readonly contract checks

**Files:**
- Modify: `system-one-core/tests/questions.test.ts:1-33`

- [ ] **Step 1: Add compile-only type fixtures**

Use the existing import block and add:

```ts
import type { SystemOne } from "../src/client.ts";
import type { SystemOneRequest } from "../src/provider.ts";
import {
  choice,
  type ChoiceQuestion,
  type ScoreQuestion,
  score,
} from "../src/questions.ts";
```

Define these functions after the imports and before `describe`:

```ts
type ReadonlyRequestQuestions = {
  choice: ChoiceQuestion<{ a: null; b: "b" }>;
  score: ScoreQuestion<readonly ["low", "high"]>;
};

function checkRequestReadonlyContract(): void {
  const choiceQuestion = choice("Which?", { a: null, b: "b" });
  const scoreQuestion = score("How?", ["low", "high"] as const);
  const request: SystemOneRequest<ReadonlyRequestQuestions> = {
    state: "state",
    questions: {
      choice: choiceQuestion,
      score: scoreQuestion,
    },
  };

  // @ts-expect-error - request slots are readonly
  request.state = "changed";
  // @ts-expect-error - request slots are readonly
  request.questions = {};
  // @ts-expect-error - request slots are readonly
  request.model = "changed";
  // @ts-expect-error - question map entries are readonly
  request.questions.choice = choiceQuestion;
  // @ts-expect-error - question fields are readonly
  request.questions.choice.instructions = "changed";
  // @ts-expect-error - question criteria are readonly
  request.questions.choice.criteria = {};
  // @ts-expect-error - choice criteria entries are readonly
  request.questions.choice.criteria.a = null;
  // @ts-expect-error - score criteria arrays are readonly
  request.questions.score.criteria.push("new");
  // @ts-expect-error - score criteria entries are readonly
  request.questions.score.criteria[0] = "new";
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

- [ ] **Step 2: Run typecheck to confirm the checks fail before implementation**

Run:

```bash
npm --workspace system-one-core run typecheck
```

Expected: FAIL because the current request and question types still allow the marked mutations.

- [ ] **Step 3: Commit the red test fixture**

```bash
git add system-one-core/tests/questions.test.ts
git commit -m "test(core): specify readonly provider request contract"
```

### Task 2: Make question and builder contracts readonly

**Files:**
- Modify: `system-one-core/src/questions.ts:1-43`

- [ ] **Step 1: Replace the question type and builder declarations**

Keep the existing file-level JSON-boundary suppression only if a remaining `any` requires it. The resulting declarations must be:

```ts
import type { JsonValue } from "./types.ts";

export interface NoulQuestion {
  readonly type: "noul";
  readonly instructions: JsonValue;
  readonly criteria?: Readonly<Record<string, JsonValue | null>>;
}

export interface ChoiceQuestion<
  T extends Readonly<Record<string, JsonValue | null>> =
    Readonly<Record<string, JsonValue | null>>,
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
export type ReadonlyQuestion = Question;
export type ReadonlyQuestionMap<Q extends QuestionMap = QuestionMap> = {
  readonly [K in keyof Q]: Readonly<Q[K]> & ReadonlyQuestion;
};

export function noul(
  instructions: JsonValue,
  criteria?: Readonly<Record<string, JsonValue | null>>,
): NoulQuestion {
  return criteria
    ? { type: "noul", instructions, criteria }
    : { type: "noul", instructions };
}

export function choice<const T extends Readonly<Record<string, JsonValue | null>>>(
  instructions: JsonValue,
  criteria: T,
): ChoiceQuestion<T> {
  return { type: "choice", instructions, criteria };
}

export function score<const T extends readonly JsonValue[]>(
  instructions: JsonValue,
  criteria: T,
): ScoreQuestion<T> {
  return { type: "score", instructions, criteria };
}
```

Mutable object and array inputs remain assignable to the readonly builder bounds. The broad `Question` union must use the default parameters above; do not use `any` there.

- [ ] **Step 2: Run the focused typecheck**

Run:

```bash
npm --workspace system-one-core run typecheck
```

Expected: remaining request-level mutation checks should still fail until Task 3, while builder inference and criteria checks pass.

- [ ] **Step 3: Commit the question contract change**

```bash
git add system-one-core/src/questions.ts
git commit -m "refactor(core): make question inputs readonly"
```

### Task 3: Apply the mapped readonly request boundary

**Files:**
- Modify: `system-one-core/src/provider.ts:1-8`
- Modify: `system-one-core/src/validation.ts:1-3,47-51`

- [ ] **Step 1: Update `SystemOneRequest`**

Import `ReadonlyQuestionMap` and use it for the questions slot:

```ts
import type { QuestionMap, ReadonlyQuestionMap } from "./questions.ts";

export interface SystemOneRequest<Q extends QuestionMap = QuestionMap> {
  readonly state: SystemOneState;
  readonly questions: ReadonlyQuestionMap<Q>;
  readonly model?: string;
}
```

Do not alter the provider method signature or response generic.

- [ ] **Step 2: Add `validateResponse` overloads**

Import `Question` and `ReadonlyQuestionMap` in `validation.ts`, then place these declarations immediately before the existing implementation signature:

```ts
export function validateResponse<Q extends QuestionMap>(
  questions: ReadonlyQuestionMap<Q>,
  raw: unknown,
  providerId: string,
): SystemOneResponse<Q>;

export function validateResponse<Q extends QuestionMap>(
  questions: Q,
  raw: unknown,
  providerId: string,
): SystemOneResponse<Q>;

export function validateResponse(
  questions: Readonly<Record<string, Question>>,
  raw: unknown,
  providerId: string,
): SystemOneResponse<QuestionMap> {
```

Keep the existing function body byte-for-byte apart from the overload boundary. The ordered mapped overload is required so `HttpSystemOneProvider` returns `SystemOneResponse<Q>` rather than a response keyed by the mapped view.

- [ ] **Step 3: Run typecheck and focused tests**

Run:

```bash
npm --workspace system-one-core run typecheck
npm --workspace system-one-core run test
```

Expected: all type-level directives are consumed, builder/runtime tests pass, and no provider or client casts are needed.

- [ ] **Step 4: Commit the request boundary change**

```bash
git add system-one-core/src/provider.ts system-one-core/src/validation.ts
git commit -m "refactor(core): enforce readonly provider requests"
```

### Task 4: Review the diff and audit scope

**Files:**
- Review: `system-one-core/src/questions.ts`
- Review: `system-one-core/src/provider.ts`
- Review: `system-one-core/src/validation.ts`
- Review: `system-one-core/tests/questions.test.ts`

- [ ] **Step 1: Inspect the complete diff**

Run:

```bash
rtk git status --short
rtk git diff origin/main...HEAD -- system-one-core .gitignore docs/superpowers/specs/2026-09-24-provider-request-readonly-design.md
```

Expected: only the design/setup commit, question/provider/validation types, and the focused test file are present. No `Object.freeze`, clone, normalization, HTTP, Mock, Pi, or fixture changes.

- [ ] **Step 2: Search for request mutations**

Run:

```bash
rg -n 'request\.(state|questions|model)\s*=|request\.questions\.[A-Za-z_$][\w$]*\s*=|\.criteria\.(push|pop|splice|shift|unshift)|delete\s+request\.' system-one-core pi-system-one bench
```

Expected: no request mutations. Existing writes to fresh response/header/normalization objects may appear and must be documented, not changed.

- [ ] **Step 3: Review generated declarations after the core build**

Run:

```bash
npm run build --workspace system-one-core
```

Inspect `system-one-core/dist/*.d.ts` for readonly request, question, map, and criteria declarations; do not commit generated `dist` files.

### Task 5: Run final validation

- [ ] **Step 1: Run the exact requested commands**

```bash
npm test
npm run typecheck
biome check .
npm run build --workspace system-one-core
```

Expected: all commands exit 0. `biome check .` must not rewrite files; run it without `--write`.

- [ ] **Step 2: Re-run the mutation audit and inspect repository status**

```bash
rg -n 'request\.(state|questions|model)\s*=|request\.questions\.[A-Za-z_$][\w$]*\s*=|\.criteria\.(push|pop|splice|shift|unshift)|delete\s+request\.' system-one-core pi-system-one bench
rtk git status --short
```

Expected: no request mutations and no unrelated files changed.

- [ ] **Step 3: Commit any validation-only formatting correction separately**

If Biome reports a formatting issue, run Biome only on the affected source/test files, review the diff, and commit:

```bash
git add system-one-core/src/questions.ts system-one-core/src/provider.ts system-one-core/src/validation.ts system-one-core/tests/questions.test.ts
git commit -m "style(core): format readonly request contracts"
```

Do not include generated `dist`, fixtures, dependency, or Pi files.

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
- `validateResponse` has a type-only mapped-map overload preserving response inference.

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
