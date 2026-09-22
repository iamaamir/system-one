// pi-system-one/tests/tool.test.ts

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockSystemOneProvider } from "system-one-core";
import { buildSystemOneTool } from "../src/tool.ts";

describe("system_one tool", () => {
  it("delegates a mixed batch and preserves details", async () => {
    const tool = buildSystemOneTool({
      provider: new MockSystemOneProvider({
        answers: {
          t: {
            type: "choice",
            choice: "a",
            probabilities: { a: 1 },
            confidence: 1,
          },
        },
      }),
    });
    const res = await tool.execute(
      "id-1",
      {
        state: "hi",
        questions: {
          t: { type: "choice", instructions: "W?", criteria: { a: null } },
        },
      },
      undefined,
      undefined,
      {} as never,
    );
    const text = JSON.stringify(res);
    assert.match(text, /"a"/);
    assert.equal((res.details.answers.t as { choice: string }).choice, "a");
  });
  it("propagates provider errors by throwing (never error-results)", async () => {
    const tool = buildSystemOneTool({
      provider: {
        id: "boom",
        async evaluate() {
          throw new Error("down");
        },
      },
    });
    await assert.rejects(
      tool.execute(
        "id-2",
        {
          state: "x",
          questions: { q: { type: "noul", instructions: "Is it?" } },
        },
        undefined,
        undefined,
        {} as never,
      ),
      /down/,
    );
  });
  it("mixed heterogeneous batch with model+signal+usage", async () => {
    let seenRequest: any;
    let seenOptions: any;
    const stub = {
      id: "stub",
      async evaluate(req: any, opts: any) {
        seenRequest = req;
        seenOptions = opts;
        return {
          answers: {
            c: {
              type: "choice",
              choice: "a",
              probabilities: { a: 0.9, b: 0.1 },
              confidence: 0.9,
            },
            n: { type: "noul", noul: 0.8 },
            s: {
              type: "score",
              score: 1.5,
              probabilities: { "0": 0.5, "1": 0.5 },
              legend: { "0": "easy", "1": "hard" },
              confidence: 0.9,
            },
          },
          usage: { inputTokens: 5, outputTokens: 2 },
          metadata: { provider: "stub" },
        };
      },
    };
    const tool = buildSystemOneTool({ provider: stub as any });
    const controller = new AbortController();
    const res = await tool.execute(
      "id-3",
      {
        state: "hi",
        model: "jev-latest",
        questions: {
          c: {
            type: "choice",
            instructions: "W?",
            criteria: { a: null, b: null },
          },
          n: { type: "noul", instructions: "Is it?" },
          s: {
            type: "score",
            instructions: "How hard?",
            criteria: ["easy", "hard"],
          },
        },
      },
      controller.signal,
      undefined,
      {} as never,
    );
    assert.equal((res.details.answers.c as { choice: string }).choice, "a");
    assert.equal((res.details.answers.n as { noul: number }).noul, 0.8);
    assert.equal((res.details.answers.s as { score: number }).score, 1.5);
    assert.deepEqual(res.details.usage, { inputTokens: 5, outputTokens: 2 });
    assert.deepEqual(res.details.metadata, { provider: "stub" });
    assert.equal(seenRequest.model, "jev-latest");
    assert.equal(seenOptions.signal, controller.signal);
  });
});
