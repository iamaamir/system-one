# System One for Codex and ChatGPT Desktop — Design

Date: 2026-09-26  
Status: Proposed
Scope: one local tool adapter; no change to System One semantics

## Decision

Build one small local adapter that registers a `system_one` tool. Its handler
calls `system-one-core`, which calls the configured provider's
`/v1/systemone` endpoint.

MCP is only the registration and transport format that Codex CLI and the
ChatGPT desktop app already share. It is not a second decision service, a
provider proxy, an orchestration layer, or a new remote deployment.

```text
Codex CLI or ChatGPT desktop
            |
            | local STDIO MCP tool registration
            v
       system_one handler
            |
            v
    system-one-core / HttpSystemOneProvider
            |
            v
      configured /v1/systemone endpoint
```

The adapter process has one tool, one configured provider, and one request per
tool call. The actual decision request remains exactly the existing HTTP call.

OpenAI documents STDIO MCP as the shared local-tool path for Codex CLI and the
ChatGPT desktop app. [MCP support](https://learn.chatgpt.com/docs/extend/mcp)

## Why not a native direct registration API?

Pi and OpenCode expose their own extension APIs, so they can call
`registerTool` directly. Codex and ChatGPT desktop expose custom local tools
through MCP. Therefore MCP is the thin host-native registration wrapper for
this surface; it is not additional application architecture.

The implementation adds a small dependency on `@modelcontextprotocol/sdk` and
the STDIO protocol framing. It does **not** add a database, HTTP server, OAuth,
credential service, public plugin listing, custom UI, or an extra network hop.

## Scope

### Included now

- Codex CLI.
- ChatGPT desktop app.
- One local STDIO executable named by the eventual package, for example
  `systemone-mcp`.
- One tool named `system_one`.
- Existing TypeSafe Jev, Reflex, and compatible `/v1/systemone` providers.
- Existing environment-variable configuration.
- A small bundled skill that teaches when and how to call the tool.

### Explicitly deferred

- ChatGPT web/mobile/Work support.
- Public plugin-directory distribution.
- A hosted Streamable HTTP MCP service.
- OAuth, server-side credential storage, multi-user configuration, and UI.
- Codex IDE extension support.

ChatGPT web cannot load the user’s local Codex configuration; it requires a
remote MCP-backed plugin. That is a separate product and operational decision,
not a prerequisite for this local adapter. [ChatGPT plugin and local/remote
surface boundaries](https://learn.chatgpt.com/docs/plugins)

## Package shape

Add one workspace:

```text
systemone-mcp/
  src/index.ts       STDIO server startup and one system_one registration
  src/config.ts      safe environment parsing
  src/tool.ts        schema, normalization, core delegation
  src/render.ts      model-readable and structured result mapping
  skills/system-one/SKILL.md
  tests/
  package.json
```

Dependency direction remains one-way:

```text
system-one-core <- systemone-mcp
```

`system-one-core` remains unchanged unless implementation identifies a truly
host-neutral missing capability.

## The tool

Register exactly one read-only tool:

```text
system_one({ state, questions })
```

Its canonical input matches Pi and OpenCode:

```json
{
  "state": { "diff": "- one line", "touched": ["src/tool.ts"] },
  "questions": {
    "team": {
      "type": "choice",
      "instructions": "Which team should investigate?",
      "criteria": {
        "frontend": "Owns the affected UI.",
        "backend": "Owns the affected service."
      }
    },
    "blocked": {
      "type": "noul",
      "instructions": "Is the task blocked?"
    },
    "severity": {
      "type": "score",
      "instructions": "How severe is the impact?",
      "criteria": ["minor", "degraded", "blocking"]
    }
  }
}
```

Rules preserved from the existing adapters:

- `state` accepts arbitrary JSON and remains structured.
- `questions` cannot be empty.
- `choice` needs a non-empty criteria record. Include `none`/`other` when a
  forced choice could be invalid.
- `noul` returns `P(yes)` and has no confidence field.
- `score` takes an ordered array of at least two levels.
- The configured provider model is used for every call; per-call model
  selection is out of scope.
- Reject unknown fields unless a representation-only repair is explicitly
  tested. Never make a semantic guess.

The handler creates `HttpSystemOneProvider` from configuration and calls:

```ts
new SystemOne({ provider }).evaluate({ state, questions }, { signal })
```

It passes MCP cancellation to the core call, returns the core's validated
response as structured content, and renders a concise text view. Score results
must retain their level legend; `noul` must say it is probability of yes;
confidence must not be described as permission to act.

## Configuration

Reuse the existing adapter convention:

```text
SYSTEM_ONE_BASE_URL       required
SYSTEM_ONE_API_KEY        optional
SYSTEM_ONE_MODEL          optional
SYSTEM_ONE_TIMEOUT_MS     optional; default 10000
```

Codex and ChatGPT desktop configure the STDIO process to forward only these
environment variables. The adapter does not write configuration or credentials
to disk and never accepts a key in tool input.

Match OpenCode's hardened validation:

- reject endpoint URLs containing credentials, query strings, fragments,
  whitespace, or raw backslashes;
- require HTTP or HTTPS with an authority;
- require HTTPS when an API key is sent to a non-loopback host;
- allow plain HTTP with a key only for `localhost`, `127.0.0.1`, and `[::1]`;
- redact keys and Authorization values from every error and result.

## Skill

Ship `skills/system-one/SKILL.md`, adapted from Pi's existing skill. It tells
the agent to use the tool for bounded selection, yes/no likelihood, and rubric
scoring over evidence already in context; batch independent questions; retrieve
facts before judging; and avoid using the tool for generation, browsing,
recall, or action approval.

The skill makes tool discovery reliable. It has no effect on the provider call
or the tool's authority.

## Implementation plan

1. Add the workspace, executable entry point, STDIO MCP server, and one
   `system_one` registration.
2. Port the host-neutral schema, safe configuration parsing, rendering, and
   representation-only normalization from Pi/OpenCode. Do not copy either
   host's registration API.
3. Wire the handler to `system-one-core`; preserve abort, timeout, error, and
   response-validation behavior.
4. Add the skill, README, root workspace/release documentation, and package
   tests.
5. Build core, then test the executable in Codex CLI and ChatGPT desktop using
   a mock/local System One provider.

## Verification

- Schema tests: canonical mixed batch, arbitrary JSON state, empty questions,
  malformed question types and criteria, extra fields, and documented repairs.
- Delegation tests: exact core request, configured model, cancellation,
  timeout, HTTP errors, protocol errors, and secret redaction.
- Rendering tests: choice probabilities/confidence, `noul` probability, and
  score probabilities with legends for both accepted key forms.
- Fixture compatibility: replay existing TypeSafe and Reflex fixtures through
  the adapter to prove it does not alter the core contract.
- MCP tests: initialization, one advertised tool, strict input schema,
  read-only annotation, and a STDIO request/response round trip.
- Packaging tests: executable, skill, README, and intended npm files.
- Manual smoke tests: one valid and one invalid call in Codex CLI and ChatGPT
  desktop after starting a new session.

Normal CI has no provider credentials and no ChatGPT account. Existing live
provider contract tests remain opt-in.

## Future: ChatGPT web

If web/mobile/Work support becomes necessary, add it as a separate proposal.
It would reuse the same `tool.ts` and `render.ts`, but needs a public HTTPS
Streamable HTTP MCP server, user authentication, secure per-user provider
configuration, privacy terms, operations, and plugin distribution. None of
those concerns belong in the local adapter or `system-one-core`.

## Definition of done

With only `SYSTEM_ONE_*` environment variables and a local MCP registration,
the same `system_one` call works in Codex CLI and ChatGPT desktop against
TypeSafe Jev, Reflex, or a compatible endpoint. It produces the same validated
answers and readable interpretation as Pi, without a hosted service or a
second provider call.
