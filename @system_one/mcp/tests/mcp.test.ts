import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  createSystemOneMcpServer,
  SYSTEM_ONE_MCP_INSTRUCTIONS,
} from "../src/index.ts";

it("advertises exactly one read-only system_one tool", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  await Promise.all([
    client.connect(clientTransport),
    createSystemOneMcpServer().connect(serverTransport),
  ]);
  assert.equal(client.getServerVersion()?.version, packageJson.version);
  assert.equal(client.getInstructions(), SYSTEM_ONE_MCP_INSTRUCTIONS);
  const tools = await client.listTools();
  assert.deepEqual(
    tools.tools.map((tool) => tool.name),
    ["system_one"],
  );
  assert.equal(tools.tools[0]?.annotations?.readOnlyHint, true);
  assert.equal(tools.tools[0]?.annotations?.openWorldHint, true);
  assert.equal(tools.tools[0]?.annotations?.destructiveHint, undefined);
  assert.equal(tools.tools[0]?.annotations?.idempotentHint, undefined);
  const outputSchema = tools.tools[0]?.outputSchema as {
    properties?: {
      answers?: {
        additionalProperties?: {
          oneOf?: Array<{
            properties?: Record<
              string,
              { const?: string; minimum?: number; maximum?: number }
            >;
          }>;
        };
      };
      usage?: {
        properties?: Record<string, { minimum?: number }>;
      };
      metadata?: {
        properties?: { latencyMs?: { minimum?: number } };
      };
    };
  };
  assert.ok(outputSchema);
  const outputVariants =
    outputSchema.properties?.answers?.additionalProperties?.oneOf ?? [];
  assert.equal(outputVariants.length, 3);
  const outputByType = new Map(
    outputVariants.map((variant) => [variant.properties?.type?.const, variant]),
  );
  assert.equal(outputByType.get("choice")?.properties?.confidence?.maximum, 1);
  assert.equal(outputByType.get("noul")?.properties?.noul?.minimum, 0);
  assert.equal(outputByType.get("score")?.properties?.score?.minimum, 0);
  assert.equal(
    outputSchema.properties?.usage?.properties?.inputTokens?.minimum,
    0,
  );
  assert.equal(
    outputSchema.properties?.metadata?.properties?.latencyMs?.minimum,
    0,
  );
  const inputSchema = tools.tools[0]?.inputSchema as {
    properties?: {
      questions?: {
        type?: string;
        minProperties?: number;
        additionalProperties?: {
          oneOf?: Array<{
            properties?: Record<
              string,
              {
                const?: string;
                type?: string;
                minItems?: number;
                minProperties?: number;
              }
            >;
            required?: string[];
          }>;
        };
      };
    };
  };
  const questionSchema = inputSchema.properties?.questions;
  assert.equal(questionSchema?.type, "object");
  assert.equal(questionSchema?.minProperties, 1);
  const variants = questionSchema?.additionalProperties?.oneOf ?? [];
  assert.equal(variants.length, 3);
  const byType = new Map(
    variants.map((variant) => [variant.properties?.type?.const, variant]),
  );
  assert.deepEqual(byType.get("choice")?.required, [
    "type",
    "instructions",
    "criteria",
  ]);
  assert.equal(byType.get("choice")?.properties?.criteria?.minProperties, 1);
  assert.deepEqual(byType.get("noul")?.required, ["type", "instructions"]);
  assert.equal(byType.get("noul")?.properties?.criteria?.type, "object");
  assert.deepEqual(byType.get("score")?.required, [
    "type",
    "instructions",
    "criteria",
  ]);
  assert.equal(byType.get("score")?.properties?.criteria?.minItems, 2);
  await client.close();
});

it("rejects invalid type and criteria combinations before provider invocation", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({});
  };
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  try {
    await Promise.all([
      client.connect(clientTransport),
      createSystemOneMcpServer().connect(serverTransport),
    ]);
    const invalidArguments = [
      {
        state: "x",
        questions: { q: { type: "choice", instructions: "which?" } },
      },
      {
        state: "x",
        questions: {
          q: { type: "noul", instructions: "likely?", criteria: [] },
        },
      },
      {
        state: "x",
        questions: {
          q: {
            type: "score",
            instructions: "how severe?",
            criteria: { low: null, high: null },
          },
        },
      },
    ];
    for (const args of invalidArguments) {
      const result = await client.callTool({
        name: "system_one",
        arguments: args,
      });
      assert.equal(result.isError, true);
    }
    assert.equal(calls, 0);
  } finally {
    await client.close();
    globalThis.fetch = originalFetch;
  }
});

it("executes one call through the core HTTP provider and returns structured output", async () => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.SYSTEM_ONE_BASE_URL;
  const originalModel = process.env.SYSTEM_ONE_MODEL;
  let request: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    request = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      answers: {
        owner: {
          type: "choice",
          choice: "frontend",
          probabilities: { frontend: 0.9, backend: 0.1 },
          confidence: 0.9,
        },
      },
      metadata: { provider: "fake", latencyMs: 2 },
    });
  };
  process.env.SYSTEM_ONE_BASE_URL = "http://localhost:8008";
  delete process.env.SYSTEM_ONE_MODEL;
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  try {
    await Promise.all([
      client.connect(clientTransport),
      createSystemOneMcpServer().connect(serverTransport),
    ]);
    const result = await client.callTool({
      name: "system_one",
      arguments: {
        state: { diff: "button" },
        questions: {
          owner: {
            type: "choice",
            instructions: "Which team owns this?",
            criteria: { frontend: null, backend: null },
          },
        },
      },
    });
    assert.equal(
      (result.structuredContent as { answers: { owner: { choice: string } } })
        .answers.owner.choice,
      "frontend",
    );
    const content = result.content as Array<{ text?: string }>;
    assert.match(String(content[0]?.text), /choice: frontend/);
    assert.deepEqual(request, {
      state: { diff: "button" },
      questions: {
        owner: {
          type: "choice",
          instructions: "Which team owns this?",
          criteria: { frontend: null, backend: null },
        },
      },
    });
  } finally {
    await client.close();
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.SYSTEM_ONE_BASE_URL;
    else process.env.SYSTEM_ONE_BASE_URL = originalBaseUrl;
    if (originalModel === undefined) delete process.env.SYSTEM_ONE_MODEL;
    else process.env.SYSTEM_ONE_MODEL = originalModel;
  }
});

it("rejects prototype-shaped JSON before invoking the provider", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({});
  };
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  try {
    await Promise.all([
      client.connect(clientTransport),
      createSystemOneMcpServer().connect(serverTransport),
    ]);
    const questionIdArgs = JSON.parse(
      '{"state":"x","questions":{"__proto__":{"type":"noul","instructions":"is it?"}}}',
    ) as Record<string, unknown>;
    const labelArgs = JSON.parse(
      '{"state":"x","questions":{"q":{"type":"choice","instructions":"which?","criteria":{"__proto__":null,"safe":null}}}}',
    ) as Record<string, unknown>;
    const questionIdResult = await client.callTool({
      name: "system_one",
      arguments: questionIdArgs,
    });
    const labelResult = await client.callTool({
      name: "system_one",
      arguments: labelArgs,
    });
    assert.equal(questionIdResult.isError, true);
    assert.equal(labelResult.isError, true);
    assert.equal(calls, 0);
  } finally {
    await client.close();
    globalThis.fetch = originalFetch;
  }
});
