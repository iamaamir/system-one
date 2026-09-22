// pi-system-one/src/extension.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createSystemOneSession,
  registerSystemOneCommands,
} from "./commands.ts";

export default function piSystemOneExtension(pi: ExtensionAPI) {
  let session: ReturnType<typeof createSystemOneSession> | undefined;
  try {
    session = createSystemOneSession();
  } catch {
    pi.on("session_start", (_event, ctx) => {
      ctx.ui.notify(
        "System One: SYSTEM_ONE_BASE_URL is not set. Export it or run /so config.",
        "warning",
      );
    });
    return;
  }

  const { applyProvider } = registerSystemOneCommands(pi, session);
  applyProvider();
}
