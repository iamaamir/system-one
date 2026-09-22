# System One for TypeScript

> **Write the decision once. Run it on any System One provider.**

`system-one` is a small, provider-neutral TypeScript runtime for bounded AI decisions.

Use **TypeSafe Jev** today, **Reflex** locally, any compatible `/v1/systemone` endpoint, or your own `SystemOneProvider` tomorrow. Your application keeps the same `choice`, `noul`, and `score` code.

**System One is the abstraction. Providers are implementation details.**

[Website](https://iamaamir.github.io/system-one/) · [Pi integration](./pi-system-one) · [Pi-Bifrost](https://github.com/iamaamir/pi-bifrost)

---

## Why this exists

System One is already becoming an ecosystem.

Different implementations can make the same kind of bounded decision:

```text
                         +-- TypeSafe Jev
                         +-- Reflex
application / agent ---> |-- compatible /v1/systemone endpoint
                         +-- custom SystemOneProvider
```

Your application should not have to couple itself to whichever provider it starts with.

`system-one` gives the application a stable boundary:

```text
                    SystemOneProvider
                           |
                           v
                      SystemOne
                    /     |     \
               choice    noul   score
                           |
                           v
              application / agent / router
```

Change the provider. Keep the decision code.

---

## What it is

`system-one` owns the **mechanism**:

- a provider-neutral `SystemOneProvider` interface
- one `SystemOne` client
- typed `choice`, `noul`, and `score` builders
- heterogeneous questions over shared state
- HTTP support for compatible `/v1/systemone` endpoints
- strict, fail-closed protocol validation
- deterministic mock providers for tests

It deliberately does **not** own policy:

- no routing strategy
- no model tiers
- no confidence thresholds
- no automatic escalation
- no hidden retries or fallback behavior

Those decisions belong to the application.

For example, [Pi-Bifrost](https://github.com/iamaamir/pi-bifrost) consumes `system-one-core` for routing, but routing is not part of the core runtime.

> Jev-focused libraries make Jev easier to use.  
> `system-one` makes the underlying System One provider replaceable.

---

## Packages

| Package | npm | What it is |
|---|---|---|
| `system-one-core` | `system-one-core` | Provider-neutral runtime: `SystemOneProvider`, `SystemOne`, typed builders, compatible HTTP provider, strict validation, and deterministic test support |
| `pi-system-one` | `pi-system-one` | Pi extension exposing one `system_one` tool for batched `choice`, `noul`, and `score` decisions |

Dependency direction stays one-way:

```text
                 system-one-core
                       ^
                       |
                 pi-system-one
```

Pi-Bifrost is a separate consumer:

```text
                 system-one-core
                    ^        ^
                    |        |
          pi-system-one   pi-bifrost
```

Nothing in `system-one-core` depends on Pi, routing, Bifrost, or a specific model vendor.

---

## Tested providers

### TypeSafe Jev

Tested against `jev-latest` (resolved `jev-1.13.0`):

- live contract tests
- golden fixtures
- end-to-end Pi agent run

### Reflex

Tested locally with `Qwen3.5-2B`:

- live contract tests
- golden fixtures
- end-to-end Pi agent run

Same client. Same provider class. Only configuration changes.

> Compatibility with other `/v1/systemone` implementations is protocol-level unless explicitly listed here as tested.

---

## Quickstart

Install the core runtime:

```bash
npm install system-one-core
```

Create the questions once:

```ts
import {
  SystemOne,
  HttpSystemOneProvider,
  choice,
  noul,
  score,
} from "system-one-core";

const provider = new HttpSystemOneProvider({
  baseUrl: "http://localhost:8008",
});

const systemOne = new SystemOne({ provider });

const result = await systemOne.evaluate({
  state: "The export button crashes in Safari.",
  questions: {
    team: choice("Which team should investigate?", {
      frontend: null,
      backend: null,
    }),
    browserSpecific: noul("Is this bug browser specific?"),
    severity: score("How severe is the impact?", [
      "minor",
      "degraded",
      "blocking",
    ]),
  },
});

console.log(result.answers);
```

That example can use Reflex locally.

To use TypeSafe Jev, keep the evaluation code and change the provider configuration:

```ts
const provider = new HttpSystemOneProvider({
  baseUrl: "https://api.typesafe.ai",
  apiKey: process.env.TYPESAFE_API_KEY,
  model: "jev-latest",
});
```

The rest of the application stays the same.

---

## Bring your own provider

HTTP is only one provider implementation.

Anything can implement the boundary:

```ts
interface SystemOneProvider {
  evaluate(request: SystemOneRequest): Promise<SystemOneResponse>;
}
```

That means the runtime can sit in front of:

- a hosted System One service
- a local model server
- a compatible `/v1/systemone` endpoint
- an in-process implementation
- a deterministic test double

The runtime normalizes the boundary. It does not decide which provider is "best" for your application.

---

## Pi

Install the Pi extension:

```bash
pi install npm:pi-system-one
```

Point it at a local compatible provider:

```bash
export SYSTEM_ONE_BASE_URL=http://localhost:8008
```

Or configure TypeSafe Jev:

```bash
export SYSTEM_ONE_BASE_URL=https://api.typesafe.ai
export SYSTEM_ONE_API_KEY=YOUR_KEY
export SYSTEM_ONE_MODEL=jev-latest
```

`pi-system-one` registers one `system_one` tool and exposes the same bounded decision surface to the agent.

Source: [`pi-system-one`](./pi-system-one)

---

## Why not just use a provider SDK directly?

You can.

If your application is intentionally tied to one provider, the provider's SDK may be the simplest option.

`system-one` becomes useful when you want this dependency direction:

```text
your application
      |
      v
SystemOneProvider
      |
      +-- Jev
      +-- Reflex
      +-- compatible endpoint
      +-- custom implementation
```

instead of:

```text
your application
      |
      v
specific provider SDK
```

The goal is not to hide System One. The goal is to make its implementation replaceable.

---

## Design principles

**Provider-neutral**  
Application code depends on the System One primitive, not a vendor.

**Protocol-first**  
Compatible `/v1/systemone` implementations can sit behind the same HTTP provider.

**Typed**  
Question builders infer the answer shape they produce.

**Policy-free**  
Thresholds, escalation, routing, retries, and fallback stay outside the core.

**Fail-closed**  
Malformed provider responses are rejected instead of being silently normalized into something plausible.

**Testable**  
Deterministic providers make bounded-decision code testable without a live model.

---

## Develop

```bash
npm install          # workspaces
npm test             # all unit tests
npm run typecheck
```

Live contract tests are skipped by default.

TypeSafe:

```bash
SYSTEM_ONE_TEST_TYPESAFE=1
TYPESAFE_API_KEY=...
```

Reflex:

```bash
SYSTEM_ONE_TEST_REFLEX=1
# local Reflex server on :8008
```

---

## Related

- [system-one website](https://iamaamir.github.io/system-one/)
- [pi-system-one](./pi-system-one)
- [pi-bifrost](https://github.com/iamaamir/pi-bifrost) - model routing for Pi; consumes `system-one-core`
- [TypeSafe JavaScript SDK](https://github.com/typesafe-ai/typesafe-sdk-js) - official TypeSafe API SDK
- [Reflex](https://github.com/kshetrajna12/reflex) - open/local Jev / System One recreation

---

## Positioning in one sentence

> **A small provider-neutral TypeScript runtime for System One: write the decision once, then run it on Jev, Reflex, compatible endpoints, or your own provider.**
