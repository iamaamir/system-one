import assert from "node:assert/strict";
import { it } from "node:test";
import { createSessionConfig } from "../src/config.ts";
import { resolveSessionProvider } from "../src/provider.ts";

it("native mode fails closed for score questions without network fallback", async () => {
  const session = createSessionConfig({});
  session.mode = "native";
  const model = { id: "jev-latest" };
  const ctx = {
    modelRegistry: {
      findOfType: () => model,
      classify: async () => {
        throw Error("must not run");
      },
    },
  } as never;
  const provider = await resolveSessionProvider(session, ctx);
  await assert.rejects(
    provider.evaluate({
      state: "x",
      questions: {
        q: { type: "score", instructions: "Rate", criteria: ["low", "high"] },
      },
    }),
    /omits Score probabilities/,
  );
});

it("native mode preserves question IDs that match object prototype names", async () => {
  const session = createSessionConfig({});
  session.mode = "native";
  const ctx = {
    modelRegistry: {
      findOfType: () => ({ id: "jev-latest" }),
      classify: async (
        _model: unknown,
        input: { questions: Record<string, unknown> },
      ) => {
        assert.ok(Object.hasOwn(input.questions, "__proto__"));
        return {
          stopReason: "stop",
          model: "jev-latest",
          provider: "typesafe",
          answers: Object.fromEntries([
            ["__proto__", { type: "bool", probability: 0.8 }],
          ]),
        };
      },
    },
  } as never;
  const questions = Object.fromEntries([
    ["__proto__", { type: "noul" as const, instructions: "Yes?" }],
  ]);
  const result = await (await resolveSessionProvider(session, ctx)).evaluate({
    state: "x",
    questions,
  });
  assert.ok(Object.hasOwn(result.answers, "__proto__"));
});

it("native mode maps bool back to noul", async () => {
  const session = createSessionConfig({});
  session.mode = "native";
  const ctx = {
    modelRegistry: {
      findOfType: () => ({ id: "jev-latest" }),
      classify: async (
        _model: unknown,
        input: { questions: Record<string, { type: string }> },
      ) => {
        assert.equal(input.questions.q.type, "bool");
        return {
          stopReason: "stop",
          model: "jev-latest",
          provider: "typesafe",
          answers: { q: { type: "bool", probability: 0.7 } },
        };
      },
    },
  } as never;
  const provider = await resolveSessionProvider(session, ctx);
  const result = await provider.evaluate({
    state: "x",
    questions: { q: { type: "noul", instructions: "Yes?" } },
  });
  assert.deepEqual(result.answers.q, { type: "noul", noul: 0.7 });
});

it("uses Pi credentials per request for canonical TypeSafe and never for custom URLs", async () => {
  let lookups = 0;
  const registry = {
    getApiKeyForProvider: async () => {
      lookups++;
      return "pi-key";
    },
  };
  const original = globalThis.fetch;
  const headers: string[] = [];
  globalThis.fetch = (async (_url, options) => {
    headers.push(
      new Headers(options?.headers).get("authorization") ?? "absent",
    );
    return new Response(
      JSON.stringify({
        model: "jev-1.13.0",
        answers: { q: { type: "noul", noul: 0.8 } },
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  try {
    const session = createSessionConfig({});
    const ctx = { modelRegistry: registry } as never;
    const req = {
      state: "x",
      questions: { q: { type: "noul" as const, instructions: "Is it?" } },
    };
    await (await resolveSessionProvider(session, ctx)).evaluate(req);
    await (await resolveSessionProvider(session, ctx)).evaluate(req);
    assert.deepEqual(headers, ["Bearer pi-key", "Bearer pi-key"]);
    assert.equal(lookups, 2);
    session.mode = "custom";
    session.current.baseUrl = "http://localhost:8008";
    await (await resolveSessionProvider(session, ctx)).evaluate(req);
    session.current.baseUrl = "https://api.typesafe.ai.evil.example";
    await (await resolveSessionProvider(session, ctx)).evaluate(req);
    session.current.baseUrl = "https://api.typesafe.ai/proxy";
    await (await resolveSessionProvider(session, ctx)).evaluate(req);
    assert.equal(lookups, 2);
    assert.deepEqual(headers.slice(2), ["absent", "absent", "absent"]);
  } finally {
    globalThis.fetch = original;
  }
});
