# AGENTS.md — system-one

Monorepo (npm workspaces): `system-one-core` (TS runtime, published) → `pi-system-one` (Pi extension, consumes core). `pi-bifrost` is a symlink to a separate repo; never commit through it.

## Commands (root)

- `npm test` / `npm run typecheck` — both packages.
- `npm run lint` / `npm run format` — Biome. Config in `biome.json`.
- `npm run ci:local` — full CI job via `act` (needs Docker; script pins amd64 + 24.04 image for Apple Silicon).
- `npm run release` — interactive bump/tag/push helper (`scripts/release.mjs`). Convention: workspace dir == npm name == tag prefix (`<name>@<version>`); never break it.
- `npm --workspace system-one-core run fixtures:revalidate` — replays golden fixtures live. Needs `TYPESAFE_API_KEY`; Reflex fixtures need a local server (`SYSTEM_ONE_REFLEX_URL`, default `http://localhost:8008`; `providers/reflex/run.sh` serves CPU on 8009, MPS on 8008).

## Gotchas

- `pi-system-one` resolves `system-one-core` via its built `dist/` (gitignored). After fresh clone or core changes: `npm run build --workspace system-one-core` before test/typecheck. CI does this; local runs must too.
- Tests use `node --test --experimental-strip-types` (no build step for tests themselves). Core's tsconfig includes `scripts/`.
- Golden fixtures (`system-one-core/tests/fixtures/`) are excluded from Biome — never reformat them. `any` in src is an intentional JSON-boundary type (file-level suppressions); `noExplicitAny` is off only in tests.
- Live contract tests are env-gated (`SYSTEM_ONE_TEST_REFLEX=1`, `SYSTEM_ONE_TEST_TYPESAFE=1`) and skipped otherwise.
- Pushing `.github/workflows/*` requires a token with `workflow` scope; without it the push is rejected. `release.yml` does tag-triggered OIDC npm publishes (no tokens). Pages serves `docs/` via repo Settings → Pages → Deploy from branch (`main` + `/docs`).
- Releases: push tag `<name>@<version>` matching that workspace's `package.json` (the MCP tag is `@system_one/mcp@<version>`); both packages trust the same `release.yml` on npmjs (trusted publisher per package).
