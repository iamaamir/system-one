#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  evaluateSystemOne,
  systemOneDescription,
  systemOneInputSchema,
  systemOneOutputSchema,
} from "./tool.ts";

export function createSystemOneMcpServer(): McpServer {
  const server = new McpServer({ name: "systemone-mcp", version: "0.1.0" });
  server.registerTool(
    "system_one",
    {
      description: systemOneDescription,
      inputSchema: systemOneInputSchema,
      outputSchema: systemOneOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args, extra) => {
      const result = await evaluateSystemOne(args, extra.signal);
      return {
        content: [{ type: "text", text: result.text }],
        structuredContent: result.structuredContent as unknown as Record<
          string,
          unknown
        >,
      };
    },
  );
  return server;
}

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  try {
    // npm and npx invoke bin entries through a symlink in node_modules/.bin.
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  await createSystemOneMcpServer().connect(new StdioServerTransport());
}
