import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
  applyConfigAnswers,
  type ConfigMode,
  createSessionConfig,
  describeConfig,
  type SessionConfig,
  TYPESAFE_BASE_URL,
  TYPESAFE_MODEL,
} from "./config.ts";
import { saveStoredConfig } from "./persistence.ts";
import { isTypeSafeEndpoint, resolveSessionProvider } from "./provider.ts";
import { buildSystemOneTool } from "./tool.ts";

export interface SessionStore {
  session?: SessionConfig;
}

export function registerSystemOneCommands(
  pi: ExtensionAPI,
  store: SessionStore,
  configPath?: string,
) {
  let registered = false;
  function applyProvider() {
    if (registered) return;
    registered = true;
    pi.registerTool(
      buildSystemOneTool({
        resolveProvider: (ctx) =>
          resolveSessionProvider(store.session ?? createSessionConfig(), ctx),
      }),
    );
  }

  async function cmdConfig(
    ctx: ExtensionCommandContext,
    requestedMode?: string,
  ): Promise<void> {
    const current = store.session ?? createSessionConfig();
    const modeRaw =
      requestedMode ??
      (await ctx.ui.input(
        `Provider mode (typesafe / custom / native; current: ${current.mode}):`,
        current.mode,
      ));
    if (modeRaw === undefined) {
      ctx.ui.notify("Cancelled.", "info");
      return;
    }
    const mode = (modeRaw.trim().toLowerCase() || current.mode) as ConfigMode;
    if (!["typesafe", "custom", "native"].includes(mode)) {
      ctx.ui.notify("Choose typesafe, custom, or native.", "error");
      return;
    }
    const next: SessionConfig = {
      current: { ...current.current },
      mode,
      keyInMemory: current.keyInMemory,
    };
    if (mode === "typesafe") {
      next.current.baseUrl = TYPESAFE_BASE_URL;
      next.current.model = TYPESAFE_MODEL;
      // A key exported for a custom endpoint must not follow a mode switch.
      next.current.apiKey =
        !process.env.SYSTEM_ONE_BASE_URL ||
        isTypeSafeEndpoint(process.env.SYSTEM_ONE_BASE_URL)
          ? process.env.SYSTEM_ONE_API_KEY || undefined
          : undefined;
      next.keyInMemory = false;
    } else if (mode === "native") {
      next.current.baseUrl = "";
      next.current.model = TYPESAFE_MODEL;
      next.current.apiKey = undefined;
      next.keyInMemory = false;
    } else {
      const baseUrlRaw = await ctx.ui.input(
        `SYSTEM_ONE_BASE_URL (current: ${current.mode === "custom" ? current.current.baseUrl : "unset"}):`,
        current.mode === "custom" ? current.current.baseUrl : "",
      );
      if (baseUrlRaw === undefined) {
        ctx.ui.notify("Cancelled.", "info");
        return;
      }
      const baseUrl =
        baseUrlRaw.trim() ||
        (current.mode === "custom" ? current.current.baseUrl : "");
      if (!baseUrl) {
        ctx.ui.notify("Cancelled (base URL is required).", "info");
        return;
      }
      const modelRaw = await ctx.ui.input(
        `SYSTEM_ONE_MODEL (current: ${current.mode === "custom" ? (current.current.model ?? "server default") : "server default"}):`,
        current.mode === "custom" ? (current.current.model ?? "") : "",
      );
      if (modelRaw === undefined) {
        ctx.ui.notify("Cancelled.", "info");
        return;
      }
      const apiKeyRaw = await ctx.ui.input(
        "SYSTEM_ONE_API_KEY (empty = keep, - = forget session key; never saved to JSON):",
        "",
      );
      if (apiKeyRaw === undefined) {
        ctx.ui.notify("Cancelled.", "info");
        return;
      }
      next.current.baseUrl = baseUrl;
      next.current.model =
        modelRaw.trim() ||
        (current.mode === "custom" ? current.current.model : undefined);
      if (baseUrl !== current.current.baseUrl || current.mode !== "custom") {
        // Never carry a key entered for one endpoint to another endpoint.
        next.current.apiKey = undefined;
        next.keyInMemory = false;
      }
      if (apiKeyRaw.trim() === "-") {
        next.current.apiKey =
          baseUrl === current.current.baseUrl &&
          process.env.SYSTEM_ONE_BASE_URL === baseUrl
            ? process.env.SYSTEM_ONE_API_KEY || undefined
            : undefined;
        next.keyInMemory = false;
      } else if (apiKeyRaw.trim()) {
        applyConfigAnswers(next, {
          baseUrl: "",
          model: "",
          apiKey: apiKeyRaw.trim(),
          timeoutMs: "",
        });
      }
    }
    if (configPath) {
      try {
        saveStoredConfig(configPath, {
          mode,
          ...(mode === "custom"
            ? {
                baseUrl: next.current.baseUrl,
                ...(next.current.model ? { model: next.current.model } : {}),
              }
            : {}),
          timeoutMs: next.current.timeoutMs,
        });
      } catch (error) {
        ctx.ui.notify(
          `Could not save settings: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
        return;
      }
    }
    store.session = next;
    ctx.ui.notify(
      next.keyInMemory
        ? "Updated. API key stays in memory only; other settings were saved."
        : configPath
          ? "Settings saved."
          : "Updated for this session.",
      "info",
    );
  }

  async function cmdStatus(ctx: ExtensionCommandContext): Promise<void> {
    const session = store.session ?? createSessionConfig();
    let summary = describeConfig(session);
    if (session.mode === "native") {
      summary = summary.replace(
        "api key: absent",
        "api key: managed by Pi (native classifier)",
      );
    } else if (
      !session.current.apiKey &&
      isTypeSafeEndpoint(session.current.baseUrl)
    ) {
      const key = await ctx.modelRegistry?.getApiKeyForProvider?.("typesafe");
      summary = summary.replace(
        "api key: absent",
        key
          ? "api key: Pi TypeSafe credentials available"
          : "api key: absent (run /login typesafe)",
      );
    }
    ctx.ui.notify(summary, "info");
  }

  pi.registerCommand("so", {
    description: "System One config (/so status for current)",
    getArgumentCompletions: (prefix: string) =>
      ["config", "status"]
        .filter((c) => c.startsWith(prefix.trim().toLowerCase()))
        .map((c) => ({ value: c, label: c })),
    handler: async (args, ctx) => {
      const [cmd, mode] = args.trim().toLowerCase().split(/\s+/);
      if (cmd === "status") await cmdStatus(ctx);
      else await cmdConfig(ctx, cmd === "config" ? mode : undefined);
    },
  });
  return { applyProvider, store };
}
