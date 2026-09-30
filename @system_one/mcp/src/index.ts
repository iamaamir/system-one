#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  evaluateSystemOne,
  systemOneDescription,
  systemOneInputSchema,
  systemOneOutputSchema,
} from "./tool.ts";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

export const SYSTEM_ONE_MCP_VERSION = packageJson.version;
export const SYSTEM_ONE_MCP_INSTRUCTIONS =
  "Use system_one for bounded judgments over evidence already available: choose among named options, estimate a yes/no likelihood, or score against an ordered rubric. Retrieve missing factual evidence before calling it. Do not use System One for factual recall, browsing, open-ended generation, or authorization to perform an action. Batch questions that share state into one call.";

export function createSystemOneMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "systemone-mcp",
      version: SYSTEM_ONE_MCP_VERSION,
    },
    { instructions: SYSTEM_ONE_MCP_INSTRUCTIONS },
  );
  server.registerTool(
    "system_one",
    {
      description: systemOneDescription,
      inputSchema: systemOneInputSchema,
      outputSchema: systemOneOutputSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
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
