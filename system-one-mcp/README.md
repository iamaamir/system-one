# system-one-mcp

Local STDIO MCP adapter exposing one provider-neutral `system_one` read-only tool to Codex CLI and ChatGPT desktop.

The adapter runs one local process and calls the configured `/v1/systemone` endpoint through `system-one-core`. It has no routing, fallback, retry, persistence, or hosted service.

Add this to the Codex CLI `config.toml` (usually `~/.codex/config.toml`):

```toml
[mcp_servers.system_one]
command = "npx"
args = ["-y", "system-one-mcp"]
env_vars = [
  "SYSTEM_ONE_BASE_URL",
  "SYSTEM_ONE_API_KEY",
  "SYSTEM_ONE_MODEL",
  "SYSTEM_ONE_TIMEOUT_MS"
]
```

Export those variables in your shell before launching Codex. Set
`SYSTEM_ONE_BASE_URL` to your TypeSafe, Reflex, or compatible provider. Keep
the API key local and use HTTPS for non-loopback providers. Do not commit a
real key to `config.toml`.

The same local MCP configuration works in ChatGPT desktop: open Settings →
MCP servers, add the server with command `npx`, arguments `-y system-one-mcp`,
and the four `SYSTEM_ONE_*` environment variables above, then restart the app.

The package includes `skills/system-one/SKILL.md`. For Codex CLI discovery,
copy that file into the project's `.agents/skills/system-one/SKILL.md` (or the
user-level `$CODEX_HOME/skills/system-one/SKILL.md`). ChatGPT desktop discovers the tool from
the MCP registration and its tool description; restart after changing either
configuration.

Once connected, a minimal call is:

```json
{
  "state": "The export button crashes in Safari.",
  "questions": {
    "owner": {
      "type": "choice",
      "instructions": "Which team should investigate?",
      "criteria": { "frontend": null, "backend": null }
    }
  }
}
```

This is sent to the `system_one` tool. The tool returns validated structured
answers together with a short readable rendering.
