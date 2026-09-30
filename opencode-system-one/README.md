# opencode-system-one

System One decisions for OpenCode. Ask ordinary questions and get calibrated probabilities for bounded decisions.

## Installation

Install the plugin globally with the OpenCode CLI:

```bash
opencode plug -g opencode-system-one
```

You can also add it to the `plugin` array in `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-system-one"]
}
```

## Configuration

Set `SYSTEM_ONE_BASE_URL` before starting OpenCode. The plugin sends requests to the standard `/v1/systemone` path:

```bash
export SYSTEM_ONE_BASE_URL="https://api.typesafe.ai"
export SYSTEM_ONE_API_KEY="your-api-key"
export SYSTEM_ONE_MODEL="jev-latest"
```

For a locally hosted model:

```bash
export SYSTEM_ONE_BASE_URL="http://localhost:8008"
```

`SYSTEM_ONE_API_KEY`, `SYSTEM_ONE_MODEL`, and `SYSTEM_ONE_TIMEOUT_MS` are optional. Timeout defaults to 10 seconds. API-key requests require HTTPS for remote providers; plain HTTP is supported for local loopback hosts.

If `SYSTEM_ONE_BASE_URL` is missing or invalid, OpenCode logs a warning and skips registering the `system_one` tool.

## Usage

Ask OpenCode questions naturally. Include the relevant context in your prompt and request probabilities when you want a System One judgment.

### Choice

```text
Which team should investigate this issue: frontend, backend, or platform? Give me the probability for each and your confidence in the pick.
```

### Yes/no judgment

```text
Should we ship this change or revert it? Give me the probability that shipping causes a follow-up bug within a week.
```

### Ordered rating

```text
How severe is this incident? Rate it as minor, degraded, or blocking, with probabilities and confidence.
```

System One is for bounded judgments over supplied context. It is not a replacement for factual lookup, browsing, or open-ended writing. Retrieve facts first, then ask System One to evaluate the supplied evidence.

Independent judgments over the same context are batched automatically when appropriate.

## License

MIT
