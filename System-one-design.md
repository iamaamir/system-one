Below is the handoff document. It is written as an implementation specification rather than a discussion, so another coding model should be able to start from it directly.

# System One for Pi

## Architecture and Implementation Specification

**Status:** Build-ready design  
**Target:** TypeScript / Node.js / Pi  
**Initial providers:** TypeSafe Jev and Reflex  
**Primary consumers:** Pi agents and Pi-Bifrost  
**Architecture principle:** System One is the capability. Jev, Reflex, and future models are implementations.

---

# 1. Executive Summary

We want to build a provider-neutral **System One runtime** that can be used independently inside Pi and consumed by Pi-Bifrost for model routing.

The system must not be designed around Jev specifically.

The conceptual model is:

```text
                         System One
                             |
                    provider abstraction
                             |
              +--------------+--------------+
              |              |              |
             Jev           Reflex        future
          TypeSafe          local        providers
              |              |              |
              +------- /v1/systemone -------+
```

Pi receives System One as a general decision primitive:

```text
Pi Agent
   |
   +-- normal LLM inference
   |
   +-- tools
   |
   +-- system_one
           |
           +-- choice
           +-- noul
           +-- score
```

Pi-Bifrost becomes one consumer of this primitive:

```text
User request
     |
     v
 Pi-Bifrost
     |
     v
 System One
     |
     +--> Jev
     +--> Reflex
     +--> compatible endpoint
     |
     v
 routing decision
     |
     v
 selected model
```

The critical dependency direction is:

```text
System One core
       ^
       |
  Pi extension
```

and:

```text
System One core
       ^
       |
   Pi-Bifrost
```

Never:

```text
System One <----> Pi-Bifrost
```

The System One packages must know nothing about routing, model tiers, Bifrost policies, escalation logic, or which generative models Pi-Bifrost routes toward.

---

# 2. Problem

Pi-Bifrost already supports Jev as a model router.

However, Jev is only one implementation of a broader inference pattern:

```text
state
  +
bounded typed questions
  +
known answer space
  |
  v
probability distributions
  |
  v
deterministic application logic
```

Open implementations such as Reflex are beginning to implement the same System One interface.

Reflex deliberately exposes:

```text
POST /v1/systemone
```

and uses the same request/response shape as TypeSafe's hosted System One API, including heterogeneous batched `choice`, `noul`, and `score` questions. :chatgpt-content-reference{index="0"}

Therefore it would be a mistake for Pi-Bifrost to accumulate model-specific integrations:

```text
JevRouter
ReflexRouter
OpenJevRouter
SemIfRouter
WinnowRouter
...
```

Instead, Pi-Bifrost should depend upon a stable System One abstraction.

At the same time, System One is useful far beyond model routing.

Examples include:

```text
intent classification
tool selection
workflow branching
agent handoff
risk scoring
policy evaluation
confidence gating
approval decisions
task classification
escalation decisions
retrieval decisions
execution decisions
```

Therefore System One should exist independently of Pi-Bifrost.

---

# 3. Product Vision

The project should eventually allow this:

```ts
const systemOne = createSystemOne({
  baseUrl: "http://localhost:8008",
});

const result = await systemOne.evaluate({
  state: {
    request: "Fix this React rendering issue",
  },

  questions: {
    task: choice("What kind of task is this?", {
      coding: "Software implementation or debugging",
      research: "Information gathering or investigation",
      writing: "Creating or editing prose",
      other: null,
    }),

    difficult: noul(
      "Does this request require substantial reasoning?"
    ),

    complexity: score(
      "How complex is this task?",
      [
        "Trivial",
        "Moderate",
        "Complex",
        "Highly complex",
      ]
    ),
  },
});
```

The same application code should work with:

```text
TypeSafe Jev
Reflex
another /v1/systemone-compatible server
a custom in-process provider
a future System One implementation
```

Changing providers should generally be configuration, not application-code changes.

---

# 4. Non-Goals

Version 0.1 must deliberately remain small.

It is NOT:

```text
an AI gateway
a model router
an orchestration framework
an agent framework
an LLM abstraction
an OpenAI-compatible SDK
a fallback engine
a prompt framework
a model registry
a calibration framework
a benchmark framework
```

Those systems may consume System One.

They do not belong inside System One.

In particular, the core library must not contain concepts such as:

```text
cheapModel
expensiveModel
modelTier
route
fallbackModel
escalationModel
codingModel
reasoningModel
```

Those belong to consumers such as Pi-Bifrost.

---

# 5. Prior Art

There are existing projects exposing Jev/System One inside Pi and other agent systems.

Some expose Jev tools directly.

Some abstract different transports through which Jev can be reached.

Some provide broader agent routing or supervision frameworks.

None discovered during the research cleanly implement the exact abstraction proposed here:

> A small provider-neutral System One runtime for Pi where Jev, Reflex, and arbitrary compatible implementations are interchangeable providers.

TypeSafe itself also publishes a Python System One adapter that emulates the API through conventional LLM providers, reinforcing the idea that System One can be treated as an interface rather than as synonymous with one model. :chatgpt-content-reference{index="1"}

The official JavaScript TypeSafe SDK exposes the capability through:

```ts
client.systemOne(...)
```

rather than requiring users to think in terms of a Jev-specific client. :chatgpt-content-reference{index="2"}

This project should push that abstraction one level further.

---

# 6. Core Architectural Principle

The abstraction is:

```text
SystemOneProvider
```

not:

```text
JevProvider
```

The initial HTTP implementation should also NOT require different classes for Jev and Reflex.

Do not start with:

```ts
class JevProvider {}
class ReflexProvider {}
class OpenJevProvider {}
```

Both Jev and Reflex already expose essentially the same HTTP protocol.

Instead:

```text
                   SystemOneProvider
                           |
                           v
                 HttpSystemOneProvider
                           |
             +-------------+-------------+
             |             |             |
         TypeSafe        Reflex       compatible
           Jev           local        endpoint
```

Configuration determines the target.

---

# 7. Proposed Monorepo

Use a monorepo.

Working repository name can remain temporary until naming is finalized.

Suggested structure:

```text
system-one/
│
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── README.md
├── LICENSE
│
├── packages/
│   │
│   ├── system-one/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── client.ts
│   │   │   ├── provider.ts
│   │   │   ├── questions.ts
│   │   │   ├── responses.ts
│   │   │   ├── protocol.ts
│   │   │   ├── errors.ts
│   │   │   ├── validation.ts
│   │   │   └── providers/
│   │   │       └── http.ts
│   │   └── test/
│   │
│   ├── pi-system-one/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── extension.ts
│   │   │   ├── config.ts
│   │   │   ├── tool.ts
│   │   │   └── render.ts
│   │   └── test/
│   │
│   └── system-one-testkit/
│       ├── package.json
│       └── src/
│           ├── mock-provider.ts
│           ├── fixtures.ts
│           └── mock-server.ts
│
├── examples/
│   ├── basic/
│   ├── reflex/
│   ├── typesafe/
│   ├── custom-provider/
│   └── pi-extension/
│
└── docs/
    ├── architecture.md
    ├── protocol.md
    ├── providers.md
    ├── pi.md
    ├── security.md
    └── bifrost.md
```

For v0.1, `system-one-testkit` can remain internal if publishing another package would slow development.

Do NOT prematurely create individual packages such as:

```text
system-one-provider-jev
system-one-provider-reflex
system-one-provider-openjev
```

They are unnecessary while those systems speak the common HTTP protocol.

---

# 8. Package Responsibilities

## 8.1 `@scope/system-one`

This is the fundamental package.

It must have zero dependency on Pi.

It owns:

```text
System One protocol types
question builders
typed responses
SystemOneProvider interface
SystemOne client
HTTP provider
protocol validation
errors
abort/timeout handling
```

It must NOT own:

```text
Pi UI
Pi tools
Pi lifecycle
Bifrost routing
route definitions
model selection
escalation policies
```

Applications other than Pi should be able to install this package independently.

Example:

```ts
import {
  SystemOne,
  choice,
  noul,
  score,
} from "@scope/system-one";
```

---

## 8.2 `@scope/pi-system-one`

This is the Pi integration.

It depends on:

```text
@scope/system-one
Pi extension APIs
TypeBox
```

Its job is simply:

```text
Pi tool call
    |
    v
SystemOne client
    |
    v
provider
```

Pi supports extensions that register LLM-callable custom tools using `pi.registerTool()`, making this a natural extension primitive. :chatgpt-content-reference{index="3"}

Pi packages can be distributed through npm and declare extension resources in their package manifest. :chatgpt-content-reference{index="4"}

The Pi package should therefore contain an ordinary Pi extension.

---

## 8.3 Pi-Bifrost

Pi-Bifrost should depend directly on:

```text
@scope/system-one
```

It should NOT depend on:

```text
@scope/pi-system-one
```

Why?

Because Bifrost needs the System One runtime, not the user-facing Pi tool.

Correct:

```text
                 @scope/system-one
                    ^          ^
                    |          |
                    |          |
          pi-system-one     pi-bifrost
```

Incorrect:

```text
pi-bifrost
    |
    v
pi-system-one
    |
    v
system-one
```

Pi-Bifrost should call the core TypeScript API directly.

---

# 9. Provider Interface

The initial provider contract should remain intentionally small.

Suggested shape:

```ts
export interface SystemOneProvider {
  readonly id: string;

  evaluate<Q extends QuestionMap>(
    request: SystemOneRequest<Q>,
    options?: SystemOneCallOptions
  ): Promise<SystemOneResponse<Q>>;

  capabilities?():
    | SystemOneCapabilities
    | Promise<SystemOneCapabilities>;
}
```

Do not expose provider-specific concepts through this interface.

---

# 10. Client API

Applications generally should not interact with providers directly.

Expose a client:

```ts
const systemOne = new SystemOne({
  provider,
});
```

or a factory:

```ts
const systemOne = createSystemOne({
  provider,
});
```

Preferred public method:

```ts
systemOne.evaluate(...)
```

Example:

```ts
const response = await systemOne.evaluate({
  state: "The export button crashes in Safari.",

  questions: {
    browserSpecific: noul(
      "Is this problem specific to a browser?"
    ),

    category: choice(
      "Which category best describes this issue?",
      {
        rendering: "Visual or rendering failure",
        networking: "Network communication problem",
        storage: "Persistence or storage problem",
        unknown: null,
      }
    ),
  },
});
```

The term `evaluate` keeps consumer code independent from HTTP endpoint naming.

An alias may eventually exist:

```ts
systemOne.systemOne(...)
```

but it should not be necessary.

---

# 11. State

System One state may be plain text or structured JSON.

Define a JSON-safe value:

```ts
export type JsonPrimitive =
  | string
  | number
  | boolean
  | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
```

Then:

```ts
export type SystemOneState = JsonValue;
```

Examples:

```ts
state: "Fix this login bug"
```

or:

```ts
state: {
  request: "Fix this login bug",
  repository: "frontend",
  files: ["login.tsx", "auth.ts"],
}
```

Do not stringify structured state before it reaches the provider.

Preserve structure.

---

# 12. Question Types

System One currently has three core primitives:

```text
noul
choice
score
```

Reflex implements all three and can evaluate heterogeneous questions together in one request. :chatgpt-content-reference{index="5"}

---

# 13. Noul

Noul represents a binary proposition.

Conceptually:

```text
P(statement = true)
```

Suggested type:

```ts
export interface NoulQuestion {
  type: "noul";
  instructions: JsonValue;
  criteria?: Record<string, JsonValue | null>;
}
```

Builder:

```ts
export function noul(
  instructions: JsonValue,
  criteria?: Record<string, JsonValue | null>
): NoulQuestion;
```

Example:

```ts
noul(
  "Does this request require substantial reasoning?"
)
```

Response:

```ts
export interface NoulAnswer {
  type: "noul";
  noul: number;
}
```

Important:

**Noul does not have a separate confidence value.**

The returned `noul` itself represents the probability of the proposition being true.

Do not manufacture:

```ts
confidence
```

for Noul responses.

---

# 14. Choice

Choice selects exactly one option from a bounded set.

Suggested type:

```ts
export interface ChoiceQuestion<
  T extends Record<string, JsonValue | null>
> {
  type: "choice";
  instructions: JsonValue;
  criteria: T;
}
```

Builder:

```ts
choice(
  "Which type of task is this?",
  {
    coding: "Software implementation or debugging",
    research: "Research or information gathering",
    writing: "Producing prose",
  }
)
```

Response:

```ts
export interface ChoiceAnswer<
  TChoice extends string = string
> {
  type: "choice";

  choice: TChoice;

  probabilities: Record<TChoice, number>;

  confidence: number;
}
```

The core library must preserve the provider's returned probabilities and confidence.

Do not recalibrate them.

Do not normalize them silently.

Do not reinterpret confidence as the same value as the winning probability.

---

# 15. Score

Score represents a location on an ordered rubric.

Suggested type:

```ts
export interface ScoreQuestion<
  TCriteria extends readonly JsonValue[]
> {
  type: "score";
  instructions: JsonValue;
  criteria: TCriteria;
}
```

Example:

```ts
score(
  "How difficult is this task?",
  [
    "Trivial",
    "Moderate",
    "Complex",
    "Highly complex",
  ]
)
```

Response:

```ts
export interface ScoreAnswer {
  type: "score";

  score: number;

  probabilities: Record<string, number>;

  legend: Record<string, JsonValue>;

  confidence: number;
}
```

The score can be fractional.

For example:

```text
1.7
```

even though rubric levels are discrete.

That is expected.

---

# 16. Builder Functions

Expose:

```ts
choice()
noul()
score()
```

These builders should primarily:

```text
improve readability
preserve literal TypeScript types
reduce malformed question objects
enable answer inference
```

Example:

```ts
const questions = {
  route: choice("Choose a route", {
    cheap: null,
    balanced: null,
    powerful: null,
  }),

  ambiguous: noul(
    "Is the request ambiguous?"
  ),

  complexity: score(
    "How difficult is this?",
    ["easy", "medium", "hard"]
  ),
};
```

The resulting answer should retain useful type information:

```ts
result.answers.route.choice
```

should ideally infer:

```ts
"cheap" | "balanced" | "powerful"
```

rather than simply:

```ts
string
```

---

# 17. Typed Answer Mapping

Use conditional types.

Conceptually:

```ts
export type AnswerFor<Q> =
  Q extends NoulQuestion
    ? NoulAnswer
    : Q extends ChoiceQuestion<infer C>
      ? ChoiceAnswer<Extract<keyof C, string>>
      : Q extends ScoreQuestion<any>
        ? ScoreAnswer
        : never;
```

Then:

```ts
export type AnswersFor<
  Q extends QuestionMap
> = {
  [K in keyof Q]: AnswerFor<Q[K]>;
};
```

This is one of the strongest reasons to have a real TypeScript core instead of merely exposing raw HTTP calls.

---

# 18. System One Request

Suggested type:

```ts
export interface SystemOneRequest<
  Q extends QuestionMap = QuestionMap
> {
  state: SystemOneState;

  questions: Q;

  model?: string;
}
```

Require:

```text
at least one question
```

at runtime.

Do not require `model`.

Some local providers choose the model at server startup.

---

# 19. System One Response

Suggested abstraction:

```ts
export interface SystemOneResponse<
  Q extends QuestionMap = QuestionMap
> {
  model?: string;

  answers: AnswersFor<Q>;

  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };

  requestId?: string;

  metadata: {
    provider: string;
    latencyMs?: number;
  };
}
```

Important distinction:

```text
answers
```

are System One protocol output.

```text
metadata
```

is local client/runtime information.

Do not inject application decisions into this object.

---

# 20. HTTP Provider

The first concrete provider should be:

```ts
HttpSystemOneProvider
```

Configuration:

```ts
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
```

Default endpoint path:

```text
/v1/systemone
```

So:

```ts
new HttpSystemOneProvider({
  id: "typesafe",
  baseUrl: "https://api.typesafe.ai",
  apiKey: process.env.TYPESAFE_API_KEY,
  defaultModel: "jev-latest",
});
```

and:

```ts
new HttpSystemOneProvider({
  id: "reflex",
  baseUrl: "http://localhost:8008",
});
```

should use the same implementation.

Reflex explicitly documents that existing Jev clients can point at its local server because its request and response shape matches TypeSafe's API. :chatgpt-content-reference{index="6"}

---

# 21. Do Not Create a Model Registry Yet

Avoid:

```ts
provider: "jev"
provider: "reflex"
provider: "winnow"
```

inside the core protocol.

Those are deployment choices.

The fundamental configuration is:

```text
endpoint
credentials
model
```

Convenience presets may eventually exist:

```ts
providers.typesafe(...)
providers.reflex(...)
```

but they should simply construct a normal `HttpSystemOneProvider`.

They must not create separate protocol implementations.

---

# 22. Custom Providers

Users must be able to bypass HTTP entirely.

Example:

```ts
class MyProvider implements SystemOneProvider {
  readonly id = "my-provider";

  async evaluate(request) {
    // custom inference implementation
  }
}
```

Then:

```ts
const systemOne = createSystemOne({
  provider: new MyProvider(),
});
```

This future-proofs the architecture for:

```text
in-process inference
WASM
native bindings
WebGPU
local subprocesses
alternative protocols
testing
```

without changing consumer code.

---

# 23. Provider Capabilities

Capabilities should be optional.

Suggested shape:

```ts
export interface SystemOneCapabilities {
  questionTypes?: Array<
    "choice" | "noul" | "score"
  >;

  batching?: boolean;

  structuredState?: boolean;

  multimodal?: boolean | "unknown";

  limits?: {
    maxQuestions?: number;
    maxChoiceOptions?: number;
    maxStateBytes?: number;
  };
}
```

Do not require remote capability discovery in v0.1.

A provider may:

```text
declare capabilities statically
discover them remotely
return unknown
```

Core behavior should not depend on the existence of a capability endpoint.

---

# 24. Protocol Validation

The client should validate provider responses.

This is important because System One decisions may control deterministic software.

Bad inference output should fail closed.

Validation should verify:

### General

```text
response is valid JSON
answers exists
all requested question IDs exist
no answer has an unexpected type
numeric values are finite
probabilities are between 0 and 1
```

### Choice

Verify:

```text
selected choice exists in requested criteria
probability exists for every requested option
confidence is within [0, 1]
probability values are finite
```

Do not silently change the provider's selected choice.

Do not silently normalize probabilities.

### Noul

Verify:

```text
noul is finite
0 <= noul <= 1
```

### Score

Verify:

```text
score is finite
confidence is within [0, 1]
legend exists
probabilities are valid
```

Protocol inconsistencies should throw:

```ts
SystemOneProtocolError
```

---

# 25. Error Model

Define explicit errors.

Suggested hierarchy:

```text
SystemOneError
│
├── SystemOneConfigurationError
├── SystemOneTransportError
├── SystemOneTimeoutError
├── SystemOneHttpError
├── SystemOneProtocolError
└── SystemOneCapabilityError
```

All errors should expose machine-readable codes.

Example:

```ts
error.code === "SYSTEM_ONE_TIMEOUT"
```

---

# 26. HTTP Error Handling

`SystemOneHttpError` should include:

```text
HTTP status
provider ID
request ID if available
safe response metadata
retry-after if supplied
```

It must NOT expose:

```text
API keys
Authorization headers
full environment variables
other secrets
```

---

# 27. Retries

Inference requests are logically repeatable, but retries may cause:

```text
additional cost
additional latency
duplicated provider usage
```

Therefore:

```text
default retries = 0
```

Consumers may explicitly enable retries.

Potential retryable failures:

```text
429
502
503
504
temporary network failure
```

Never retry:

```text
400
401
403
protocol validation failures
```

unless explicitly overridden.

---

# 28. Cancellation

Every request should accept:

```ts
AbortSignal
```

Example:

```ts
systemOne.evaluate(
  request,
  {
    signal,
  }
);
```

Cancellation must propagate to `fetch`.

This matters when agents or routing requests are aborted.

---

# 29. Timeout

Provide configurable timeout.

Example default:

```text
10 seconds
```

The exact default can be adjusted during implementation.

A timeout must throw:

```ts
SystemOneTimeoutError
```

not an opaque generic fetch error.

---

# 30. No Hidden Fallbacks

The core library must NEVER do this automatically:

```text
Reflex failed
   |
   v
try Jev
   |
   v
try GPT
```

Fallback is policy.

Policy belongs to consumers.

For example, Pi-Bifrost may decide:

```text
Reflex
  |
low confidence or unavailable
  |
Jev
  |
still unresolved
  |
Sol
```

But `@scope/system-one` itself should not make that decision.

---

# 31. No Hidden Thresholds

The core library should not decide:

```ts
confidence > 0.8
```

means safe.

It should return provider output.

Consumers determine thresholds according to their own data and risk tolerance.

For example:

```ts
const result = await systemOne.evaluate(...);

if (
  result.answers.route.type === "choice" &&
  result.answers.route.confidence < 0.75
) {
  escalate();
}
```

The `0.75` belongs to the consumer.

---

# 32. Pi Extension

The Pi extension should expose **one primary tool**:

```text
system_one
```

Do NOT make three independent primary tools:

```text
system_one_choice
system_one_score
system_one_noul
```

The point of the System One protocol is that multiple heterogeneous questions can be evaluated against the same state in one request.

The tool should preserve that capability.

---

# 33. `system_one` Tool Input

Conceptually:

```json
{
  "state": "...",
  "questions": {
    "task": {
      "type": "choice",
      "instructions": "...",
      "criteria": {
        "coding": "...",
        "research": "..."
      }
    },

    "complex": {
      "type": "noul",
      "instructions": "..."
    },

    "difficulty": {
      "type": "score",
      "instructions": "...",
      "criteria": [
        "easy",
        "medium",
        "hard"
      ]
    }
  }
}
```

Use TypeBox for the Pi tool schema.

Pi's extension API officially supports registering custom LLM-callable tools through `pi.registerTool()`. :chatgpt-content-reference{index="7"}

---

# 34. Pi Tool Description

The description should teach the model when the primitive is useful.

Something along the lines of:

```text
Evaluate one or more bounded decision questions against shared
state using the configured System One provider.

Use this when the answer space is known and a fast probabilistic
decision is preferable to generating free-form text.

Multiple independent choice, noul, and score questions should be
batched into one call when they share the same state.
```

Avoid marketing terminology.

The tool description should explain behavior.

---

# 35. Pi Tool Result

Return human/LLM-readable text:

```text
System One result

task:
  choice: coding
  confidence: 0.91
  probabilities:
    coding: 0.91
    research: 0.06
    writing: 0.03

complex:
  noul: 0.82

difficulty:
  score: 1.7
  confidence: 0.84
```

Also return the structured response under Pi tool `details`.

Do not throw away the probability distribution.

---

# 36. Pi Configuration

The standalone extension needs simple configuration.

Start with environment variables.

Suggested variables:

```text
SYSTEM_ONE_BASE_URL
SYSTEM_ONE_API_KEY
SYSTEM_ONE_MODEL
SYSTEM_ONE_TIMEOUT_MS
```

Example for TypeSafe:

```bash
SYSTEM_ONE_BASE_URL=https://api.typesafe.ai
SYSTEM_ONE_API_KEY=...
SYSTEM_ONE_MODEL=jev-latest
```

Example for Reflex:

```bash
SYSTEM_ONE_BASE_URL=http://localhost:8008
```

A model does not necessarily need to be specified because a local provider may have one model loaded at server startup.

---

# 37. Configuration Profiles - Later

Do not block v0.1 on a sophisticated configuration system.

A later version can support:

```json
{
  "default": "local",

  "providers": {
    "local": {
      "baseUrl": "http://localhost:8008"
    },

    "jev": {
      "baseUrl": "https://api.typesafe.ai",
      "apiKeyEnv": "TYPESAFE_API_KEY",
      "model": "jev-latest"
    }
  }
}
```

Then potentially:

```text
/system-one provider local
/system-one provider jev
```

This is useful, but it is not necessary for the first working release.

---

# 38. Optional Pi Commands

After the base extension works, consider:

```text
/system-one status
/system-one test
/system-one provider
```

`status` could show:

```text
Provider: reflex
Endpoint: http://localhost:8008
Model: server default
Status: reachable
```

Never print secret values.

---

# 39. Pi Package Distribution

Pi supports npm-distributed extension packages and discovers extension resources through the package manifest. :chatgpt-content-reference{index="8"}

The Pi package should therefore expose something approximately like:

```json
{
  "name": "@scope/pi-system-one",
  "dependencies": {
    "@scope/system-one": "^0.1.0"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "typebox": "*"
  },
  "pi": {
    "extensions": [
      "./dist/extension.js"
    ]
  }
}
```

Check the current Pi packaging documentation during implementation because exact packaging behavior can evolve.

---

# 40. Pi-Bifrost Integration

Pi-Bifrost currently has Jev support.

That implementation should eventually become:

```text
SystemOneRouter
```

rather than:

```text
JevRouter
```

Conceptually:

```ts
class SystemOneRouter {
  constructor(
    private readonly systemOne: SystemOne
  ) {}

  async route(request: RoutingRequest) {
    const result = await this.systemOne.evaluate({
      state: buildRoutingState(request),

      questions: {
        route: choice(
          "Which model is the best fit?",
          buildModelCriteria()
        ),
      },
    });

    return mapSystemOneDecision(result);
  }
}
```

Bifrost owns:

```text
routing prompt/instructions
candidate models
thresholds
escalation
fallback
routing metrics
routing policy
```

System One owns:

```text
questions
providers
protocol
transport
validation
```

---

# 41. Bifrost Architecture After Migration

Target:

```text
                         Pi-Bifrost
                             |
                       Routing Policy
                             |
                             v
                       SystemOneRouter
                             |
                             v
                    @scope/system-one
                             |
                   SystemOneProvider
                             |
               +-------------+-------------+
               |             |             |
              Jev          Reflex        custom
```

This allows users to change:

```text
Jev -> Reflex
```

without changing Bifrost's routing implementation.

---

# 42. Bifrost Configuration

Possible future shape:

```ts
router: {
  type: "system-one",

  provider: {
    baseUrl: "http://localhost:8008"
  },

  confidenceThreshold: 0.75
}
```

TypeSafe:

```ts
router: {
  type: "system-one",

  provider: {
    baseUrl: "https://api.typesafe.ai",
    apiKey: process.env.TYPESAFE_API_KEY,
    model: "jev-latest"
  },

  confidenceThreshold: 0.75
}
```

Notice:

```text
router.type = system-one
```

not:

```text
router.type = jev
```

---

# 43. Backward Compatibility for Existing Jev Users

Existing Pi-Bifrost configuration should not break immediately.

If Pi-Bifrost currently supports something conceptually like:

```ts
router: {
  type: "jev",
  apiKey: ...
}
```

retain it temporarily as an alias.

Internally translate:

```text
jev
 |
 v
SystemOneRouter
 |
 v
TypeSafe endpoint
```

Mark it deprecated in documentation.

Future preferred configuration:

```text
system-one
```

This allows a non-breaking migration.

---

# 44. Migration Strategy

Migration should occur in this order:

```text
1. Extract Jev request/response behavior into @scope/system-one

2. Verify existing Bifrost Jev tests still pass

3. Replace direct Jev network calls with SystemOne

4. Add Reflex configuration

5. Run identical routing tests through both backends

6. Keep existing Jev configuration alias

7. Deprecate Jev-specific router code

8. Remove it only in a future major release
```

The initial refactor should change architecture without changing existing Jev behavior.

---

# 45. Reflex as the First Open Provider

Reflex should be the first officially documented open implementation.

Reasons:

```text
small enough to run locally
open implementation
Jev/System One recreation
supports choice/noul/score
supports batching
uses /v1/systemone
wire-compatible with TypeSafe
```

Reflex currently uses Qwen3.5-4B by default and describes itself as an open recreation of Jev/System One. :chatgpt-content-reference{index="9"}

The extension should not need any Reflex-specific transport code.

Running Reflex locally should effectively reduce to:

```text
start Reflex server
        |
        v
localhost:8008/v1/systemone
        |
        v
configure SYSTEM_ONE_BASE_URL
```

That is exactly the abstraction we want.

---

# 46. Provider-Neutral Examples

Documentation should avoid presenting TypeSafe as the fundamental path.

Lead with generic configuration.

For example:

```ts
const provider = new HttpSystemOneProvider({
  baseUrl: process.env.SYSTEM_ONE_BASE_URL!,
  apiKey: process.env.SYSTEM_ONE_API_KEY,
});

const systemOne = new SystemOne({
  provider,
});
```

Then provider-specific examples below it.

---

# 47. Example: Intent Classification

```ts
const result = await systemOne.evaluate({
  state: {
    request: userPrompt,
  },

  questions: {
    intent: choice(
      "What is the user's primary intent?",
      {
        coding: "Implement, modify, or debug software",
        research: "Investigate or gather information",
        writing: "Create or edit prose",
        explanation: "Explain a concept",
      }
    ),
  },
});

console.log(result.answers.intent.choice);
```

---

# 48. Example: Tool Selection

```ts
const result = await systemOne.evaluate({
  state: request,

  questions: {
    tool: choice(
      "Which capability should handle this request?",
      {
        web: "Current public information",
        files: "User-provided files",
        shell: "Local development operations",
        none: "No external capability required",
      }
    ),
  },
});
```

---

# 49. Example: Multiple Decisions in One Request

Prefer:

```ts
await systemOne.evaluate({
  state: request,

  questions: {
    category: choice(...),
    dangerous: noul(...),
    complexity: score(...),
  },
});
```

over:

```ts
await systemOne.evaluate({
  questions: {
    category: choice(...)
  }
});

await systemOne.evaluate({
  questions: {
    dangerous: noul(...)
  }
});

await systemOne.evaluate({
  questions: {
    complexity: score(...)
  }
});
```

when all questions operate independently over the same state.

This preserves one of the key properties of System One.

---

# 50. Independence of Questions

Questions within one request should be treated as independently evaluated against the same state.

Do not design APIs where:

```text
question B can consume answer A
```

within the same System One request.

If B genuinely depends on A:

```text
request 1
   |
   v
answer A
   |
application logic
   |
   v
request 2
```

This distinction should be documented.

---

# 51. Security

The system may run inside developer machines and agent environments.

Apply basic security rules from day one.

Never log:

```text
Authorization headers
API keys
environment secrets
full credential-bearing config
```

When displaying configuration:

```text
API key: configured
```

not:

```text
API key: sk-...
```

---

# 52. Remote HTTP Safety

Plain HTTP is reasonable for:

```text
localhost
127.0.0.1
::1
```

because local Reflex development will commonly use it.

For remote non-localhost HTTP endpoints, consider warning users that transport is unencrypted.

Do not prevent advanced users from using custom endpoints unless there is a strong security reason.

---

# 53. Response Size Protection

Set a generous but bounded response size.

System One responses should normally be small.

Something like:

```text
1 MB
```

is already much larger than normal.

This prevents a broken or malicious provider from returning unbounded data.

Make the value configurable.

---

# 54. Observability

The runtime should provide enough metadata for consumers to measure behavior without becoming an observability framework.

Useful fields:

```text
provider
model
requestId
latencyMs
inputTokens
outputTokens
```

Bifrost can record:

```text
routing latency
routing confidence
chosen route
provider
model
```

outside the System One core.

---

# 55. Logging

Core library:

```text
silent by default
```

Do not print to stdout.

Allow optional logger injection later:

```ts
logger?: SystemOneLogger
```

But avoid adding logging dependencies.

Pi extension may display appropriate status through Pi UI.

---

# 56. Testing Philosophy

This project controls decisions that may influence agent behavior.

Protocol correctness matters more than clever abstractions.

Tests should cover four layers:

```text
types
protocol
transport
integration
```

---

# 57. Core Unit Tests

Test:

```text
choice builder
noul builder
score builder
request serialization
answer mapping
typed inference
error construction
timeout handling
abort handling
```

---

# 58. Protocol Validation Tests

Create fixture responses for:

```text
valid choice
valid noul
valid score
mixed responses
missing answer
wrong answer type
unknown choice
NaN
Infinity
negative probability
probability > 1
missing choice probability
malformed legend
missing answers
invalid JSON
```

Bad responses must produce deterministic protocol errors.

---

# 59. HTTP Provider Tests

Use a local mock HTTP server.

Test:

```text
correct POST path
correct JSON body
Authorization header
custom headers
default model
per-request model
timeout
abort
HTTP 400
HTTP 401
HTTP 429
HTTP 500
response validation
credentials absent from errors
```

Do not require live APIs for normal CI.

---

# 60. Test Provider

Create:

```ts
MockSystemOneProvider
```

Example:

```ts
const provider = new MockSystemOneProvider({
  answers: {
    route: {
      type: "choice",
      choice: "coding",
      probabilities: {
        coding: 0.9,
        research: 0.1,
      },
      confidence: 0.87,
    },
  },
});
```

This will be especially valuable for Pi-Bifrost.

Routing tests should never depend on a live probabilistic model.

---

# 61. Contract Tests

Create optional integration tests enabled only when environment variables exist.

TypeSafe:

```text
SYSTEM_ONE_TEST_TYPESAFE=1
TYPESAFE_API_KEY=...
```

Reflex:

```text
SYSTEM_ONE_TEST_REFLEX=1
SYSTEM_ONE_REFLEX_URL=http://localhost:8008
```

Contract tests should verify:

```text
request accepted
response valid
question IDs preserved
answer types preserved
probabilities valid
```

They should NOT expect exact probability values.

---

# 62. Cross-Provider Contract Test

One useful test:

```text
same request
   |
   +--> TypeSafe
   |
   +--> Reflex
```

Validate only protocol behavior:

```text
both return requested answers
both satisfy schemas
both return bounded probabilities
both preserve option names
```

Do not require the models to agree on the answer.

The abstraction guarantees protocol compatibility, not identical intelligence.

---

# 63. Pi Extension Tests

Mock enough of `ExtensionAPI` to verify:

```text
system_one tool registered
schema accepts all three question types
tool delegates to SystemOne
structured response placed in details
friendly output rendered
errors are presented safely
```

---

# 64. Bifrost Tests

Use `MockSystemOneProvider`.

Example:

```text
Mock says:
coding = 0.93

Expected:
Bifrost selects coding route
```

Then:

```text
Mock confidence = 0.40

Expected:
Bifrost executes configured escalation policy
```

This ensures routing policy remains deterministic even though real System One models are probabilistic.

---

# 65. No Benchmark Claims in Core

Do not embed claims such as:

```text
Reflex is better than Jev
Jev is more accurate
provider X is fastest
```

inside package behavior or API.

Benchmarks evolve rapidly.

Provider documentation may link to external benchmarks.

The runtime itself should remain neutral.

---

# 66. Performance

The client should introduce negligible overhead.

Do not add:

```text
heavy runtime validation frameworks
large SDK dependencies
agent framework dependencies
model provider SDKs
```

Prefer:

```text
native fetch
small manual/schema validation
TypeScript types
AbortController
```

The model/server dominates latency.

The SDK should not.

---

# 67. Dependency Philosophy

Keep dependencies minimal.

The core package should ideally use:

```text
Node/Web fetch
standard TypeScript
small validation code
```

Avoid pulling in:

```text
OpenAI SDK
Anthropic SDK
LangChain
Vercel AI SDK
agent frameworks
```

They are unrelated to the abstraction.

---

# 68. Runtime Compatibility

Target modern Node.js.

Prefer standards that also leave open future portability toward:

```text
Bun
Deno
browser
Cloudflare Workers
WebGPU frontends
```

Do not use Node-specific primitives unnecessarily inside core.

Pi integration can naturally depend on Node/Pi.

---

# 69. ESM

Prefer modern ESM.

If CommonJS compatibility is inexpensive to publish, it can be included.

Do not complicate initial architecture purely for legacy module support.

---

# 70. Versioning

Packages should version independently if necessary but begin together.

Example:

```text
@scope/system-one       0.1.0
@scope/pi-system-one    0.1.0
```

Use normal SemVer.

Breaking protocol/API changes before 1.0 may happen, but document them clearly.

---

# 71. v0.1 Scope

The first release should contain only what proves the architecture.

Required:

```text
SystemOneProvider interface
SystemOne client
choice
noul
score
typed answers
HTTP provider
/v1/systemone support
response validation
timeouts
AbortSignal
errors
TypeSafe example
Reflex example
Pi system_one tool
unit tests
mock provider
README
```

That is enough.

---

# 72. Explicitly Defer From v0.1

Do not delay release for:

```text
provider marketplace
automatic provider discovery
automatic model downloading
Reflex process management
GPU management
WebGPU execution
WASM
fallback chains
provider balancing
benchmark UI
telemetry backend
multi-provider routing
automatic threshold tuning
complex config profiles
```

Those can follow real usage.

---

# 73. v0.2 Candidates

After v0.1 is stable:

```text
named provider profiles
/system-one status
/system-one provider
capability discovery
better Pi rendering
provider health checks
custom headers from config
optional retry policies
```

---

# 74. v0.3+ Candidates

Potential future direction:

```text
in-process providers
WebGPU System One models
browser support
SemIf adapters
native Reflex integration
automatic local server discovery
provider benchmark harness
calibration utilities
```

These are ideas, not commitments.

---

# 75. Important Naming Rule

Avoid putting:

```text
jev
reflex
qwen
```

in the fundamental project/package name.

The abstraction must survive changes in individual implementations.

The public positioning should be approximately:

> System One decisions for Pi. Plug in Jev, Reflex, or your own provider.

---

# 76. README Positioning

Recommended opening:

```text
# System One for Pi

A provider-neutral System One runtime for TypeScript and Pi.

Give applications and agents fast, bounded probabilistic decision
primitives without coupling them to a specific model.

Use TypeSafe Jev, Reflex, any compatible /v1/systemone endpoint,
or implement your own provider.
```

Then immediately show:

```text
state
  |
  +--> choice
  +--> noul
  +--> score
  |
System One provider
  |
  +--> Jev
  +--> Reflex
  +--> custom
```

---

# 77. README Quickstart

Standalone:

```ts
import {
  SystemOne,
  HttpSystemOneProvider,
  choice,
  noul,
} from "@scope/system-one";

const systemOne = new SystemOne({
  provider: new HttpSystemOneProvider({
    baseUrl: "http://localhost:8008",
  }),
});

const result = await systemOne.evaluate({
  state: "Please debug the race condition in this worker.",

  questions: {
    task: choice(
      "What type of task is this?",
      {
        coding: null,
        research: null,
        writing: null,
      }
    ),

    difficult: noul(
      "Does this task require substantial reasoning?"
    ),
  },
});

console.log(result.answers.task.choice);
```

---

# 78. Pi Quickstart

Installation should eventually look approximately like:

```bash
pi install npm:@scope/pi-system-one
```

Configure:

```bash
export SYSTEM_ONE_BASE_URL=http://localhost:8008
```

Then the Pi agent automatically gains:

```text
system_one
```

as a tool.

Pi officially supports installable npm packages containing extensions, so this distribution model fits Pi's existing extension system. :chatgpt-content-reference{index="10"}

---

# 79. Bifrost Quickstart

Eventually:

```ts
const bifrost = createBifrost({
  router: {
    type: "system-one",

    provider: {
      baseUrl: "http://localhost:8008",
    },
  },
});
```

Changing to Jev should require changing provider configuration:

```ts
provider: {
  baseUrl: "https://api.typesafe.ai",
  apiKey: process.env.TYPESAFE_API_KEY,
  model: "jev-latest",
}
```

The routing algorithm should remain untouched.

---

# 80. Architecture Invariant

Every future feature must pass this question:

> Does this belong to the System One capability itself, or to an application using System One?

For example:

### Belongs in System One

```text
question types
protocol validation
providers
HTTP transport
timeouts
typed results
capability metadata
```

### Does not belong in System One

```text
which model should handle coding
when Sol should be selected
how Bifrost escalates
whether a confidence threshold is acceptable
which agent should run a task
```

When uncertain, prefer keeping the core smaller.

---

# 81. Implementation Order

The implementation agent should work in this order.

## Phase 1 - Repository foundation

Create:

```text
workspace
TypeScript config
linting
formatting
test runner
build scripts
package boundaries
```

Do not implement Pi yet.

---

## Phase 2 - Protocol

Implement:

```text
JsonValue
question types
builders
answer types
conditional TypeScript mapping
request
response
errors
```

Add unit tests.

---

## Phase 3 - HTTP Provider

Implement:

```text
HttpSystemOneProvider
serialization
authentication
timeouts
AbortSignal
response parsing
protocol validation
```

Test with a local HTTP mock server.

---

## Phase 4 - Mock Provider

Implement:

```text
MockSystemOneProvider
```

This becomes the deterministic testing foundation for downstream packages.

---

## Phase 5 - Reflex Integration Test

Start Reflex externally.

Configure:

```text
http://localhost:8008
```

Run:

```text
noul
choice
score
mixed batch
```

No Reflex-specific production code should be necessary.

If Reflex requires production changes beyond configuration, investigate why before adding special cases.

---

## Phase 6 - TypeSafe/Jev Integration Test

Run the same contract against TypeSafe.

Confirm that:

```text
same client
same HTTP provider
different configuration
```

works.

That is a major architecture acceptance test.

---

## Phase 7 - Pi Extension

Build:

```text
@scope/pi-system-one
```

Register:

```text
system_one
```

through Pi's extension API.

Add configuration and safe result rendering.

---

## Phase 8 - Pi-Bifrost Migration

Only once the generic package works independently:

```text
replace direct Jev code
with
@scope/system-one
```

Preserve existing behavior.

Then add Reflex documentation.

---

## Phase 9 - Release

Publish:

```text
@scope/system-one
@scope/pi-system-one
```

Pi-Bifrost can depend on the published package or workspace package according to its repository arrangement.

---

# 82. Definition of Done for Core

`@scope/system-one` is complete for v0.1 when this code works unchanged against both Jev and Reflex:

```ts
const client = new SystemOne({
  provider: new HttpSystemOneProvider({
    baseUrl,
    apiKey,
  }),
});

const response = await client.evaluate({
  state,

  questions: {
    type: choice(...),
    ambiguous: noul(...),
    complexity: score(...),
  },
});
```

Only configuration should change.

---

# 83. Definition of Done for Pi

`@scope/pi-system-one` is complete when:

```text
1. User installs package.

2. User configures endpoint.

3. Pi exposes system_one.

4. Agent can issue a mixed batch.

5. Reflex can answer it locally.

6. Jev can answer the exact same tool request remotely.

7. Results include complete probability information.

8. No Bifrost dependency exists.
```

---

# 84. Definition of Done for Pi-Bifrost

Bifrost integration is complete when:

```text
1. Existing Jev routing still works.

2. Direct Jev HTTP code has been removed or isolated behind compatibility.

3. Bifrost depends on SystemOneProvider.

4. Changing endpoint to Reflex requires no routing-code changes.

5. Routing tests use MockSystemOneProvider.

6. Confidence/escalation policy remains entirely inside Bifrost.

7. Existing users have a backward-compatible migration path.
```

---

# 85. Architecture Acceptance Test

This is the most important conceptual test.

The following should be possible:

```text
Today

Pi-Bifrost
   |
   v
Reflex
```

Tomorrow:

```text
Pi-Bifrost
   |
   v
SomeModelThatDoesNotExistYet
```

and the change should ideally be:

```text
base URL
credentials
model
```

not:

```text
rewrite router
```

Likewise:

```text
Pi agent
   |
   v
system_one
```

should work independently of Pi-Bifrost.

If both of those statements are true, the boundary is correct.

---

# 86. Design Principle: Protocol Over Product

Do not make the project:

> A Jev SDK that also happens to support Reflex.

Make it:

> A System One SDK whose providers may include Jev and Reflex.

That difference should be visible throughout:

```text
package names
interfaces
documentation
configuration
tests
examples
error names
tool names
```

Use:

```text
SystemOneProvider
SystemOneResponse
SystemOneError
system_one
```

Avoid fundamental types such as:

```text
JevProvider
JevResponse
JevError
jev_tool
```

except where specifically referring to the TypeSafe implementation.

---

# 87. Design Principle: Primitive Over Framework

Pi itself emphasizes extensible primitives rather than hard-coding every workflow, and its extension architecture allows third parties to register tools, commands, lifecycle behavior, and other functionality. :chatgpt-content-reference{index="11"}

The project should follow the same philosophy.

Provide:

```text
system_one
```

Then let users build:

```text
routing
supervision
tool choice
policy gates
agent handoffs
workflow control
```

on top.

Do not build all of those into the primitive.

---

# 88. Design Principle: Probabilistic Inference, Deterministic Consumption

System One produces probabilities.

Application code decides what they mean.

Correct:

```ts
const decision = await systemOne.evaluate(...);

if (decision.answers.route.confidence < threshold) {
  return escalate();
}

return routes[decision.answers.route.choice];
```

The probabilistic component ends at the System One boundary.

Deterministic application logic begins after it.

This is particularly important for Pi-Bifrost.

---

# 89. Design Principle: No Free-Text Parsing

The point of this abstraction is bounded decision output.

Do not implement provider adapters by asking a normal LLM:

```text
"Answer using JSON"
```

and parsing arbitrary generated output inside the main runtime.

If someone wants to implement such a provider, they may implement `SystemOneProvider` themselves.

The core should not assume that generated structured output is equivalent to a native System One decision model.

---

# 90. Design Principle: Preserve Raw Semantics

Do not silently:

```text
renormalize probabilities
change selected choices
derive confidence
clamp invalid values
repair malformed output
guess missing answers
```

If the provider violates the protocol:

```text
throw
```

Consumers can decide whether to fallback.

Silent repair would make routing and gating systems difficult to reason about.

---

# 91. Design Principle: Small Surface Area

A good v0.1 public API might be almost entirely:

```ts
SystemOne
SystemOneProvider
HttpSystemOneProvider

choice
noul
score

SystemOneRequest
SystemOneResponse

SystemOneError
SystemOneProtocolError
SystemOneHttpError
SystemOneTimeoutError
```

If the initial package exports fifty concepts, the abstraction is probably being over-designed.

---

# 92. Questions the Implementation Agent May Decide

The implementation agent is free to choose sensible details for:

```text
test framework
build tool
formatter
exact file names
whether classes or factory functions are preferred
validation implementation
ESM/CJS publishing mechanics
exact timeout default
exact response size limit
```

These decisions must not violate the architecture defined above.

---

# 93. Questions the Implementation Agent Must NOT Redesign

Do not change these without strong evidence:

```text
System One is provider-neutral.

Jev is not the abstraction.

Reflex is not the abstraction.

Pi-Bifrost depends on core, not on the Pi extension.

System One core knows nothing about routing.

One HTTP provider should support Jev and Reflex.

Mixed questions should be batchable.

The Pi-facing primary tool is system_one.

Consumers own thresholds and fallbacks.

Providers can be implemented by users.

Malformed provider output fails closed.
```

These are architectural decisions, not implementation suggestions.

---

# 94. First Implementation Milestone

The first meaningful milestone should be extremely small.

This should work:

```ts
const provider = new HttpSystemOneProvider({
  baseUrl: "http://localhost:8008",
});

const systemOne = new SystemOne({
  provider,
});

const result = await systemOne.evaluate({
  state: "The export button crashes in Safari.",

  questions: {
    browserSpecific: noul(
      "Is this bug browser specific?"
    ),

    team: choice(
      "Which team should investigate?",
      {
        frontend: null,
        backend: null,
        infrastructure: null,
      }
    ),
  },
});

console.log(result);
```

Against Reflex.

Then change only:

```ts
baseUrl
apiKey
model
```

and run it successfully against TypeSafe Jev.

Once that works, the central architecture has been proven.

Everything else is packaging and integration.

---

# 95. Final Architecture

```text
                                 APPLICATIONS
                                      |
                    +-----------------+-----------------+
                    |                                   |
                    v                                   v
              Pi System One                        Pi-Bifrost
                Extension                              |
                    |                              Routing Policy
                    |                                   |
                    +----------------+------------------+
                                     |
                                     v
                          @scope/system-one
                                     |
                              SystemOne
                                     |
                           SystemOneProvider
                                     |
                  +------------------+------------------+
                  |                  |                  |
                  v                  v                  v
          HttpSystemOneProvider   CustomProvider    FutureProvider
                  |
        +---------+---------+
        |                   |
        v                   v
   TypeSafe Jev          Reflex
      hosted              local
        |                   |
        +---- /v1/systemone-+
```

The most important sentence for everyone implementing or reviewing this project is:

> **System One is the abstraction. Providers implement it. Pi exposes it. Pi-Bifrost consumes it.**

Everything else should follow from that.

The research-backed assumptions in the document are current as of September 22, 2026: Pi supports TypeScript extensions and custom tools, Reflex exposes a TypeSafe-compatible `/v1/systemone` endpoint, and the TypeSafe JS SDK exposes System One as its own API capability. :chatgpt-content-reference{index="12"}