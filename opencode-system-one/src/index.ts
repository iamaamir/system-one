import type { Hooks, Plugin } from "@opencode-ai/plugin";
import { HttpSystemOneProvider } from "system-one-core";
import { loadSystemOneConfig, type SystemOneConfig } from "./config.ts";
import { buildSystemOneTool, parseSystemOneArgs } from "./tool.ts";

const LOG_SERVICE = "opencode-system-one";

export const SystemOnePlugin: Plugin = async ({ client }): Promise<Hooks> => {
  let config: SystemOneConfig;
  try {
    config = loadSystemOneConfig();
  } catch (error) {
    await client.app.log({
      body: {
        service: LOG_SERVICE,
        level: "warn",
        message: error instanceof Error ? error.message : String(error),
      },
    });
    return { tool: {} };
  }

  const provider = new HttpSystemOneProvider({
    id: "configured",
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    defaultModel: config.model,
    timeoutMs: config.timeoutMs,
  });

  return {
    tool: {
      system_one: buildSystemOneTool(provider),
    },
    "tool.execute.before": async (input, output) => {
      if (input.tool === "system_one") {
        output.args = parseSystemOneArgs(output.args);
      }
    },
  };
};

export default SystemOnePlugin;
