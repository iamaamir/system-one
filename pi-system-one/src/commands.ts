// pi-system-one/src/commands.ts
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { HttpSystemOneProvider } from "system-one-core";
import {
  DEFAULT_API_KEY_ENV,
  describeProfile,
  getActiveProfile,
  loadConfigFile,
  resolveExtConfig,
  type SystemOneConfigFile,
  saveConfigFile,
} from "./config.ts";
import { buildSystemOneTool } from "./tool.ts";

export function registerSystemOneCommands(pi: ExtensionAPI) {
  function applyActiveProvider(cfg: SystemOneConfigFile) {
    const active = getActiveProfile(cfg);
    if (!active) return;
    const ext = resolveExtConfig(active);
    const provider = new HttpSystemOneProvider({
      id: "configured",
      baseUrl: ext.baseUrl,
      apiKey: ext.apiKey,
      defaultModel: ext.model,
      timeoutMs: ext.timeoutMs,
    });
    const tool = buildSystemOneTool({ provider });
    pi.registerTool(tool);
  }

  async function cmdInit(ctx: ExtensionCommandContext): Promise<void> {
    const name = await ctx.ui.input("Profile name:", "my-provider");
    if (!name) {
      ctx.ui.notify("Cancelled.", "info");
      return;
    }

    const baseUrl = await ctx.ui.input("Base URL:", "http://localhost:8008");
    if (!baseUrl) {
      ctx.ui.notify("Cancelled.", "info");
      return;
    }

    const model = await ctx.ui.input("Model (optional):", "");
    const apiKeyEnv = await ctx.ui.input(
      "Env var holding the API key (clear for keyless providers):",
      DEFAULT_API_KEY_ENV,
    );
    const timeoutStr = await ctx.ui.input("Timeout ms:", "10000");
    const timeoutMs = Number(timeoutStr) || 10_000;

    const cfg = loadConfigFile();
    cfg.profiles[name] = {
      baseUrl,
      model: model || undefined,
      timeoutMs,
      apiKeyEnv: apiKeyEnv || undefined,
    };
    if (!cfg.active) cfg.active = name;
    saveConfigFile(cfg);
    applyActiveProvider(cfg);

    ctx.ui.notify(`Profile "${name}" saved. Active: ${cfg.active}`, "info");
  }

  async function cmdUse(
    name: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    const cfg = loadConfigFile();
    if (!cfg.profiles[name]) {
      ctx.ui.notify(
        `Profile "${name}" not found. Run /sov init first.`,
        "error",
      );
      return;
    }
    cfg.active = name;
    saveConfigFile(cfg);
    applyActiveProvider(cfg);
    ctx.ui.notify(`Active profile: ${name}`, "info");
  }

  async function cmdList(ctx: ExtensionCommandContext): Promise<void> {
    const cfg = loadConfigFile();
    const entries = Object.entries(cfg.profiles);
    if (!entries.length) {
      ctx.ui.notify("No profiles configured. Run /sov init.", "info");
      return;
    }
    const text = entries
      .map(([n, p]) => describeProfile(n, p, n === cfg.active))
      .join("\n\n");
    ctx.ui.notify(text, "info");
  }

  async function cmdStatus(
    _args: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    const cfg = loadConfigFile();
    const active = getActiveProfile(cfg);
    if (!active) {
      ctx.ui.notify("No active profile. Run /sov init.", "info");
      return;
    }
    ctx.ui.notify(describeProfile(cfg.active, active, true), "info");
  }

  async function cmdRm(
    name: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    const cfg = loadConfigFile();
    if (!cfg.profiles[name]) {
      ctx.ui.notify(`Profile "${name}" not found.`, "error");
      return;
    }
    delete cfg.profiles[name];
    if (cfg.active === name) cfg.active = Object.keys(cfg.profiles)[0] || "";
    saveConfigFile(cfg);
    applyActiveProvider(cfg);
    ctx.ui.notify(`Removed "${name}". Active: ${cfg.active || "none"}`, "info");
  }

  pi.registerCommand("sov", {
    description: "System One provider config: init / use / list / status / rm",
    handler: async (args, ctx) => {
      const [cmd, ...rest] = args.trim().split(/\s+/);
      switch (cmd) {
        case "init":
          await cmdInit(ctx);
          break;
        case "use":
          await cmdUse(rest.join(" "), ctx);
          break;
        case "list":
          await cmdList(ctx);
          break;
        case "status":
          await cmdStatus("", ctx);
          break;
        case "rm":
          await cmdRm(rest.join(" "), ctx);
          break;
        default:
          ctx.ui.notify(
            "Usage: /sov init | /sov use <name> | /sov list | /sov status | /sov rm <name>",
            "info",
          );
      }
    },
  });
}
