// pi-system-one/tests/tool.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSystemOneTool } from "../src/tool.ts";
import { MockSystemOneProvider } from "system-one-core";

describe("system_one tool", () => {
  it("delegates a mixed batch and preserves details", async () => {
    const tool: any = buildSystemOneTool({
      provider: new MockSystemOneProvider({ answers: { t: { type: "choice", choice: "a", probabilities: { a: 1 }, confidence: 1 } } }),
    });
    const res = await tool.execute("id-1", { state: "hi", questions: { t: { type: "choice", instructions: "W?", criteria: { a: null } } } }, undefined, undefined, {});
    const text = JSON.stringify(res);
    assert.match(text, /"a"/);
    assert.equal(res.details.answers.t.choice, "a");
  });
  it("propagates provider errors by throwing (never error-results)", async () => {
    const tool: any = buildSystemOneTool({
      provider: { id: "boom", async evaluate() { throw new Error("down"); } },
    });
    await assert.rejects(
      tool.execute("id-2", { state: "x", questions: { q: { type: "noul", instructions: "Is it?" } } }, undefined, undefined, {}),
      /down/
    );
  });
});
