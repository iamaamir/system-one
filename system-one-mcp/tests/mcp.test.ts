import assert from "node:assert/strict";
import { it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createSystemOneMcpServer } from "../src/index.ts";

it("advertises exactly one read-only system_one tool", async () => {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  await Promise.all([
    client.connect(clientTransport),
    createSystemOneMcpServer().connect(serverTransport),
  ]);
  const tools = await client.listTools();
  assert.deepEqual(
    tools.tools.map((tool) => tool.name),
    ["system_one"],
  );
  assert.equal(tools.tools[0]?.annotations?.readOnlyHint, true);
  assert.ok(tools.tools[0]?.outputSchema);
  await client.close();
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
