// pi-system-one/src/extension.ts

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ExtensionAPI,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { registerSystemOneCommands, type SessionStore } from "./commands.ts";
import { createSessionConfig } from "./config.ts";
import { loadStoredConfig } from "./persistence.ts";

/**
 * Directory holding the bundled `system-one` skill (use-case catalog).
 * Resolved relative to this file: Pi loads `./src/extension.ts` directly
 * (see package.json `pi.extensions`), so `../skills` is the package root's
 * `skills/` directory, which ships with the published package.
 */
export function systemOneSkillsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
}

/** Same as above for the bundled `/judge` prompt template. */
export function systemOnePromptsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "prompts");
}

export default function piSystemOneExtension(pi: ExtensionAPI) {
  const configPath = join(getAgentDir(), "pi-system-one.json");
  const store: SessionStore = {};
  try {
    store.session = createSessionConfig(
      process.env,
      loadStoredConfig(configPath),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      store.session = createSessionConfig(process.env);
    } catch {
      store.session = createSessionConfig({});
    }
    pi.on("session_start", (_event, ctx) => {
      ctx.ui.notify(
        `System One: ${message}. Ignoring saved settings; fix them or run /so config.`,
        "warning",
      );
    });
  }

  const { applyProvider } = registerSystemOneCommands(pi, store, configPath);
  applyProvider();

  // Contribute the bundled `system-one` skill (use-case catalog) and the
  // `/judge` prompt shortcut so models can pull judging recipes on demand
  // without per-turn prompt tax.
  // Done at runtime (not via package.json `pi` manifest keys) so the
  // resources also load when this file is used directly (`pi -e ...`), and
  // with no `skills`/`prompts` keys in the manifest there is exactly one
  // registration.
  pi.on("resources_discover", () => ({
    skillPaths: [systemOneSkillsDir()],
    promptPaths: [systemOnePromptsDir()],
  }));
}
