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
