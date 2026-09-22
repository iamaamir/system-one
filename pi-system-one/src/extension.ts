// pi-system-one/src/extension.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSystemOneCommands, type SessionStore } from "./commands.ts";
import { createSessionConfig } from "./config.ts";

export default function piSystemOneExtension(pi: ExtensionAPI) {
  // The /so command is always registered so config stays reachable with
  // no env set. The tool appears once a base URL exists (env or /so config).
  const store: SessionStore = {};
  try {
    store.session = createSessionConfig();
  } catch {
    pi.on("session_start", (_event, ctx) => {
      ctx.ui.notify(
        "System One: SYSTEM_ONE_BASE_URL is not set. Export it or run /so config.",
        "warning",
      );
    });
  }

  const { applyProvider } = registerSystemOneCommands(pi, store);
  applyProvider();
}
