# @system_one/mcp

Local STDIO MCP adapter exposing one provider-neutral `system_one` read-only tool to Codex CLI, Claude Code, and ChatGPT desktop.

The adapter runs one local process and calls the configured `/v1/systemone` endpoint through `system-one-core`. It has no routing, fallback, retry, persistence, or hosted service.

## Install and register

This prerelease is published under the `next` dist-tag, so use
`@system_one/mcp@next` in registration commands until the stable release. After
the stable release, the unversioned `@system_one/mcp` package command will apply.

The examples below use shell variables so you do not type the API key literally
into the registration command. Set the required base URL and key:

```bash
export SYSTEM_ONE_BASE_URL="https://your-system-one.example.com"
export SYSTEM_ONE_API_KEY="your-api-key"
```

`codex mcp add` and `claude mcp add` store the resolved environment values in
their local MCP configuration. Protect those files and use an appropriate
secret-management workflow for your machine. `SYSTEM_ONE_MODEL` and
`SYSTEM_ONE_TIMEOUT_MS` are optional; export them only when needed, then add
their corresponding flags below.

### Codex CLI

Register a server named `system-one`:

```bash
codex mcp add \
  --env "SYSTEM_ONE_BASE_URL=${SYSTEM_ONE_BASE_URL}" \
  --env "SYSTEM_ONE_API_KEY=${SYSTEM_ONE_API_KEY}" \
  system-one -- npx -y @system_one/mcp@next
codex mcp list
```

If needed, add `--env "SYSTEM_ONE_MODEL=${SYSTEM_ONE_MODEL}"` and/or
`--env "SYSTEM_ONE_TIMEOUT_MS=${SYSTEM_ONE_TIMEOUT_MS}"` before `system-one`.

The `--env` option can be repeated for each variable. The equivalent Codex
`config.toml` entry (usually `~/.codex/config.toml`) is:

```toml
[mcp_servers.system_one]
command = "npx"
args = ["-y", "@system_one/mcp@next"]
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

### Claude Code

By default, Claude Code registers the server for the current project. Add
`--scope user` to make it available across your projects:

```bash
claude mcp add --scope user system-one \
  -e "SYSTEM_ONE_BASE_URL=${SYSTEM_ONE_BASE_URL}" \
  -e "SYSTEM_ONE_API_KEY=${SYSTEM_ONE_API_KEY}" \
  -- npx -y @system_one/mcp@next
claude mcp list
```

If needed, add `-e "SYSTEM_ONE_MODEL=${SYSTEM_ONE_MODEL}"` and/or
`-e "SYSTEM_ONE_TIMEOUT_MS=${SYSTEM_ONE_TIMEOUT_MS}"` before `--`.

For a project-local registration, omit `--scope user`. Bash and zsh expand the
quoted `${...}` values while preserving their contents. The registration
commands still persist the resolved values locally, so protect the resulting
MCP configuration files.

### ChatGPT desktop

ChatGPT desktop still requires GUI setup: open Settings → MCP servers, add the
server with command `npx`, arguments `-y @system_one/mcp@next`, and
`SYSTEM_ONE_BASE_URL` and `SYSTEM_ONE_API_KEY`. Add `SYSTEM_ONE_MODEL` and
`SYSTEM_ONE_TIMEOUT_MS` when needed, then restart the app. There is no CLI
registration command for the desktop app.

The package includes `skills/system-one/SKILL.md`. For Codex CLI discovery,
copy that file into the project's `.agents/skills/system-one/SKILL.md` (or the
user-level `$CODEX_HOME/skills/system-one/SKILL.md`). ChatGPT desktop discovers the tool from
the MCP registration and its tool description; restart after changing either
configuration.

To manually bootstrap the first prerelease, run `npm publish --access public
--tag next` from this scoped workspace directory.

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
