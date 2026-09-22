// pi-system-one/src/extension.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { HttpSystemOneProvider } from "system-one-core";
import { loadSystemOneConfig } from "./config.ts";
import { buildSystemOneTool } from "./tool.ts";

export default function piSystemOneExtension(pi: ExtensionAPI) {
  const cfg = loadSystemOneConfig();
  const tool = buildSystemOneTool({
    provider: new HttpSystemOneProvider({
      id: "configured",
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      defaultModel: cfg.model,
      timeoutMs: cfg.timeoutMs,
    }),
  });
  pi.registerTool(tool);
}
