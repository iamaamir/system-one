# Provider Request Immutability — Design

Date: 2026-09-24
Scope: `system-one-core` request and provider contracts

## Goal

Make the caller-to-provider request boundary explicitly read-only at compile time, with no runtime behavior changes. TypeScript `readonly` communicates ownership; it is not runtime freezing.

## Ownership boundary

```text
caller-owned request -> SystemOne -> provider
                              may read
                              must not mutate
```

The existing `SystemOneRequest` remains the only request type. No duplicate request type, dependency, runtime freezing, cloning, caching, or protocol behavior change is introduced.

## Contract changes

### Questions

- Mark every field of `NoulQuestion`, `ChoiceQuestion`, and `ScoreQuestion` readonly.
- Change `QuestionMap` to `Readonly<Record<string, Question>>`.
- Make Choice/Noul criteria contracts readonly records.
- Make Score criteria use a readonly array view while preserving tuple inference.
- Remove broad `any` parameters from the `Question` union and use default readonly-compatible parameterizations.
- Keep builder parameters compatible with ordinary mutable records and arrays. Builders continue returning the same inferred question kinds and response key types.

### Requests and providers

- Mark `SystemOneRequest.state`, `.questions`, and `.model` readonly.
- Add an exported mapped `ReadonlyQuestionMap<Q>` request view. It preserves concrete question types, exposes readonly question properties, and intersects broad question values with the readonly `Question` union.
- Use that view for `SystemOneRequest.questions`; retain `Q` for `SystemOneResponse<Q>` so inline request response inference is unchanged.
- Keep the existing generic `SystemOneProvider.evaluate` signature.

### Validation

Use one generic `validateResponse` signature whose questions parameter is `Q | ReadonlyQuestionMap<Q>` and whose return type is `SystemOneResponse<Q>`. The implementation signature remains broad for the unchanged validation body. This accepts ordinary generic maps and readonly request views without overload order sensitivity, explicit type arguments, or casts.

## Compatibility

- Mutable local objects and ordinary object literals remain assignable to readonly parameters.
- Builder construction remains ergonomic and retains Choice key and Score tuple inference.
- Inline request calls retain concrete response answer inference.
- Custom providers that mutate request slots, question fields, map entries, Choice criteria, or Score criteria will correctly fail to compile; that is the intended contract change.
- `pi-system-one` is not changed unless the rebuilt core declarations expose a source-compatibility issue.

## JSON boundary

`JsonValue`, `SystemOneState`, and nested JSON values remain unchanged and mutable. This PR does not introduce a deep JSON immutability redesign. Readonly request structures cover request slots, question maps, question fields, and criteria containers; nested JSON mutation remains an explicitly deferred concern.

## Runtime impact

None. No `Object.freeze`, `structuredClone`, JSON round-trip copy, or defensive request copy is added. Built-in HTTP and mock providers already read request data only.

## Type-level tests

Add compile-only assertions using the existing `@ts-expect-error` style for:

- replacing request slots or question-map entries;
- replacing question fields;
- assigning Choice criteria entries;
- mutating or indexing Score criteria arrays.

Add compile-only checks that ordinary `validateResponse(q: Q, ...)` calls return `SystemOneResponse<Q>` and that an external `SystemOneRequest<Q>` wrapper calling `validateResponse(request.questions, ...)` preserves `Q`, alongside positive checks for ordinary mutable construction, builder outputs, and inline response-key inference. Existing runtime tests should remain behaviorally unchanged.

## Mutation audit

The repository audit found no request mutations in `system-one-core` or `pi-system-one`. HTTP writes only fresh header/output metadata; Mock and validation write fresh answer objects; Pi normalization writes fresh outputs while sharing canonical inputs.

## Validation

Run:

```text
npm test
npm run typecheck
biome check .
npm run build --workspace system-one-core
```

Also rebuild core before validating Pi, because `pi-system-one` consumes the generated core declarations and runtime.

## Deferred

- Deep readonly projection of `JsonValue` and nested state/instructions/criteria.
- A global JSON immutability redesign.
- Readonly response contracts or repository-wide immutable collection types.
- Runtime enforcement against JavaScript code using `any`, casts, reflection, or untyped custom providers.
