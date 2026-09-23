// pi-system-one/tests/tool.test.ts

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockSystemOneProvider } from "system-one-core";
import { Value } from "typebox/value";
import {
  buildSystemOneTool,
  prepareSystemOneArgs,
  systemOneParams,
} from "../src/tool.ts";

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
    assert.equal(seenOptions.signal, controller.signal);
    assert.equal(seenRequest.state, "hi");
  });

  describe("low-quality model tolerance", () => {
    // Each raw input is a shape weak models emit that failed validation
    // against the old union/literal schema. prepareSystemOneArgs must coerce
    // it into something the flat schema accepts.
    const sloppy: Array<[string, unknown]> = [
      [
        "capitalised type",
        {
          state: "hi",
          questions: {
            t: { type: "Choice", instructions: "W?", criteria: { a: null } },
          },
        },
      ],
      [
        "options alias",
        {
          state: "hi",
          questions: {
            t: { type: "choice", instructions: "W?", options: ["a", "b"] },
          },
        },
      ],
      [
        "choices record alias",
        {
          state: "hi",
          questions: {
            t: { type: "choice", instructions: "W?", choices: { a: null } },
          },
        },
      ],
      [
        "array questions",
        {
          state: "hi",
          questions: [
            {
              name: "t",
              type: "choice",
              instructions: "W?",
              criteria: { a: null },
            },
          ],
        },
      ],
      [
        "singular question key",
        {
          state: "hi",
          question: {
            t: { type: "choice", instructions: "W?", criteria: { a: null } },
          },
        },
      ],
      [
        "unwrapped single question",
        {
          state: "hi",
          questions: {
            type: "choice",
            instructions: "W?",
            criteria: { a: null },
          },
        },
      ],
      [
        "junk description field",
        {
          state: "hi",
          questions: {
            t: {
              type: "choice",
              instructions: "W?",
              criteria: { a: null },
              description: "extra",
            },
          },
        },
      ],
      [
        "boolean synonym",
        {
          state: "x",
          questions: { q: { type: "boolean", instructions: "Is it?" } },
        },
      ],
      [
        "rating synonym",
        {
          state: "x",
          questions: {
            q: {
              type: "rating",
              instructions: "How?",
              criteria: ["low", "high"],
            },
          },
        },
      ],
      [
        "choice array criteria",
        {
          state: "hi",
          questions: {
            t: { type: "choice", instructions: "W?", criteria: ["a", "b"] },
          },
        },
      ],
      [
        "context alias",
        {
          context: "hi",
          questions: {
            t: { type: "choice", instructions: "W?", criteria: { a: null } },
          },
        },
      ],
      [
        "prompt alias",
        {
          state: "hi",
          questions: {
            t: { type: "choice", prompt: "W?", criteria: { a: null } },
          },
        },
      ],
      [
        "yes/no synonym with slash",
        {
          state: "x",
          questions: { q: { type: "Yes/No", instructions: "Is it?" } },
        },
      ],
      [
        "duplicate array names",
        {
          state: "hi",
          questions: [
            {
              name: "t",
              type: "choice",
              instructions: "W?",
              criteria: { a: null },
            },
            { name: "t", type: "noul", instructions: "Is it?" },
          ],
        },
      ],
    ];
    for (const [name, raw] of sloppy) {
      it(`accepts ${name}`, () => {
        const prepared = prepareSystemOneArgs(raw);
        assert.equal(
          Value.Check(systemOneParams, prepared),
          true,
          `prepared args still fail validation: ${JSON.stringify(prepared)}`,
        );
      });
    }

    it("folds options array to null-valued criteria record", () => {
      assert.deepEqual(
        prepareSystemOneArgs({
          state: "hi",
          questions: {
            t: { type: "choice", instructions: "W?", options: ["a", "b"] },
          },
        }),
        {
          state: "hi",
          questions: {
            t: {
              type: "choice",
              instructions: "W?",
              criteria: { a: null, b: null },
            },
          },
        },
      );
    });

    it("suffixes duplicate array question names instead of dropping", () => {
      assert.deepEqual(
        prepareSystemOneArgs({
          state: "hi",
          questions: [
            {
              name: "t",
              type: "choice",
              instructions: "W?",
              criteria: { a: null },
            },
            { name: "t", type: "noul", instructions: "Is it?" },
          ],
        }),
        {
          state: "hi",
          questions: {
            t: { type: "choice", instructions: "W?", criteria: { a: null } },
            t_2: { type: "noul", instructions: "Is it?" },
          },
        },
      );
    });

    it("unwraps single questions with extra fields so validation reports the field", () => {
      const prepared = prepareSystemOneArgs({
        state: "hi",
        questions: {
          type: "choice",
          instructions: "W?",
          criteria: { a: null },
          foo: "bar",
        },
      });
      assert.deepEqual(prepared, {
        state: "hi",
        questions: {
          q: {
            type: "choice",
            instructions: "W?",
            criteria: { a: null },
            foo: "bar",
          },
        },
      });
      assert.equal(Value.Check(systemOneParams, prepared), false);
      const dump = [...Value.Errors(systemOneParams, prepared)].map((e: any) =>
        JSON.stringify(e),
      );
      assert.ok(
        dump.some((d) => d.includes("foo") && d.includes("/questions/q")),
        `expected an error attributing foo to questions.q, got ${dump.join(" | ")}`,
      );
    });

    it("leaves genuinely unknown types for validation to reject", () => {
      const prepared = prepareSystemOneArgs({
        state: "hi",
        questions: { t: { type: "essay", instructions: "W?" } },
      }) as unknown as { questions: { t: { type: string } } };
      assert.equal(prepared.questions.t.type, "essay");
      assert.equal(Value.Check(systemOneParams, prepared), false);
    });

    it("exposes prepareArguments on the tool definition", () => {
      const tool = buildSystemOneTool({
        provider: new MockSystemOneProvider({ answers: {} }),
      });
      const prepared = tool.prepareArguments?.({
        state: "hi",
        questions: {
          t: { type: "Choice", instructions: "W?", options: ["a"] },
        },
      });
      assert.deepEqual(prepared, {
        state: "hi",
        questions: {
          t: { type: "choice", instructions: "W?", criteria: { a: null } },
        },
      });
    });

    it("execute tolerates sloppy args end to end", async () => {
      let seenRequest: unknown;
      const stub = {
        id: "stub",
        async evaluate(req: unknown) {
          seenRequest = req;
          return {
            answers: {
              t: {
                type: "choice",
                choice: "a",
                probabilities: { a: 1 },
                confidence: 1,
              },
            },
            metadata: { provider: "stub" },
          };
        },
      };
      const tool = buildSystemOneTool({ provider: stub as never });
      const res = await tool.execute(
        "id-sloppy",
        {
          state: "hi",
          questions: {
            t: { type: "Choice", instructions: "W?", options: ["a", "b"] },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(seenRequest, {
        state: "hi",
        questions: {
          t: {
            type: "choice",
            instructions: "W?",
            criteria: { a: null, b: null },
          },
        },
      });
      assert.equal((res.details.answers.t as { choice: string }).choice, "a");
    });
  });

  describe("tool advertising copy", () => {
    // Pi appends promptGuidelines flat with no tool-name prefix, so every
    // bullet must name the tool; and the copy must bid against direct
    // answering or routers skip the tool when it isn't named explicitly.
    it("names the tool in every guideline and bids against direct answers", () => {
      const tool = buildSystemOneTool({
        provider: new MockSystemOneProvider({ answers: {} }),
      });
      assert.ok(tool.promptSnippet && tool.promptSnippet.length > 0);
      for (const guideline of tool.promptGuidelines ?? []) {
        assert.match(guideline, /system_one/);
      }
      assert.match(tool.description, /instead of answering directly/);
      assert.match(tool.description, /calibrated probabilities/);
    });
  });

  describe("backend minima guardrails", () => {
    function stubTool() {
      let calls = 0;
      const stub = {
        id: "stub",
        async evaluate(_req: unknown) {
          calls += 1;
          return {
            answers: {
              t: {
                type: "choice",
                choice: "a",
                probabilities: { a: 1 },
                confidence: 1,
              },
            },
            metadata: { provider: "stub" },
          };
        },
      };
      return {
        tool: buildSystemOneTool({ provider: stub as never }),
        calls: () => calls,
      };
    }

    it("rejects choice questions without criteria before hitting the backend", async () => {
      const { tool, calls } = stubTool();
      await assert.rejects(
        tool.execute(
          "id-min-1",
          {
            state: "hi",
            questions: { t: { type: "choice", instructions: "W?" } },
          } as never,
          undefined,
          undefined,
          {} as never,
        ),
        /choice question "t" needs criteria.*at least one choice/,
      );
      assert.equal(calls(), 0);
    });

    it("rejects choice questions with empty criteria", async () => {
      const { tool, calls } = stubTool();
      await assert.rejects(
        tool.execute(
          "id-min-2",
          {
            state: "hi",
            questions: {
              t: { type: "choice", instructions: "W?", criteria: {} },
            },
          } as never,
          undefined,
          undefined,
          {} as never,
        ),
        /at least one choice/,
      );
      assert.equal(calls(), 0);
    });

    it("rejects score questions with fewer than two levels", async () => {
      const { tool, calls } = stubTool();
      await assert.rejects(
        tool.execute(
          "id-min-3",
          {
            state: "hi",
            questions: {
              s: { type: "score", instructions: "How?", criteria: ["only"] },
            },
          } as never,
          undefined,
          undefined,
          {} as never,
        ),
        /score question "s" needs criteria.*at least two levels/,
      );
      assert.equal(calls(), 0);
    });

    it("rejects unknown question types with the valid set", async () => {
      const { tool, calls } = stubTool();
      await assert.rejects(
        tool.execute(
          "id-min-4",
          {
            state: "hi",
            questions: { t: { type: "essay", instructions: "W?" } },
          } as never,
          undefined,
          undefined,
          {} as never,
        ),
        /unknown type "essay".*use "choice", "noul", or "score"/,
      );
      assert.equal(calls(), 0);
    });

    it("rejects non-object questions", async () => {
      const { tool, calls } = stubTool();
      await assert.rejects(
        tool.execute(
          "id-min-5",
          { state: "hi", questions: { t: "just a string" } } as never,
          undefined,
          undefined,
          {} as never,
        ),
        /question "t" must be an object/,
      );
      assert.equal(calls(), 0);
    });

    it("rejects empty questions", async () => {
      const { tool, calls } = stubTool();
      await assert.rejects(
        tool.execute(
          "id-min-6",
          { state: "hi", questions: {} } as never,
          undefined,
          undefined,
          {} as never,
        ),
        /at least one question is required/,
      );
      assert.equal(calls(), 0);
    });

    it("rejects non-object noul criteria", async () => {
      const { tool, calls } = stubTool();
      await assert.rejects(
        tool.execute(
          "id-min-7",
          {
            state: "hi",
            questions: {
              n: { type: "noul", instructions: "Is it?", criteria: ["x"] },
            },
          } as never,
          undefined,
          undefined,
          {} as never,
        ),
        /noul question "n" needs criteria omitted or as an object/,
      );
      assert.equal(calls(), 0);
    });

    it("lets boundary-valid questions through (1 choice, 2 levels)", async () => {
      const { tool, calls } = stubTool();
      await tool.execute(
        "id-min-5",
        {
          state: "hi",
          questions: {
            c: { type: "choice", instructions: "W?", criteria: { a: null } },
            s: {
              type: "score",
              instructions: "How?",
              criteria: ["low", "high"],
            },
            n: { type: "noul", instructions: "Is it?" },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.equal(calls(), 1);
    });
  });
});
