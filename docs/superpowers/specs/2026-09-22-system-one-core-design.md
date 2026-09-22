# System One Core v0.1 — Design

Date: 2026-09-22
Source: `System-one-design.md` (build-ready spec, 3447 lines)
Scope: v0.1 core runtime only (spec Phase 1–4). Pi extension and Bifrost migration deferred.

## 1. Architecture

Monorepo root: `/Users/mak/git/system-one` (currently not a git repo).

Layout:

```text
/Users/mak/git/system-one/
  package.json            # workspaces: ["system-one-core", "pi-system-one"]
  tsconfig.base.json
  System-one-design.md    # full source spec
  docs/superpowers/specs/ # this file
  system-one-core/        # NEW — provider-neutral runtime (this design)
  pi-system-one/          # EXISTING — Pi extension (placeholder 1.0.0, untouched in v0.1 core)
  pi-bifrost -> ../pi-bifrost  # symlink, reference only, never built here
```

Dependency direction:

```text
pi-system-one --> system-one-core
pi-bifrost  --> system-one-core (future migration, outside v0.1)
```

`system-one-core` has zero dependency on Pi. No routing, tiers, fallback, escalation, or threshold concepts in core.

Tooling follows `pi-bifrost` patterns: `type: module`, `NodeNext`, `ES2022`, `strict` + `noUnusedLocals`, `node --test --experimental-strip-types`, `tsc --noEmit`.

## 2. Components (public API kept small)

```ts
SystemOne
SystemOneProvider
HttpSystemOneProvider
MockSystemOneProvider

choice
noul
score

SystemOneRequest
SystemOneResponse

SystemOneError
SystemOneConfigurationError
SystemOneTransportError
SystemOneTimeoutError
SystemOneHttpError
SystemOneProtocolError
SystemOneCapabilityError
```

- `SystemOneProvider.evaluate<Q>(request, options?: { signal? })`
- `SystemOne` client wraps a provider, exposes `evaluate()`.
- Builders preserve literal types so `answers.route.choice` infers `"cheap" | "balanced" | ...`, not `string`.
- `HttpSystemOneProvider` options: `id?`, `baseUrl`, `path?` (default `/v1/systemone`), `apiKey?`, `headers?`, `defaultModel?`, `timeoutMs?` (default 10000), `fetch?`, `maxResponseBytes?` (default 1MB), `retry?`.
- One HTTP implementation serves TypeSafe Jev, Reflex, and any compatible endpoint. No `JevProvider` / `ReflexProvider` classes. Convenience presets allowed only as factory functions returning `HttpSystemOneProvider`.
- `MockSystemOneProvider` takes canned answers keyed by question id for deterministic downstream tests.

## 3. Data flow

```text
evaluate({ state, questions, model? })
  -> require >= 1 question
  -> serialize preserving structured state (no premature stringify)
  -> POST { state, questions, model? } to {baseUrl}{path}
  -> enforce maxResponseBytes, timeout, AbortSignal
  -> parse JSON
  -> fail-closed validation (throw SystemOneProtocolError)
  -> return { model?, answers, usage?, requestId?, metadata: { provider, latencyMs? } }
```

Validation: response is JSON; `answers` exists; every requested id present with matching type; numbers finite; probabilities in [0,1]; choice selected in criteria + probability per option + confidence in [0,1]; noul in [0,1] (no separate confidence); score finite + legend + valid probabilities + confidence. Never renormalize, repair, or guess.

No hidden fallbacks, no hidden thresholds. Consumers own policy.

## 4. Error handling

Hierarchy with machine-readable `code` (e.g. `SYSTEM_ONE_TIMEOUT`). `SystemOneHttpError` carries status, provider id, request id, retry-after — never Authorization headers, API keys, or env dumps. Displayed config shows `API key: configured`, never the value. Plain HTTP allowed for localhost; warn on remote non-TLS. Retries default 0; opt-in only for 429/502/503/504 or transient network; never for 400/401/403 or protocol errors. Timeout throws `SystemOneTimeoutError`. Cancellation propagates to `fetch`. Core is silent by default (no stdout); optional logger injection later.

## 5. Testing

- Unit: builders, serialization, answer mapping/inference, errors, timeout, abort.
- Protocol fixtures: valid choice/noul/score/mixed + missing answer, wrong type, unknown choice, NaN, Infinity, out-of-range probability, missing probability, malformed legend, missing answers, invalid JSON — all throw deterministic protocol errors.
- HTTP: local mock server; assert path, body, Authorization, custom headers, default vs per-request model, timeout, abort, 400/401/429/500 mapping, no secret leakage. No live APIs in normal CI.
- Contract (opt-in via env only): same mixed batch against Reflex (`SYSTEM_ONE_TEST_REFLEX=1`, `SYSTEM_ONE_REFLEX_URL`) and TypeSafe (`SYSTEM_ONE_TEST_TYPESAFE=1`, `TYPESAFE_API_KEY`); assert protocol shape, never exact probabilities.

## 6. Definition of done (v0.1 core)

This code works unchanged against both Reflex and TypeSafe Jev with only `baseUrl`/`apiKey`/`model` changed, covering a mixed `choice` + `noul` + `score` batch. `pi-system-one` placeholder untouched. `pi-bifrost` untouched (symlink reference only).

## 7. Explicitly deferred

Pi `system_one` tool, Bifrost `SystemOneRouter`, profiles/commands, fallback chains, discovery, benchmarks, and everything in spec §72. v0.2+ candidates per spec §73–74.

## 8. Naming decision

`system-one` taken, `sysone` taken. Approved: reserve/publish `system-one-core` (unscoped) for this runtime. `pi-system-one` remains the Pi extension name. No `@scope` unless a future org is created.
