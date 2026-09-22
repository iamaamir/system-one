// pi-system-one/src/commands.ts
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { HttpSystemOneProvider } from "system-one-core";
import {
  applyConfigAnswers,
  createSessionConfig,
  describeConfig,
  type SessionConfig,
} from "./config.ts";
import { buildSystemOneTool } from "./tool.ts";

export function registerSystemOneCommands(
  pi: ExtensionAPI,
  session: SessionConfig,
) {
  function applyProvider() {
    const ext = session.current;
    const provider = new HttpSystemOneProvider({
      id: "configured",
      baseUrl: ext.baseUrl,
      apiKey: ext.apiKey,
      defaultModel: ext.model,
      timeoutMs: ext.timeoutMs,
    });
    pi.registerTool(buildSystemOneTool({ provider }));
  }

  async function cmdConfig(ctx: ExtensionCommandContext): Promise<void> {
    const cur = session.current;
    const baseUrl = await ctx.ui.input("SYSTEM_ONE_BASE_URL:", cur.baseUrl);
    if (baseUrl === undefined) {
      ctx.ui.notify("Cancelled.", "info");
      return;
    }
    const model = await ctx.ui.input(
      "SYSTEM_ONE_MODEL (empty = keep):",
      cur.model ?? "",
    );
    if (model === undefined) {
      ctx.ui.notify("Cancelled.", "info");
      return;
    }
    const apiKey = await ctx.ui.input(
      "SYSTEM_ONE_API_KEY (empty = keep, memory-only, gone when the session closes):",
      "",
    );
    if (apiKey === undefined) {
      ctx.ui.notify("Cancelled.", "info");
      return;
    }
    const timeoutMs = await ctx.ui.input(
      "SYSTEM_ONE_TIMEOUT_MS:",
      String(cur.timeoutMs),
    );
    if (timeoutMs === undefined) {
      ctx.ui.notify("Cancelled.", "info");
      return;
    }
    const memoryKey = applyConfigAnswers(session, {
      baseUrl,
      model,
      apiKey,
      timeoutMs,
    });
    applyProvider();
    ctx.ui.notify(
      memoryKey
        ? "Updated for this session. API key is in memory only and will be gone when the session closes; export SYSTEM_ONE_API_KEY to persist it."
        : "Updated for this session.",
      "info",
    );
  }

  async function cmdStatus(ctx: ExtensionCommandContext): Promise<void> {
    ctx.ui.notify(describeConfig(session), "info");
  }

  pi.registerCommand("so", {
    description: "System One config: config / status",
    handler: async (args, ctx) => {
      const [cmd] = args.trim().split(/\s+/);
      if (cmd === "config") await cmdConfig(ctx);
      else await cmdStatus(ctx);
    },
  });

  return { applyProvider, session };
}

export function createSystemOneSession(): SessionConfig {
  return createSessionConfig();
}
