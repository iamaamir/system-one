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
  /**
   * A tool whose provider records the request it was handed, so a test can
   * assert the exact shape that reached the wire after normalization.
   */
  function recordingTool() {
    let captured: any = null;
    const stub = {
      id: "stub",
      async evaluate(request: any) {
        captured = request;
        return { answers: {}, metadata: { provider: "stub" } };
      },
    };
    return {
      tool: buildSystemOneTool({ provider: stub as never }),
      request: () => captured,
    };
  }

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
        "YesNo camelCase synonym",
        {
          state: "x",
          questions: { q: { type: "YesNo", instructions: "Is it?" } },
        },
      ],
      [
        "noul null criteria reads as omitted",
        {
          state: "x",
          questions: {
            q: { type: "noul", instructions: "Is it?", criteria: null },
          },
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

    it("decodes questions serialized as a JSON string (provider quirk)", () => {
      const raw = {
        state: "hi",
        questions: JSON.stringify({
          t: { type: "choice", instructions: "W?", criteria: { a: null } },
        }),
      };
      const prepared = prepareSystemOneArgs(raw);
      assert.deepEqual(prepared, {
        state: "hi",
        questions: {
          t: { type: "choice", instructions: "W?", criteria: { a: null } },
        },
      });
    });

    it("decodes a question serialized as a JSON string inside an array", () => {
      const q = { type: "choice", instructions: "W?", criteria: { a: null } };
      // Every entry stringified, and the whole argument stringified too:
      // both layers decode before normalization.
      for (const questions of [[JSON.stringify(q)], JSON.stringify([q])]) {
        assert.deepEqual(prepareSystemOneArgs({ state: "hi", questions }), {
          state: "hi",
          questions: { q1: q },
        });
      }
    });

    it("still rejects strings that are not JSON objects or arrays", async () => {
      const tool = buildSystemOneTool({
        provider: {
          id: "stub",
          async evaluate() {
            return { answers: {}, metadata: { provider: "stub" } };
          },
        } as never,
      });
      for (const questions of ["foo", "{not json"]) {
        await assert.rejects(
          tool.execute(
            "id-rej-string",
            { state: "hi", questions } as never,
            undefined,
            undefined,
            {} as never,
          ),
          /"questions" must resolve to a question map/,
        );
      }
    });

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

    it("unwraps a single question and drops its extra fields", async () => {
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
          },
        },
      });
      // The permissive boundary schema lets this through (older Pi must be
      // able to reach execute), and the extra field is dropped rather than
      // turned into a retry the model has to learn from.
      assert.equal(Value.Check(systemOneParams, prepared), true);
      let calls = 0;
      const tool = buildSystemOneTool({
        provider: {
          id: "stub",
          async evaluate() {
            calls += 1;
            return { answers: {}, metadata: { provider: "stub" } };
          },
        } as never,
      });
      await tool.execute(
        "id-foo",
        prepared as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.equal(calls, 1);
    });

    it("lets unknown types through the schema so execute rejects them clearly", async () => {
      const prepared = prepareSystemOneArgs({
        state: "hi",
        questions: { t: { type: "essay", instructions: "W?" } },
      }) as unknown as { questions: { t: { type: string } } };
      assert.equal(prepared.questions.t.type, "essay");
      assert.equal(Value.Check(systemOneParams, prepared), true);
      let calls = 0;
      const tool = buildSystemOneTool({
        provider: {
          id: "stub",
          async evaluate() {
            calls += 1;
            return { answers: {}, metadata: { provider: "stub" } };
          },
        } as never,
      });
      await assert.rejects(
        tool.execute(
          "id-essay",
          prepared as never,
          undefined,
          undefined,
          {} as never,
        ),
        /unknown type "essay".*use "choice", "noul", or "score"/,
      );
      assert.equal(calls, 0);
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

    it("execute rejects non-object args with an actionable error, not a TypeError", async () => {
      let calls = 0;
      const tool = buildSystemOneTool({
        provider: {
          id: "stub",
          async evaluate() {
            calls += 1;
            return { answers: {}, metadata: { provider: "stub" } };
          },
        } as never,
      });
      for (const raw of [null, "just a string", [{ state: "hi" }]]) {
        await assert.rejects(
          tool.execute(
            "id-nonobject",
            raw as never,
            undefined,
            undefined,
            {} as never,
          ),
          /request must be an object with "state" and "questions"/,
        );
      }
      assert.equal(calls, 0);
    });
  });

  describe("pre-validation compatibility (older Pi without prepareArguments)", () => {
    // On older Pi the raw model output is validated against the public
    // schema BEFORE execute() can normalize it. Every repairable shape
    // must therefore pass Value.Check raw — testing prepareSystemOneArgs
    // alone would not prove that.
    const rawShapes: Array<[string, unknown]> = [
      [
        "singular question with capitalized type and options array",
        {
          state: "hi",
          question: { type: "Choice", instructions: "W?", options: ["a", "b"] },
        },
      ],
      [
        "array questions with bool type and prompt alias",
        {
          state: "hi",
          questions: [{ type: "bool", prompt: "Is this safe?" }],
        },
      ],
      [
        "context alias with singular rating question and choices",
        {
          context: "some evidence",
          question: {
            type: "rating",
            prompt: "Rate it",
            choices: ["bad", "ok", "good"],
          },
        },
      ],
      [
        "queries and evidence aliases",
        {
          evidence: { doc: "..." },
          queries: {
            q: { type: "select", instructions: "W?", criteria: { a: null } },
          },
        },
      ],
      [
        "unknown top-level keys are ignored, not rejected",
        {
          state: "hi",
          questions: {
            t: { type: "choice", instructions: "W?", criteria: { a: null } },
          },
          session_id: "abc",
        },
      ],
      [
        "ambiguous type alias still reaches execute for a clear rejection",
        {
          state: "hi",
          questions: { t: { type: "probability", instructions: "W?" } },
        },
      ],
      [
        "missing state still reaches execute for a clear rejection",
        {
          questions: {
            t: { type: "choice", instructions: "W?", criteria: { a: null } },
          },
        },
      ],
      [
        "scalar questions still reach execute for a clear rejection",
        { state: "hi", questions: "do something" },
      ],
    ];
    for (const [name, raw] of rawShapes) {
      it(`schema accepts raw: ${name}`, () => {
        assert.equal(
          Value.Check(systemOneParams, raw),
          true,
          `raw payload fails pre-execution validation: ${JSON.stringify(raw)}`,
        );
      });
    }
  });

  describe("weak-model adversarial corpus", () => {
    function stubTool() {
      let calls = 0;
      const stub = {
        id: "stub",
        async evaluate(_req: unknown) {
          calls += 1;
          return { answers: {}, metadata: { provider: "stub" } };
        },
      };
      return {
        tool: buildSystemOneTool({ provider: stub as never }),
        calls: () => calls,
      };
    }

    // Each entry: repaired shapes must BOTH survive pre-execution schema
    // validation raw AND succeed end to end; rejected shapes must fail
    // with an actionable error before any backend call.
    const repaired: Array<[string, unknown]> = [
      [
        "wrong capitalization",
        {
          state: "hi",
          questions: {
            t: { type: "Choice", instructions: "W?", criteria: { a: null } },
          },
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
        "array where object was expected",
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
        "criteria as string array",
        {
          state: "hi",
          questions: {
            t: { type: "choice", instructions: "W?", criteria: ["a", "b"] },
          },
        },
      ],
      [
        "criteria as keyed object",
        {
          state: "hi",
          questions: {
            t: {
              type: "choice",
              instructions: "W?",
              choices: { a: "first", b: "second" },
            },
          },
        },
      ],
      [
        "duplicate question names",
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
      [
        "context alias",
        {
          context: "hi",
          questions: { t: { type: "noul", instructions: "Is it?" } },
        },
      ],
      [
        "prompt alias",
        {
          state: "hi",
          questions: { t: { type: "noul", prompt: "Is it?" } },
        },
      ],
      [
        "boolean naming variation",
        {
          state: "x",
          questions: { q: { type: "YesNo", instructions: "Is it?" } },
        },
      ],
      [
        "rating naming variation",
        {
          state: "x",
          questions: {
            q: {
              type: "rating",
              instructions: "How?",
              options: ["low", "high"],
            },
          },
        },
      ],
      [
        "noul null criteria",
        {
          state: "x",
          questions: {
            q: { type: "noul", instructions: "Is it?", criteria: null },
          },
        },
      ],
      [
        "noul object criteria",
        {
          state: "x",
          questions: {
            q: {
              type: "noul",
              instructions: "Is it?",
              criteria: { true: "yes", false: "no" },
            },
          },
        },
      ],
      [
        "junk naming fields",
        {
          state: "hi",
          questions: {
            t: {
              type: "choice",
              instructions: "W?",
              criteria: { a: null },
              name: "t",
              title: "pick",
            },
          },
        },
      ],
    ];
    for (const [name, raw] of repaired) {
      it(`repairs ${name}`, async () => {
        assert.equal(
          Value.Check(systemOneParams, raw),
          true,
          `repaired shape must survive pre-execution validation: ${JSON.stringify(raw)}`,
        );
        const { tool, calls } = stubTool();
        await tool.execute(
          `id-rep-${name}`,
          raw as never,
          undefined,
          undefined,
          {} as never,
        );
        assert.equal(calls(), 1);
      });
    }

    const rejected: Array<[string, unknown, RegExp]> = [
      [
        "ambiguous probability alias",
        {
          state: "hi",
          questions: { t: { type: "probability", instructions: "W?" } },
        },
        /unknown type "probability".*use "choice", "noul", or "score"/,
      ],
      [
        "ambiguous likelihood alias",
        {
          state: "hi",
          questions: { t: { type: "likelihood", instructions: "W?" } },
        },
        /unknown type "likelihood"/,
      ],
      [
        "ambiguous ranking alias",
        {
          state: "hi",
          questions: {
            t: { type: "ranking", instructions: "W?", criteria: ["a", "b"] },
          },
        },
        /unknown type "ranking"/,
      ],
      [
        "missing instructions",
        {
          state: "hi",
          questions: { t: { type: "choice", criteria: { a: null } } },
        },
        /question "t" needs "instructions"/,
      ],
      [
        "null instructions",
        {
          state: "hi",
          questions: {
            t: { type: "choice", instructions: null, criteria: { a: null } },
          },
        },
        /question "t" needs "instructions"/,
      ],
      [
        "missing state",
        {
          questions: {
            t: { type: "choice", instructions: "W?", criteria: { a: null } },
          },
        },
        /state is required/,
      ],
      ["missing questions", { state: "hi" }, /questions is required/],
      [
        "empty questions object",
        { state: "hi", questions: {} },
        /at least one question is required/,
      ],
      [
        "empty questions array",
        { state: "hi", questions: [] },
        /at least one question is required/,
      ],
      [
        "scalar string questions",
        { state: "hi", questions: "foo" },
        /"questions" must resolve to a question map/,
      ],
      [
        "scalar number questions",
        { state: "hi", questions: 42 },
        /"questions" must resolve to a question map/,
      ],
      [
        "scalar boolean questions",
        { state: "hi", questions: true },
        /"questions" must resolve to a question map/,
      ],
      [
        "null questions reads as missing",
        { state: "hi", questions: null },
        /questions is required/,
      ],
      [
        "noul criteria as array",
        {
          state: "hi",
          questions: {
            t: { type: "noul", instructions: "Is it?", criteria: ["y", "n"] },
          },
        },
        /noul question "t" needs criteria omitted/,
      ],
      [
        "mixed valid and invalid questions",
        {
          state: "hi",
          questions: {
            ok: { type: "noul", instructions: "Is it?" },
            bad: { type: "ranking", instructions: "Order them" },
          },
        },
        /question "bad" has unknown type "ranking"/,
      ],
    ];
    for (const [name, raw, expected] of rejected) {
      it(`rejects ${name}`, async () => {
        const { tool, calls } = stubTool();
        await assert.rejects(
          tool.execute(
            `id-rej-${name}`,
            raw as never,
            undefined,
            undefined,
            {} as never,
          ),
          expected,
        );
        assert.equal(calls(), 0);
      });
    }
  });
  describe("prototype-key safety", () => {
    function captureTool() {
      let calls = 0;
      let seen: any;
      const stub = {
        id: "stub",
        async evaluate(req: any) {
          calls += 1;
          seen = req;
          return { answers: {}, metadata: { provider: "stub" } };
        },
      };
      return {
        tool: buildSystemOneTool({ provider: stub as never }),
        calls: () => calls,
        seen: () => seen,
      };
    }

    for (const tricky of ["__proto__", "constructor", "toString"]) {
      it(`handles question id "${tricky}" as an ordinary entry`, async () => {
        const { tool, calls, seen } = captureTool();
        // Build via JSON so "__proto__" is an own key, as from a model.
        const raw = JSON.parse(
          JSON.stringify({
            state: "hi",
            questions: {
              [tricky]: { type: "noul", instructions: "Is it?" },
            },
          }),
        );
        await tool.execute(
          "id-proto",
          raw as never,
          undefined,
          undefined,
          {} as never,
        );
        assert.equal(calls(), 1);
        assert.ok(Object.hasOwn(seen().questions, tricky));
        assert.equal(Object.getPrototypeOf(seen().questions), Object.prototype);
      });
    }

    it("keeps array-form duplicate-prone names prototype-safe", async () => {
      const { tool, calls, seen } = captureTool();
      const raw = JSON.parse(
        JSON.stringify({
          state: "hi",
          questions: [
            { name: "__proto__", type: "noul", instructions: "Is it?" },
          ],
        }),
      );
      await tool.execute(
        "id-proto-arr",
        raw as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.equal(calls(), 1);
      assert.ok(Object.hasOwn(seen().questions, "__proto__"));
    });

    for (const label of ["__proto__", "constructor"]) {
      it(`folds choice label "${label}" without reparenting criteria`, async () => {
        const { tool, calls, seen } = captureTool();
        await tool.execute(
          "id-proto-label",
          {
            state: "hi",
            questions: {
              t: {
                type: "choice",
                instructions: "W?",
                criteria: ["a", label],
              },
            },
          } as never,
          undefined,
          undefined,
          {} as never,
        );
        assert.equal(calls(), 1);
        const criteria = seen().questions.t.criteria;
        assert.ok(Object.hasOwn(criteria, label));
        assert.equal(Object.keys(criteria).length, 2);
        assert.equal(Object.getPrototypeOf(criteria), Object.prototype);
      });
    }

    it('never resolves "__proto__" or "constructor" as a type alias', async () => {
      for (const tricky of ["__proto__", "constructor"]) {
        const prepared = prepareSystemOneArgs({
          state: "hi",
          questions: { t: { type: tricky, instructions: "W?" } },
        }) as unknown as { questions: { t: { type: unknown } } };
        // Passes through untouched (a string), so execute rejects it
        // precisely instead of aliasing Object.prototype.
        assert.equal(prepared.questions.t.type, tricky);
      }
      const { tool, calls } = captureTool();
      await assert.rejects(
        tool.execute(
          "id-proto-type",
          {
            state: "hi",
            questions: { t: { type: "__proto__", instructions: "W?" } },
          } as never,
          undefined,
          undefined,
          {} as never,
        ),
        /unknown type "__proto__"/,
      );
      assert.equal(calls(), 0);
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

    it("keeps discovery and type selection mechanical in one layer", () => {
      const tool = buildSystemOneTool({
        provider: new MockSystemOneProvider({ answers: {} }),
      });
      // Concept-level assertions only: the exact prose may evolve, but
      // promptGuidelines must remain the authoritative layer teaching the
      // router when to call and which type to pick.
      const guidelines = (tool.promptGuidelines ?? []).join("\n");
      assert.match(guidelines, /bounded judgment.*system_one/i);
      assert.match(guidelines, /unordered alternatives.*choice/i);
      assert.match(guidelines, /yes\/no.*noul/i);
      assert.match(guidelines, /ordered scale.*score/i);
      assert.match(guidelines, /never use choice for an ordered scale/i);
      assert.match(guidelines, /batch.*one call/i);
      assert.match(guidelines, /retrieve.*first/i);
      // The snippet advertises the capability; it must not duplicate the
      // full decision algorithm.
      assert.ok(
        (tool.promptSnippet ?? "").length < guidelines.length / 4,
        "promptSnippet should stay a short advertisement, not a second copy of the rules",
      );
    });
  });

  describe("copy-on-write normalization", () => {
    const canonicalRequest = () => ({
      state: { incident: "latency" },
      questions: {
        rollback: { type: "noul", instructions: "Roll back?" },
        owner: {
          type: "choice",
          instructions: "Which team?",
          criteria: { frontend: null, backend: null },
        },
      },
    });

    it("returns canonical requests, maps, and questions by reference", () => {
      const args = canonicalRequest();
      const out = prepareSystemOneArgs(args) as typeof args;
      assert.equal(out, args);
      assert.equal(out.questions, args.questions);
      assert.equal(out.questions.rollback, args.questions.rollback);
      assert.equal(out.questions.owner, args.questions.owner);
      // Key order is not canonicalized: identity means "already final".
      const reordered = {
        state: "s",
        questions: {
          q: { criteria: { a: null }, instructions: "I?", type: "choice" },
        },
      };
      assert.equal(prepareSystemOneArgs(reordered), reordered);
    });

    it("structurally shares unaffected siblings on partial repair", () => {
      const args = {
        state: "s",
        questions: {
          fine: { type: "noul", instructions: "OK?" },
          sloppy: { type: "Choice", prompt: "Pick?", options: ["a", "b"] },
        },
      };
      const out = prepareSystemOneArgs(args) as typeof args;
      assert.notEqual(out, args);
      assert.notEqual(out.questions, args.questions);
      assert.notEqual(out.questions.sloppy, args.questions.sloppy);
      assert.equal(out.questions.fine, args.questions.fine);
      assert.deepEqual(out.questions.sloppy, {
        type: "choice",
        instructions: "Pick?",
        criteria: { a: null, b: null },
      });
    });

    it("is idempotent and allocates nothing new on the second pass", () => {
      const once = prepareSystemOneArgs(canonicalRequest()) as Record<
        string,
        unknown
      >;
      const twice = prepareSystemOneArgs(once);
      assert.deepEqual(twice, once);
      assert.equal(twice, once);
      // Repair once, then the repaired output is itself canonical.
      const repairedOnce = prepareSystemOneArgs({
        state: "s",
        questions: [{ name: "q", type: "boolean", prompt: "Y?" }],
      });
      assert.equal(prepareSystemOneArgs(repairedOnce), repairedOnce);
    });

    it("never mutates its input", () => {
      const deepFreeze = (v: unknown): void => {
        if (typeof v === "object" && v !== null && !Object.isFrozen(v)) {
          Object.freeze(v);
          for (const k of Object.keys(v)) {
            deepFreeze((v as Record<string, unknown>)[k]);
          }
        }
      };
      const sloppy = {
        context: { incident: "latency" },
        question: [
          { name: "a", type: "Rating", prompt: "Rate?", levels: ["1", "5"] },
          { id: "b", type: "noul", instructions: "OK?", extra: 1 },
        ],
      };
      deepFreeze(sloppy);
      const out = prepareSystemOneArgs(sloppy);
      assert.deepEqual(out, {
        state: { incident: "latency" },
        questions: {
          a: {
            type: "score",
            instructions: "Rate?",
            criteria: ["1", "5"],
          },
          b: { type: "noul", instructions: "OK?" },
        },
      });
    });

    it("repairs every non-canonical shape exactly (no false sharing)", () => {
      // [input, expected output, sharesInputRef]: the last two entries are
      // already builder fixed points, so sharing them is correct.
      const cases: Array<[unknown, unknown, boolean]> = [
        // Alias type spelling.
        [
          {
            state: "s",
            questions: { q: { type: "Yes/No", instructions: "Y?" } },
          },
          {
            state: "s",
            questions: { q: { type: "noul", instructions: "Y?" } },
          },
          false,
        ],
        // Alias field names.
        [
          {
            state: "s",
            questions: { q: { type: "choice", prompt: "P?", choices: ["a"] } },
          },
          {
            state: "s",
            questions: {
              q: { type: "choice", instructions: "P?", criteria: { a: null } },
            },
          },
          false,
        ],
        // Junk keys dropped.
        [
          {
            state: "s",
            questions: {
              q: {
                type: "noul",
                instructions: "Y?",
                description: "d",
                title: "t",
              },
            },
          },
          {
            state: "s",
            questions: { q: { type: "noul", instructions: "Y?" } },
          },
          false,
        ],
        // Undefined-valued lingering alias key is still dropped.
        [
          {
            state: "s",
            questions: {
              q: { type: "noul", instructions: "Y?", prompt: undefined },
            },
          },
          {
            state: "s",
            questions: { q: { type: "noul", instructions: "Y?" } },
          },
          false,
        ],
        // Own undefined instructions key is preserved (builder copies it).
        [
          {
            state: "s",
            questions: { q: { type: "noul", instructions: undefined } },
          },
          {
            state: "s",
            questions: { q: { type: "noul", instructions: undefined } },
          },
          true,
        ],
        // noul null criteria reads as omitted.
        [
          {
            state: "s",
            questions: {
              q: { type: "noul", instructions: "Y?", criteria: null },
            },
          },
          {
            state: "s",
            questions: { q: { type: "noul", instructions: "Y?" } },
          },
          false,
        ],
        // Singular question alias + array form + naming metadata.
        [
          { context: "s", question: { type: "boolean", prompt: "Y?" } },
          {
            state: "s",
            questions: { q: { type: "noul", instructions: "Y?" } },
          },
          false,
        ],
        // Unknown top-level keys dropped; missing state preserved as-is.
        [
          {
            state: "s",
            questions: { q: { type: "noul", instructions: "Y?" } },
            extra: 1,
          },
          {
            state: "s",
            questions: { q: { type: "noul", instructions: "Y?" } },
          },
          false,
        ],
        // Empty choice array still folds (every() on [] is true).
        [
          {
            state: "s",
            questions: {
              q: { type: "choice", instructions: "P?", criteria: [] },
            },
          },
          {
            state: "s",
            questions: {
              q: { type: "choice", instructions: "P?", criteria: {} },
            },
          },
          false,
        ],
        // Non-string type passes through untouched (fixed point).
        [
          { state: "s", questions: { q: { type: 5, instructions: "Y?" } } },
          { state: "s", questions: { q: { type: 5, instructions: "Y?" } } },
          true,
        ],
      ];
      for (const [input, expected, sharesRef] of cases) {
        const out = prepareSystemOneArgs(input);
        assert.deepEqual(out, expected);
        assert.equal(out === input, sharesRef);
      }
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

    it("folds object score criteria into an ordered rubric", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-fold-score",
        {
          state: "hi",
          questions: {
            s: {
              type: "score",
              instructions: "How?",
              criteria: { low: "bad", high: "good" },
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(request().questions.s.criteria, [
        "low: bad",
        "high: good",
      ]);
    });

    it("keeps a score level's label and description without duplicating", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-level-self-describing",
        {
          state: "hi",
          questions: {
            s: {
              type: "score",
              instructions: "How bad?",
              criteria: {
                low: "Bad: minor and reversible",
                high: "",
                moderate: "moderate",
              },
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(request().questions.s.criteria, [
        "low: Bad: minor and reversible",
        "high",
        "moderate",
      ]);
    });

    it("unwraps a single wrapper key holding the rubric", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-fold-score-wrapper",
        {
          state: "hi",
          questions: {
            s: {
              type: "score",
              instructions: "How?",
              criteria: { item: ["low", "high"] },
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(request().questions.s.criteria, ["low", "high"]);
    });

    it("rejects a one-level object rubric rather than unwrapping it", async () => {
      const { tool, calls } = stubTool();
      await assert.rejects(
        tool.execute(
          "id-fold-score-single",
          {
            state: "hi",
            questions: {
              s: {
                type: "score",
                instructions: "How?",
                criteria: { only: "meh" },
              },
            },
          } as never,
          undefined,
          undefined,
          {} as never,
        ),
        /score question "s" needs criteria as an ordered array/,
      );
      assert.equal(calls(), 0);
    });

    it("lifts bare noul outcomes into criteria", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-lift-noul",
        {
          state: "hi",
          questions: {
            n: {
              type: "noul",
              instructions: "Is it?",
              true: "it is",
              false: "it is not",
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(request().questions.n, {
        type: "noul",
        instructions: "Is it?",
        criteria: { true: "it is", false: "it is not" },
      });
    });

    it("merges choice labels spilled out of criteria", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-spilled-choice",
        {
          state: "hi",
          questions: {
            ownership: {
              type: "choice",
              instructions: "Who?",
              criteria: { sre_oncall: "" },
              account_team: "",
              ingest_service_owner: "",
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(Object.keys(request().questions.ownership.criteria), [
        "sre_oncall",
        "account_team",
        "ingest_service_owner",
      ]);
    });

    it("uses spilled labels as criteria when criteria is absent", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-spilled-only",
        {
          state: "hi",
          questions: {
            pick: {
              type: "choice",
              instructions: "Which?",
              billing: null,
              onboarding: null,
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(request().questions.pick.criteria, {
        billing: null,
        onboarding: null,
      });
    });

    it("drops an empty sibling that is a noul question's own name", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-noul-selfname",
        {
          state: "hi",
          questions: {
            q: {
              type: "noul",
              instructions: "Is it?",
              is_coordinated_credential_stuffing_run: "",
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(request().questions.q, {
        type: "noul",
        instructions: "Is it?",
      });
    });

    it("drops a NON-empty extra field rather than failing the call", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-nonempty-extra",
        {
          state: "hi",
          questions: {
            q: {
              type: "noul",
              instructions: "Is it?",
              confidence: 0.9,
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(request().questions.q, {
        type: "noul",
        instructions: "Is it?",
      });
    });

    it("salvages the type from an extra key that names the kind", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-salvage-type",
        {
          state: "hi",
          questions: {
            q: {
              approach: "yes_no",
              name: "finishes_in_window",
              instructions: "Will it fit?",
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(request().questions.q, {
        type: "noul",
        instructions: "Will it fit?",
      });
    });

    it("unwraps a single-key wrapper around an array of questions", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-wrapped-array",
        {
          state: "hi",
          questions: {
            item: [
              { name: "plan_it", type: "noul", instructions: "Should we?" },
              {
                name: "how_soon",
                type: "score",
                instructions: "How soon?",
                criteria: ["now", "later"],
              },
            ],
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(Object.keys(request().questions), [
        "plan_it",
        "how_soon",
      ]);
    });

    it("drops string entries beside a real question", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-string-entry",
        {
          state: "hi",
          questions: {
            refund_decision: {
              type: "choice",
              instructions: "Which?",
              criteria: { deny: null },
            },
            deny: "refund it",
            "PR #419 (feat: add metrics endpoint)": "merge it",
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(Object.keys(request().questions), ["refund_decision"]);
    });

    it("still rejects a question map of nothing but strings", async () => {
      const { tool, calls } = stubTool();
      await assert.rejects(
        tool.execute(
          "id-all-strings",
          {
            state: "hi",
            questions: { deny: "refund it", allow: "let it go" },
          } as never,
          undefined,
          undefined,
          {} as never,
        ),
        /must be an object with "type"/,
      );
      assert.equal(calls(), 0);
    });

    it("merges a name-to-array question map", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-array-map",
        {
          state: "hi",
          questions: {
            fixes: [
              { type: "noul", instructions: "Is it safe?" },
              { type: "noul", instructions: "Is it cheap?" },
            ],
            risks: [
              {
                type: "score",
                instructions: "How bad?",
                criteria: ["low", "high"],
              },
            ],
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(Object.keys(request().questions), [
        "fixes",
        "fixes_2",
        "risks",
      ]);
    });

    it("unwraps one question filed under the wrapper's own name", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-named-questions",
        {
          state: "hi",
          questions: {
            questions: {
              type: "score",
              instructions: "How clear?",
              criteria: ["low", "high"],
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(Object.keys(request().questions), ["q"]);
      assert.equal(request().questions.q.type, "score");
    });

    it("peels a wrapper nested more than one level deep", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-nested-wrapper",
        {
          state: "hi",
          questions: {
            impact: {
              type: "score",
              instructions: "How bad?",
              criteria: {
                item: { item: ["negligible", "moderate", "severe"] },
              },
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(request().questions.impact.criteria, [
        "negligible",
        "moderate",
        "severe",
      ]);
    });

    it("still rejects a one-level rubric nested in a wrapper", async () => {
      const { tool, calls } = stubTool();
      await assert.rejects(
        tool.execute(
          "id-nested-one-level",
          {
            state: "hi",
            questions: {
              impact: {
                type: "score",
                instructions: "How bad?",
                criteria: { item: { only: "meh" } },
              },
            },
          } as never,
          undefined,
          undefined,
          {} as never,
        ),
        /score question "impact" needs criteria as an ordered array/,
      );
      assert.equal(calls(), 0);
    });

    it("transposes parallel arrays into named questions", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-parallel-arrays",
        {
          state: "hi",
          questions: {
            item: ["refund", "risk", "followup"],
            type: ["choice", "score", "noul"],
            instructions: [
              "Which action?",
              "How risky?",
              "Will they follow up?",
            ],
            criteria: [{ refund: null, deny: null }, ["low", "high"], null],
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      const asked = request().questions;
      assert.deepEqual(Object.keys(asked), ["refund", "risk", "followup"]);
      assert.equal(asked.refund.type, "choice");
      assert.deepEqual(asked.risk.criteria, ["low", "high"]);
      assert.equal(asked.followup.type, "noul");
    });

    it("unwraps a question under the wrapper name beside other junk keys", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-alias-siblings",
        {
          state: "hi",
          questions: {
            policy: "",
            questions: {
              type: "choice",
              instructions: "Which policy?",
              criteria: { a: null, b: null },
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(Object.keys(request().questions), ["q"]);
      assert.equal(request().questions.q.type, "choice");
    });

    it("drops a question FIELD that landed in the name slot", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-field-in-name-slot",
        {
          state: "hi",
          questions: {
            pick: {
              type: "choice",
              instructions: "Which library?",
              criteria: { date_fns: null, dayjs: null },
            },
            criteria: { stray: true },
            instructions: "stray",
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(Object.keys(request().questions), ["pick"]);
    });

    it("splices a question map that landed in a name slot", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-nested-map",
        {
          state: "hi",
          questions: {
            "Which single library should this CLI adopt?": {
              which_date_library: {
                type: "choice",
                instructions: "Which one?",
                criteria: { date_fns: null, dayjs: null },
              },
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(Object.keys(request().questions), [
        "which_date_library",
      ]);
      assert.equal(request().questions.which_date_library.type, "choice");
    });

    it("does not mistake a question for a nested map", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-not-nested",
        {
          state: "hi",
          questions: {
            pick: {
              type: "choice",
              instructions: "Which one?",
              criteria: { a: null, b: null },
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(Object.keys(request().questions), ["pick"]);
    });

    it("takes description as the instructions when there are none", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-description-instructions",
        {
          state: "hi",
          questions: {
            q: {
              type: "score",
              description: "Rate the documentation quality.",
              criteria: ["low", "high"],
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.equal(
        request().questions.q.instructions,
        "Rate the documentation quality.",
      );
    });

    it("keeps real instructions ahead of a description", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-description-loser",
        {
          state: "hi",
          questions: {
            q: {
              type: "noul",
              instructions: "Is it?",
              description: "some metadata",
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(request().questions.q, {
        type: "noul",
        instructions: "Is it?",
      });
    });

    it("splices a question map nested more than one level deep", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-nested-two-deep",
        {
          state: "hi",
          questions: {
            no_audit: {
              no_audit: {
                q1: {
                  type: "choice",
                  instructions: "Which action?",
                  criteria: { keep: null, replace: null },
                },
              },
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(Object.keys(request().questions), ["q1"]);
      assert.equal(request().questions.q1.type, "choice");
    });

    it("lifts a state nested inside a question to the top level", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-lift-state",
        {
          questions: [
            {
              type: "score",
              instructions: "How clear?",
              criteria: ["low", "high"],
              state: { readme: "## Usage\nRun it." },
            },
          ],
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(request().state, { readme: "## Usage\nRun it." });
      assert.equal(
        Object.hasOwn(request().questions.q1, "state"),
        false,
        "the state must be removed from the question it was found in",
      );
    });

    it("lifts context and evidence aliases too", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-lift-evidence",
        {
          questions: {
            q: {
              type: "noul",
              instructions: "Is it?",
              evidence: { signal: "weak" },
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(request().state, { signal: "weak" });
    });

    it("keeps a top-level state ahead of a nested one", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-lift-state-priority",
        {
          state: "the real state",
          questions: {
            q: { type: "noul", instructions: "Is it?", state: "stray" },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.equal(request().state, "the real state");
    });

    it("leaves a criteria key named state alone — that is an option label", async () => {
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-criteria-state-label",
        {
          state: "s",
          questions: {
            q: {
              type: "choice",
              instructions: "Which level?",
              criteria: { state: null, federal: null },
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(Object.keys(request().questions.q.criteria), [
        "state",
        "federal",
      ]);
    });

    it("does not mutate its input when lifting", () => {
      const deepFreeze = (v: unknown): void => {
        if (typeof v === "object" && v !== null && !Object.isFrozen(v)) {
          Object.freeze(v);
          for (const k of Object.keys(v)) {
            deepFreeze((v as Record<string, unknown>)[k]);
          }
        }
      };
      const input = {
        questions: {
          q: { type: "noul", instructions: "Is it?", state: "s" },
        },
      };
      deepFreeze(input);
      const out = prepareSystemOneArgs(input);
      assert.deepEqual(out, {
        state: "s",
        questions: { q: { type: "noul", instructions: "Is it?" } },
      });
    });

    it("strips a nested state even when a top-level one is supplied", async () => {
      // Regression: the lift used to early-return when a real top-level state
      // existed, leaving `state` inside the question where the provider could
      // see it. A question must never carry what it is judged against.
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-lift-strip-always",
        {
          state: "the real state",
          questions: {
            q: { type: "noul", instructions: "Is it?", state: { stray: 1 } },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.equal(request().state, "the real state");
      assert.deepEqual(request().questions.q, {
        type: "noul",
        instructions: "Is it?",
      });
    });

    it("strips every state alias in one pass (idempotent)", async () => {
      const freeze = (v: unknown): void => {
        if (typeof v === "object" && v !== null && !Object.isFrozen(v)) {
          Object.freeze(v);
          for (const k of Object.keys(v)) {
            freeze((v as Record<string, unknown>)[k]);
          }
        }
      };
      const input = {
        questions: {
          q: {
            type: "noul",
            instructions: "Is it?",
            state: { a: 1 },
            context: { b: 2 },
            evidence: { c: 3 },
          },
        },
      };
      freeze(input);
      const once = prepareSystemOneArgs(input);
      const twice = prepareSystemOneArgs(once);
      assert.deepEqual(twice, once);
      assert.deepEqual(once, {
        state: { a: 1 },
        questions: { q: { type: "noul", instructions: "Is it?" } },
      });
    });

    it("drops true/false from a question that is not a noul", async () => {
      // Regression: they are lifted into `criteria` on a noul question and
      // mean nothing elsewhere, but the copy-on-write fast path used to ship
      // them to the provider on a choice.
      const { tool, request } = recordingTool();
      await tool.execute(
        "id-true-false-choice",
        {
          state: "hi",
          questions: {
            q: {
              type: "choice",
              instructions: "Which?",
              criteria: { a: null },
              true: "yes",
              false: "no",
            },
          },
        } as never,
        undefined,
        undefined,
        {} as never,
      );
      assert.deepEqual(request().questions.q, {
        type: "choice",
        instructions: "Which?",
        criteria: { a: null },
      });
    });

    it("stays idempotent when an array mixes junk with questions", () => {
      // Regression: the array branch kept non-question entries while the
      // record branch dropped them, so `["junk", {a question}]` normalized to
      // different maps on the first and second pass.
      const input = {
        state: "S",
        questions: ["junk", { type: "noul", instructions: "Is it?" }, "junk"],
      };
      assert.deepEqual(prepareSystemOneArgs(input), {
        state: "S",
        questions: { q2: { type: "noul", instructions: "Is it?" } },
      });
      const once = prepareSystemOneArgs(input);
      assert.deepEqual(prepareSystemOneArgs(once), once);
    });

    it("does not unwrap an array of non-questions", () => {
      // Regression: `{q1: [...]}` is a question map whose one entry is not a
      // question. Unwrapping it renamed the junk on every pass.
      const input = { state: "S", questions: { q1: ["text", "text"] } };
      const once = prepareSystemOneArgs(input);
      assert.deepEqual(prepareSystemOneArgs(once), once);
      assert.deepEqual(once, {
        state: "S",
        questions: { q1: ["text", "text"] },
      });
    });

    it("rejects score questions with a one-element array rubric", async () => {
      const { tool, calls } = stubTool();
      await assert.rejects(
        tool.execute(
          "id-min-8",
          {
            state: "hi",
            questions: {
              s: {
                type: "score",
                instructions: "How?",
                criteria: ["lonely"],
              },
            },
          } as never,
          undefined,
          undefined,
          {} as never,
        ),
        /score question "s" needs criteria as an ordered array/,
      );
      assert.equal(calls(), 0);
    });

    it("rejects choice questions with non-string array criteria", async () => {
      const { tool, calls } = stubTool();
      await assert.rejects(
        tool.execute(
          "id-min-9",
          {
            state: "hi",
            questions: {
              t: { type: "choice", instructions: "W?", criteria: [1, 2] },
            },
          } as never,
          undefined,
          undefined,
          {} as never,
        ),
        /choice question "t" needs criteria as an object/,
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

describe("discarded question reporting", () => {
  function toolWithAnswers(answers: Record<string, unknown>) {
    const stub = {
      id: "stub",
      async evaluate() {
        return { answers, metadata: { provider: "stub" } };
      },
    };
    return buildSystemOneTool({ provider: stub as never });
  }

  async function renderOf(args: unknown): Promise<string> {
    const tool = toolWithAnswers({
      kept: { type: "noul", noul: 0.7 },
    });
    const result = await tool.execute(
      "id",
      args as never,
      undefined,
      undefined,
      {} as never,
    );
    return (result.content as Array<{ text: string }>)[0].text;
  }

  // A real defect the scenario suite could not see: the model sends a
  // two-question batch, one of which is filed under the wrapper's own name.
  // The unwrap returned that question and dropped its sibling silently, so
  // the model received a confident answer to half of what it asked.
  it("reports a question abandoned by the wrapper-alias unwrap", async () => {
    const text = await renderOf({
      state: "an outage and a refund",
      questions: {
        questions: {
          type: "choice",
          instructions: "Which?",
          criteria: { a: null },
        },
        risk: { type: "noul", instructions: "Is there a risk?" },
      },
    });
    assert.match(text, /NOTE:/);
    assert.match(text, /discarded/);
    assert.match(text, /risk/);
    // The kept answer is still complete and still first.
    assert.match(text, /kept:[\s\S]*noul: 0\.7/);
  });

  it("reports a name-slot entry dropped beside a real question", async () => {
    const text = await renderOf({
      state: "S",
      questions: {
        q1: { type: "noul", instructions: "Is it?" },
        stray_label: "refund it",
      },
    });
    assert.match(text, /NOTE:/);
    assert.match(text, /stray_label/);
  });

  it("adds no note when nothing was discarded", async () => {
    const text = await renderOf({
      state: "S",
      questions: { q1: { type: "noul", instructions: "Is it?" } },
    });
    assert.doesNotMatch(text, /NOTE:/);
  });
});
