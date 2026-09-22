// pi-system-one/src/extension.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { HttpSystemOneProvider } from "system-one-core";
import { registerSystemOneCommands } from "./commands.ts";
import {
  getActiveProfile,
  loadConfigFile,
  resolveExtConfig,
  type SystemOneProfile,
  saveConfigFile,
  seedDefaults,
} from "./config.ts";
import { buildSystemOneTool } from "./tool.ts";

function buildToolForProfile(pi: ExtensionAPI, profile: SystemOneProfile) {
  const ext = resolveExtConfig(profile);
  const provider = new HttpSystemOneProvider({
    id: "configured",
    baseUrl: ext.baseUrl,
    apiKey: ext.apiKey,
    defaultModel: ext.model,
    timeoutMs: ext.timeoutMs,
  });
  pi.registerTool(buildSystemOneTool({ provider }));
}

export default function piSystemOneExtension(pi: ExtensionAPI) {
  // Seed shipped profiles (reflex, jev) on first run; never touch user profiles.
  const cfg = loadConfigFile();
  const hadProfiles = Object.keys(cfg.profiles).length > 0;
  seedDefaults(cfg);
  if (!hadProfiles) saveConfigFile(cfg);

  // Register slash commands for config/switching
  registerSystemOneCommands(pi);

  // Build initial tool from active profile
  const active = getActiveProfile(cfg);
  if (active) {
    buildToolForProfile(pi, active);
  } else {
    pi.on("session_start", (_event, ctx) => {
      ctx.ui.notify(
        "System One: no profile configured. Run /sov init",
        "warning",
      );
    });
  }
}
