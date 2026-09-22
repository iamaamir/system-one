import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSystemOne, SystemOne } from "../src/client.ts";
import { SystemOneConfigurationError } from "../src/errors.ts";
import type { SystemOneProvider } from "../src/provider.ts";
import { noul } from "../src/questions.ts";

describe("client", () => {
  it("delegates evaluate to provider and tags metadata", async () => {
    const provider: SystemOneProvider = {
      id: "fake",
      async evaluate(_req) {
        return {
          answers: { q: { type: "noul", noul: 0.7 } },
          metadata: { provider: "fake" },
        } as any;
      },
    };
    const s1 = new SystemOne({ provider });
    const res = await s1.evaluate({
      state: "x",
      questions: { q: noul("Is it?") },
    });
    assert.equal((res.answers.q as any).noul, 0.7);
    assert.equal(res.metadata.provider, "fake");
  });
  it("rejects empty questions", async () => {
    const provider: SystemOneProvider = {
      id: "f",
      async evaluate() {
        throw new Error("should not call");
      },
    };
    await assert.rejects(
      () =>
        new SystemOne({ provider }).evaluate({
          state: "x",
          questions: {},
        } as any),
      (e: unknown) =>
        e instanceof SystemOneConfigurationError &&
        (e as any).code === "SYSTEM_ONE_CONFIGURATION",
    );
  });
  it("createSystemOne factory delegates", async () => {
    const provider: SystemOneProvider = {
      id: "g",
      async evaluate() {
        return { answers: {}, metadata: { provider: "g" } } as any;
      },
    };
    const s1 = createSystemOne({ provider });
    assert.equal(s1.provider, provider);
  });
  it("requires provider", () => {
    assert.throws(() => new SystemOne({} as any), /provider is required/);
  });
});
