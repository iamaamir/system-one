import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SystemOne } from "../src/client.ts";
import { MockSystemOneProvider } from "../src/providers/mock.ts";
import { choice, noul } from "../src/questions.ts";

describe("mock provider", () => {
  it("returns canned answers through the client", async () => {
    const m = new MockSystemOneProvider({
      answers: { q: { type: "noul", noul: 1 } },
    });
    const s1 = new SystemOne({ provider: m });
    const r = await s1.evaluate({
      state: "x",
      questions: { q: noul("Is it?") },
    });
    assert.equal((r.answers.q as any).noul, 1);
    assert.equal(r.metadata.provider, "mock");
  });
  it("throws on missing canned answer", async () => {
    const m = new MockSystemOneProvider({ answers: {} });
    await assert.rejects(
      () =>
        new SystemOne({ provider: m }).evaluate({
          state: "x",
          questions: { q: choice("W?", { a: null }) },
        }),
      /has no canned answer for/,
    );
  });
  it("does not match inherited names as canned answers", async () => {
    const m = new MockSystemOneProvider({ answers: {} });
    // "toString" exists on Object.prototype; own-key membership must still
    // report it missing instead of returning the inherited function.
    await assert.rejects(
      () =>
        new SystemOne({ provider: m }).evaluate({
          state: "x",
          questions: JSON.parse(
            JSON.stringify({ toString: choice("W?", { a: null }) }),
          ),
        }),
      /has no canned answer for "toString"/,
    );
  });
  it('serves a canned "__proto__" answer as an ordinary entry', async () => {
    const m = new MockSystemOneProvider({
      // Computed key: an own entry, not a reparented prototype.
      answers: { ["__proto__"]: { type: "noul", noul: 0.25 } },
    });
    const r = await new SystemOne({ provider: m }).evaluate({
      state: "x",
      questions: JSON.parse(JSON.stringify({ ["__proto__"]: noul("Is it?") })),
    });
    assert.ok(Object.hasOwn(r.answers, "__proto__"));
    // biome-ignore lint/suspicious/noProto: reads the own entry to prove it is data, not a reparented prototype.
    assert.equal((r.answers as any).__proto__.noul, 0.25);
    assert.equal(Object.getPrototypeOf(r.answers), Object.prototype);
  });
  it("public exports resolve", async () => {
    const idx: any = await import("../src/index.ts");
    for (const k of [
      "SystemOne",
      "createSystemOne",
      "HttpSystemOneProvider",
      "MockSystemOneProvider",
      "choice",
      "noul",
      "score",
      "validateResponse",
    ]) {
      assert.ok(k in idx, `missing export ${k}`);
    }
  });
});
