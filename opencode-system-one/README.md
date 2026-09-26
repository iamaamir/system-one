# OpenCode System One

`opencode-system-one` is an OpenCode plugin that exposes one `system_one` tool for batched, bounded `choice`, `noul`, and `score` decisions. It uses the provider-neutral `system-one-core` runtime and can connect to TypeSafe Jev, Reflex, or a compatible System One endpoint.

## Installation

Add `opencode-system-one` to the `plugin` array in `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-system-one"]
}
```

OpenCode uses Bun to install npm plugins and their dependencies automatically at startup, so a separate `npm install opencode-system-one` step is not required.

Set `SYSTEM_ONE_BASE_URL` before starting OpenCode. This is the base URL/prefix before the standard `/v1/systemone` path: `https://api.typesafe.ai` sends to `https://api.typesafe.ai/v1/systemone`. Do not include `/v1` unless provider specifically expects the resulting `/v1/v1/systemone`. `SYSTEM_ONE_API_KEY`, `SYSTEM_ONE_MODEL`, and `SYSTEM_ONE_TIMEOUT_MS` are optional; timeout defaults to 10 seconds.

```bash
export SYSTEM_ONE_BASE_URL="http://localhost:8008"
export SYSTEM_ONE_API_KEY="your-api-key"
export SYSTEM_ONE_MODEL="your-model"
export SYSTEM_ONE_TIMEOUT_MS="10000"
```

API-key requests require HTTPS for remote providers. Plain HTTP remains supported for local `localhost`, `127.0.0.1`, and `::1` development.

If required configuration is missing, the plugin logs a warning and skips registering the `system_one` tool.

## Tool usage

Batch independent questions that share the supplied state. A `choice` question takes a criteria object keyed by exact answer labels. A `noul` question is a yes/no question and may take an optional criteria object describing the `"1"` and `"0"` outcomes. A `score` question takes an ordered array of at least two rubric levels, from lowest to highest.

```json
{
  "state": {
    "diff": "- one line",
    "touched": ["src/tool.ts"]
  },
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
      "instructions": "Is the task blocked?",
      "criteria": {
        "1": "Blocked.",
        "0": "Not blocked."
      }
    },
    "severity": {
      "type": "score",
      "instructions": "How severe is the impact?",
      "criteria": ["minor", "degraded", "blocking"]
    }
  }
}
```

Use this tool for bounded decisions over supplied state. Do not use it for factual lookup, browsing, or open-ended text generation.

## Local development

Build `system-one-core` first, then build the plugin:

```bash
npm install
npm run build --workspace system-one-core
npm --workspace opencode-system-one run build
```

To load the locally built plugin, add its absolute file URL to `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///absolute/path/.../dist/index.js"]
}
```

## License

MIT
