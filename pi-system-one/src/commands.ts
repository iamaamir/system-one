// pi-system-one/src/commands.ts
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { HttpSystemOneProvider } from "system-one-core";
import {
  applyConfigAnswers,
  blankSession,
  type ConfigAnswers,
  describeConfig,
  type SessionConfig,
} from "./config.ts";
import { buildSystemOneTool } from "./tool.ts";

/** Mutable holder: empty until env or `/so config` provides a base URL. */
export interface SessionStore {
  session?: SessionConfig;
}

export function registerSystemOneCommands(
  pi: ExtensionAPI,
  store: SessionStore,
) {
  function applyProvider() {
    if (!store.session) return;
    const ext = store.session.current;
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
    const cur = store.session?.current;
    const baseUrl = await ctx.ui.input(
      `SYSTEM_ONE_BASE_URL (current: ${cur?.baseUrl ?? "unset"}):`,
      cur?.baseUrl ?? "",
    );
    if (!baseUrl) {
      ctx.ui.notify("Cancelled (base URL is required).", "info");
      return;
    }
    const model = await ctx.ui.input(
      `SYSTEM_ONE_MODEL (current: ${cur?.model ?? "server default"}):`,
      cur?.model ?? "",
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
    const answers: ConfigAnswers = {
      baseUrl,
      model,
      apiKey,
      timeoutMs: "",
    };
    if (!store.session) {
      store.session = blankSession();
    }
    const memoryKey = applyConfigAnswers(store.session, answers);
    applyProvider();
    ctx.ui.notify(
      memoryKey
        ? "Updated for this session. API key is in memory only and will be gone when the session closes; export SYSTEM_ONE_API_KEY to persist it."
        : "Updated for this session.",
      "info",
    );
  }

  async function cmdStatus(ctx: ExtensionCommandContext): Promise<void> {
    if (!store.session) {
      ctx.ui.notify(
        "System One is not configured. Export SYSTEM_ONE_BASE_URL or run /so config.",
        "info",
      );
      return;
    }
    ctx.ui.notify(describeConfig(store.session), "info");
  }

  pi.registerCommand("so", {
    description: "System One config (/so status for current)",
    handler: async (args, ctx) => {
      const [cmd] = args.trim().split(/\s+/);
      if (cmd === "status") await cmdStatus(ctx);
      else await cmdConfig(ctx);
    },
  });

  return { applyProvider, store };
}
