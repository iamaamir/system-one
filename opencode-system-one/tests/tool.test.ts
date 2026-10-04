import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToolContext } from "@opencode-ai/plugin";
import {
  MockSystemOneProvider,
  type SystemOneProvider,
  SystemOneTransportError,
} from "system-one-core";
import {
  buildSystemOneTool,
  parseSystemOneArgs,
  systemOneParams,
} from "../src/tool.ts";

function createContext(abort = new AbortController().signal): ToolContext {
  return {
    sessionID: "session",
    messageID: "message",
    agent: "build",
    directory: "/tmp",
    worktree: "/tmp",
    abort,
    metadata() {},
    async ask() {},
  };
}

type SystemOneArgs = Parameters<
  ReturnType<typeof buildSystemOneTool>["execute"]
>[0];

const canonicalArgs = {
  state: { diff: "- 1 line", touched: ["src/tool.ts"] },
  questions: {
    color: {
      type: "choice",
      instructions: "Pick the color.",
      criteria: { red: "Stop.", blue: "Go." },
    },
    blocked: {
      type: "noul",
      instructions: "Is the task blocked?",
      criteria: { "1": "Blocked.", "0": "Not blocked." },
    },
    quality: {
      type: "score",
      instructions: "Rate the change.",
      criteria: ["low", "high"],
    },
  },
} satisfies SystemOneArgs;

describe("System One tool schema", () => {
  it("accepts the canonical mixed choice, noul, and score batch", () => {
    const parsed = systemOneParams.safeParse(canonicalArgs);

    assert.equal(parsed.success, true);
  });

  it("accepts a noul question without criteria", () => {
    const parsed = systemOneParams.safeParse({
      state: {},
      questions: {
        blocked: { type: "noul", instructions: "Is it blocked?" },
      },
    });

    assert.equal(parsed.success, true);
  });

  it("rejects a missing state", () => {
    const parsed = systemOneParams.safeParse({
      questions: canonicalArgs.questions,
    });

    assert.equal(parsed.success, false);
  });

  it("rejects an empty questions record", () => {
    const parsed = systemOneParams.safeParse({ state: {}, questions: {} });

    assert.equal(parsed.success, false);
  });

  it("rejects a one-level score", () => {
    const parsed = systemOneParams.safeParse({
      state: {},
      questions: {
        quality: { type: "score", instructions: "Rate it.", criteria: ["low"] },
      },
    });

    assert.equal(parsed.success, false);
  });

  it("rejects a choice without criteria", () => {
    const parsed = systemOneParams.safeParse({
      state: {},
      questions: {
        color: { type: "choice", instructions: "Pick one." },
      },
    });

    assert.equal(parsed.success, false);
  });

  it("rejects a choice with empty criteria", () => {
    const parsed = systemOneParams.safeParse({
      state: {},
      questions: {
        color: {
          type: "choice",
          instructions: "Pick one.",
          criteria: {},
        },
      },
    });

    assert.equal(parsed.success, false);
  });

  it("accepts choices with one or multiple labels", () => {
    for (const criteria of [{ only: null }, { red: null, blue: null }]) {
      const parsed = systemOneParams.safeParse({
        state: {},
        questions: {
          color: {
            type: "choice",
            instructions: "Pick one.",
            criteria,
          },
        },
      });
      assert.equal(parsed.success, true);
    }
  });

  it("rejects an unknown top-level field", () => {
    const parsed = systemOneParams.safeParse({
      ...canonicalArgs,
      model: "private-model",
    });

    assert.equal(parsed.success, false);
  });

  it("rejects an unknown question field", () => {
    const parsed = systemOneParams.safeParse({
      state: {},
      questions: {
        blocked: {
          type: "noul",
          instructions: "Is it blocked?",
          confidence: 0.9,
        },
      },
    });

    assert.equal(parsed.success, false);
  });

  it("rejects an unknown question type", () => {
    const parsed = systemOneParams.safeParse({
      state: {},
      questions: {
        guess: { type: "rank", instructions: "Rank them.", criteria: ["a"] },
      },
    });

    assert.equal(parsed.success, false);
  });
});

describe("parseSystemOneArgs", () => {
  it("returns the canonical arguments unchanged", () => {
    const parsed = parseSystemOneArgs(canonicalArgs);

    assert.deepEqual(parsed, canonicalArgs);
  });

  it("rejects an unknown top-level field", () => {
    assert.throws(() =>
      parseSystemOneArgs({ ...canonicalArgs, model: "private-model" }),
    );
  });

  it("rejects an unknown question field", () => {
    assert.throws(() =>
      parseSystemOneArgs({
        state: {},
        questions: {
          blocked: {
            type: "noul",
            instructions: "Is the task blocked?",
            confidence: 0.9,
          },
        },
      }),
    );
  });
});

describe("System One tool description", () => {
  it("states batching, scope, and non-use", () => {
    const { description } = buildSystemOneTool(
      new MockSystemOneProvider({ answers: {} }),
    );

    assert.match(description, /choice/);
    assert.match(description, /scale/);
    assert.match(description, /[Bb]atch/);
    assert.match(description, /factual lookup/);
    assert.match(description, /browsing/);
    assert.match(description, /open-ended/);
    assert.match(description, /instead of directly making a bounded judgment/);
    assert.match(description, /already available/);
    assert.match(description, /cannot browse or recall missing facts/);
  });

  it("names every question type and its criteria shape", () => {
    const { description } = buildSystemOneTool(
      new MockSystemOneProvider({ answers: {} }),
    );

    assert.match(description, /choice/);
    assert.match(description, /noul/);
    assert.match(description, /score/);
    assert.match(description, /choice takes criteria as an object/);
    assert.match(description, /noul .* criteria as an optional object/);
    assert.match(description, /score .* criteria as an array of at least two/);
  });

  it("shows the complete call shape and directs question text to instructions", () => {
    const { description } = buildSystemOneTool(
      new MockSystemOneProvider({ answers: {} }),
    );

    assert.match(
      description,
      /\{"state":\s*\{\},\s*"questions":\s*\{"[^"]+":\s*\{"type":"choice","instructions":"[^"]+","criteria":\{"[^"]+":"[^"]+","[^"]+":"[^"]+"\}\}\}\}/,
    );
    assert.match(
      description,
      /Question text belongs in `questions\.<name>\.instructions`, not in `state`\./,
    );
    assert.match(
      description,
      /Use a named object for `questions`; do not use an array or a singular top-level `question` field\./,
    );
  });
});

describe("System One tool execution", () => {
  it("rejects unknown top-level fields through the built tool path", async () => {
    const definition = buildSystemOneTool(
      new MockSystemOneProvider({
        answers: {
          color: {
            type: "choice",
            choice: "blue",
            confidence: 0.8,
            probabilities: { red: 0.2, blue: 0.8 },
          },
          blocked: { type: "noul", noul: 0.1 },
          quality: {
            type: "score",
            score: 0.7,
            confidence: 0.7,
            probabilities: { low: 0.3, high: 0.7 },
          },
        },
      }),
    );

    await assert.rejects(() =>
      definition.execute(
        { ...canonicalArgs, model: "private-model" } as SystemOneArgs,
        createContext(),
      ),
    );
  });

  it("passes the tool context abort signal to the provider", async () => {
    const abort = new AbortController().signal;
    let receivedSignal: AbortSignal | undefined;
    const provider = new MockSystemOneProvider({
      answers: {
        color: {
          type: "choice",
          choice: "blue",
          confidence: 0.8,
          probabilities: { red: 0.2, blue: 0.8 },
        },
      },
    });
    const instrumentedProvider: SystemOneProvider = {
      id: provider.id,
      async evaluate(request, options) {
        receivedSignal = options?.signal;
        return provider.evaluate(request, options);
      },
    };
    const definition = buildSystemOneTool(instrumentedProvider);

    await definition.execute(
      {
        state: {},
        questions: {
          color: {
            type: "choice",
            instructions: "Pick the color.",
            criteria: { red: "Stop.", blue: "Go." },
          },
        },
      },
      createContext(abort),
    );

    assert.equal(receivedSignal, abort);
  });

  it("delegates a mixed batch and renders every answer", async () => {
    const definition = buildSystemOneTool(
      new MockSystemOneProvider({
        id: "test-provider",
        answers: {
          color: {
            type: "choice",
            choice: "blue",
            confidence: 0.8,
            probabilities: { red: 0.2, blue: 0.8 },
          },
          blocked: { type: "noul", noul: 0.1 },
          quality: {
            type: "score",
            score: 0.7,
            confidence: 0.7,
            probabilities: { low: 0.3, high: 0.7 },
            legend: { low: "Low quality", high: "High quality" },
          },
        },
      }),
    );

    const output = await definition.execute(canonicalArgs, createContext());

    assert.equal(
      output,
      [
        "System One result",
        "",
        "color:",
        "  choice: blue",
        "  confidence: 0.8",
        "  probabilities:",
        "    red: 0.2",
        "    blue: 0.8",
        "",
        "blocked:",
        "  noul: 0.1",
        "",
        "quality:",
        "  score: 0.7",
        "  confidence: 0.7",
        "  probabilities:",
        "    low: 0.3",
        "    high: 0.7",
        "  legend:",
        '    low: "Low quality"',
        '    high: "High quality"',
      ].join("\n"),
    );
  });

  it("propagates provider failures without retry or fallback", async () => {
    const failure = new SystemOneTransportError("provider unreachable");
    const provider: SystemOneProvider = {
      id: "failing",
      async evaluate() {
        throw failure;
      },
    };
    const definition = buildSystemOneTool(provider);

    await assert.rejects(
      () => definition.execute(canonicalArgs, createContext()),
      (error: unknown) => error === failure,
    );
  });
});
