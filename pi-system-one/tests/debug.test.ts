import assert from "node:assert/strict";
import { it } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createSessionConfig } from "../src/config.ts";
import { DebugHistory, observedProvider } from "../src/debug.ts";
import { DebugOverlay, debugSummary } from "../src/debug-ui.ts";

it("shows page position, distinct question counts, target, and readable controls", () => {
  const history = new DebugHistory();
  for (let i = 0; i < 17; i++) {
    const entry = history.start("custom", {
      q: { type: "score", instructions: "hidden", criteria: ["low", "high"] },
    });
    entry.provider = "configured";
    entry.outcome = "failure";
    entry.httpStatus = 405;
    entry.failure = "HTTP error";
    entry.requestTarget = "POST http://localhost:8008/v1/systemone";
  }
  const colors: string[] = [];
  const overlay = new DebugOverlay(
    history.entries,
    {
      fg: (color: string, text: string) => {
        colors.push(`${color}:${text}`);
        return text;
      },
    } as never,
    () => {},
    () => {},
  );
  const initial = overlay.render(68).join("\n");
  assert.match(initial, /1-7 of 17/);
  assert.match(initial, /#1/);
  assert.match(initial, /1 score/);
  assert.match(initial, /POST http:\/\/localhost:8008\/v1\/systemone/);
  assert.ok(
    colors.some(
      (line) => line.startsWith("text:") && line.includes("recent call"),
    ),
  );
  assert.ok(
    colors.some((line) => line.startsWith("text:") && line.includes("browse")),
  );
  for (let i = 0; i < 7; i++) overlay.handleInput("\u001b[B");
  assert.match(overlay.render(68).join("\n"), /8-14 of 17/);
});

it("renders bounded debug overlay and lets keyboard move focus and close", () => {
  const history = new DebugHistory();
  const entry = history.start("auto", {
    q: { type: "noul", instructions: "secret instruction" },
  });
  entry.provider = "pi-native";
  entry.reason = "compatible request";
  entry.outcome = "success";
  entry.durationMs = 7;
  history.start("custom", {
    q: {
      type: "score",
      instructions: "private rubric",
      criteria: ["low", "high"],
    },
  });
  let renders = 0;
  let closed = false;
  const overlay = new DebugOverlay(
    history.entries,
    { fg: (_color: string, text: string) => text } as never,
    () => {
      closed = true;
    },
    () => {
      renders++;
    },
  );
  const first = overlay.render(44);
  assert.ok(first.every((line) => visibleWidth(line) <= 44));
  assert.doesNotMatch(first.join("\n"), /secret instruction|private rubric/);
  assert.match(first.join("\n"), /Provider: not selected/);
  overlay.handleInput("\u001b[B");
  assert.ok(renders > 0);
  assert.match(overlay.render(44).join("\n"), /Provider: pi-native/);
  overlay.handleInput("\u001b");
  assert.ok(closed);
  assert.match(debugSummary([]), /No system_one calls yet/);
  history.clear();
  assert.equal(history.entries.length, 0);
});

it("shows POST target shape for custom 405 without retaining URL secrets", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("not allowed", { status: 405 })) as typeof fetch;
  try {
    const history = new DebugHistory();
    const request = {
      state: "private",
      questions: { q: { type: "noul" as const, instructions: "Yes?" } },
    };
    const duplicate = observedProvider(
      createSessionConfig({
        SYSTEM_ONE_BASE_URL: "http://localhost:8008/v1/systemone",
      }),
      {} as never,
      history,
    );
    await assert.rejects(duplicate.evaluate(request), /provider error 405/);
    assert.match(
      history.entries[0]?.requestTarget ?? "",
      /POST http:\/\/localhost:8008\/v1\/systemone\/v1\/systemone/,
    );
    const secret = observedProvider(
      createSessionConfig({
        SYSTEM_ONE_BASE_URL:
          "https://user:password@private.example/api/token123?key=secret#fragment",
      }),
      {} as never,
      history,
    );
    await assert.rejects(secret.evaluate(request), /provider error 405/);
    const record = JSON.stringify(history.entries);
    assert.match(
      history.entries[0]?.requestTarget ?? "",
      /POST https:\/\/private.example\/api\/\[redacted\]/,
    );
    assert.match(history.entries[0]?.requestTarget ?? "", /query\/fragment/);
    assert.doesNotMatch(
      record,
      /user:password|token123|key=secret|#fragment|private"/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

it("records credential failure as selected but not dispatched, without error text", async () => {
  const history = new DebugHistory();
  const provider = observedProvider(
    createSessionConfig({}, { mode: "typesafe" }),
    {} as never,
    history,
  );
  await assert.rejects(
    provider.evaluate({
      state: "secret-state",
      questions: { q: { type: "noul", instructions: "secret-question" } },
    }),
    /TypeSafe key missing/,
  );
  assert.equal(history.entries[0]?.provider, "typesafe");
  assert.equal(history.entries[0]?.outcome, "failure");
  assert.equal(history.entries[0]?.attempted, false);
  assert.doesNotMatch(
    JSON.stringify(history.entries),
    /secret-state|secret-question|TypeSafe key missing/,
  );
});

it("records failed native attempt without retaining provider-controlled error text", async () => {
  const history = new DebugHistory();
  const provider = observedProvider(
    createSessionConfig({}, { mode: "auto" }),
    {
      modelRegistry: {
        findOfType: () => ({ id: "jev-latest" }),
        classify: async () => {
          throw Error("private response body");
        },
      },
    } as never,
    history,
  );
  await assert.rejects(
    provider.evaluate({
      state: "x",
      questions: { q: { type: "noul", instructions: "Yes?" } },
    }),
    /Pi native classifier failed/,
  );
  assert.equal(history.entries[0]?.provider, "pi-native");
  assert.equal(history.entries[0]?.outcome, "failure");
  assert.equal(history.entries[0]?.attempted, true);
  assert.doesNotMatch(JSON.stringify(history.entries), /private response body/);
});

it("records HTTP fallback for auto Score and keeps only bounded history", async () => {
  const originalFetch = globalThis.fetch;
  const history = new DebugHistory();
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        answers: {
          q: {
            type: "score",
            score: 0,
            confidence: 1,
            probabilities: { "0": 1, "1": 0 },
            legend: { "0": "low", "1": "high" },
          },
        },
      }),
      { status: 200 },
    )) as typeof fetch;
  try {
    const provider = observedProvider(
      createSessionConfig({}, { mode: "auto" }),
      {
        modelRegistry: {
          findOfType: () => ({ id: "jev-latest" }),
          classify: () => {
            throw Error("must not classify Score");
          },
          getApiKeyForProvider: async () => "secret-pi-key",
        },
      } as never,
      history,
    );
    const request = {
      state: "private-state",
      questions: {
        q: {
          type: "score" as const,
          instructions: "Score private item",
          criteria: ["low", "high"],
        },
      },
    };
    for (let i = 0; i < 21; i++) await provider.evaluate(request);
    assert.equal(history.entries.length, 20);
    assert.equal(history.entries[0]?.provider, "typesafe");
    assert.equal(history.entries[0]?.reason, "contains Score");
    assert.equal(history.entries[0]?.outcome, "success");
    assert.doesNotMatch(
      JSON.stringify(history.entries),
      /private-state|private item|secret-pi-key/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

it("records actual auto route without retaining request state or credentials", async () => {
  const history = new DebugHistory();
  const ctx = {
    modelRegistry: {
      findOfType: () => ({ id: "jev-latest" }),
      classify: async () => ({
        stopReason: "stop",
        answers: { q: { type: "bool", probability: 0.8 } },
      }),
    },
  } as never;
  const provider = observedProvider(
    createSessionConfig(
      { SYSTEM_ONE_API_KEY: "private-api-key" },
      { mode: "auto" },
    ),
    ctx,
    history,
  );
  await provider.evaluate({
    state: "private-user-state",
    questions: { q: { type: "noul", instructions: "private-instruction" } },
  });
  assert.equal(history.entries.length, 1);
  assert.match(JSON.stringify(history.entries), /pi-native|native/);
  assert.doesNotMatch(
    JSON.stringify(history.entries),
    /private-user-state|private-instruction|private-api-key/,
  );
});
