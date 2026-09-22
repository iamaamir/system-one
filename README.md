# System One for Pi

A provider-neutral System One runtime for TypeScript and Pi. System One is the abstraction — providers implement it, Pi exposes it, Pi-Bifrost consumes it.

## Packages

| Package | npm | What it is |
|---|---|---|
| `system-one-core` | `system-one-core` | Provider-neutral runtime: `SystemOneProvider` interface, `SystemOne` client, `choice`/`noul`/`score` builders with inferred answers, one `HttpSystemOneProvider` for any `/v1/systemone` endpoint, fail-closed validation, mock provider |
| `pi-system-one` | `pi-system-one` | Pi extension registering the `system_one` LLM tool (batched heterogeneous questions, env config, human-readable results) |

Dependency direction: `pi-system-one` → `system-one-core`. Nothing here depends on routing, model tiers, or Bifrost policy.

## Quickstart

```ts
import { SystemOne, HttpSystemOneProvider, choice, noul } from "system-one-core";

const systemOne = new SystemOne({
  provider: new HttpSystemOneProvider({ baseUrl: "http://localhost:8008" }),
});

const result = await systemOne.evaluate({
  state: "The export button crashes in Safari.",
  questions: {
    team: choice("Which team should investigate?", { frontend: null, backend: null }),
    browser: noul("Is this bug browser specific?"),
  },
});
```

TypeSafe Jev: same code, `baseUrl: "https://api.typesafe.ai"`, `apiKey`, `model: "jev-latest"`.

Pi: `pi install npm:pi-system-one`, then `export SYSTEM_ONE_BASE_URL=http://localhost:8008`.

## Develop

```bash
npm install          # workspaces
npm test             # all unit tests (live contracts opt-in via env)
npm run typecheck
```

Live contract tests (skipped by default): `SYSTEM_ONE_TEST_TYPESAFE=1` (+ `TYPESAFE_API_KEY`) and `SYSTEM_ONE_TEST_REFLEX=1` (+ local server on `:8008`).

## Related

- `pi-bifrost` (separate repo, symlinked here untracked for reference): consumes `system-one-core` for model routing
- [Reflex](https://github.com/kshetrajna12/reflex): open local System One implementation
