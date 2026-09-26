#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  evaluateSystemOne,
  systemOneDescription,
  systemOneInputSchema,
  systemOneOutputSchema,
} from "./tool.ts";

export function createSystemOneMcpServer(): McpServer {
  const server = new McpServer({ name: "system-one-mcp", version: "0.1.0" });
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

if (
  process.argv[1] &&
  new URL(`file://${process.argv[1]}`).href === import.meta.url
) {
  await createSystemOneMcpServer().connect(new StdioServerTransport());
}
