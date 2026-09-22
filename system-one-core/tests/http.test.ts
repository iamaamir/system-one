import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpSystemOneProvider } from "../src/providers/http.ts";
import { choice } from "../src/questions.ts";

describe("http provider", () => {
  it("POSTs to /v1/systemone with auth and validates", async () => {
    const seen: any = {};
    const fakeFetch = async (url: any, init: any) => {
      seen.url = String(url);
      seen.init = init;
      return new Response(
        JSON.stringify({
          answers: {
            c: {
              type: "choice",
              choice: "a",
              probabilities: { a: 0.9, b: 0.1 },
              confidence: 0.9,
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const p = new HttpSystemOneProvider({
      id: "t",
      baseUrl: "https://api.example.com",
      apiKey: "secret",
      fetch: fakeFetch as any,
    });
    const res = await p.evaluate({
      state: "hi",
      questions: { c: choice("Which?", { a: null, b: null }) },
    });
    assert.match(seen.url, /\/v1\/systemone$/);
    assert.equal(seen.init.headers.Authorization, "Bearer secret");
    assert.equal((res.answers.c as any).choice, "a");
    assert.equal(res.metadata.provider, "t");
  });
  it("maps 401 to HttpError without leaking key", async () => {
    const fakeFetch = async () => new Response("nope", { status: 401 });
    const p = new HttpSystemOneProvider({
      baseUrl: "https://x.example",
      apiKey: "s3cr3t",
      fetch: fakeFetch as any,
    });
    try {
      await p.evaluate({
        state: "x",
        questions: { c: choice("W?", { a: null }) },
      });
      assert.fail("should throw");
    } catch (e: any) {
      assert.equal(e.code, "SYSTEM_ONE_HTTP");
      assert.doesNotMatch(String(e.stack) + JSON.stringify(e), /s3cr3t/);
    }
  });
  it("times out", async () => {
    const fakeFetch = async (_u: any, init: any) =>
      new Promise((_res, rej) => {
        init.signal?.addEventListener("abort", () =>
          rej(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    const p = new HttpSystemOneProvider({
      baseUrl: "https://x.example",
      timeoutMs: 20,
      fetch: fakeFetch as any,
    });
    await assert.rejects(
      p.evaluate({ state: "x", questions: { c: choice("W?", { a: null }) } }),
      /SYSTEM_ONE_TIMEOUT|timeout/i,
    );
  });
  it("distinguishes user abort from timeout", async () => {
    const fakeFetch = async (_u: any, init: any) =>
      new Promise((_res, rej) => {
        if (init.signal?.aborted)
          return rej(
            Object.assign(new Error("aborted"), { name: "AbortError" }),
          );
        init.signal?.addEventListener("abort", () =>
          rej(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    const p = new HttpSystemOneProvider({
      baseUrl: "https://x.example",
      timeoutMs: 5000,
      fetch: fakeFetch as any,
    });
    const ac = new AbortController();
    ac.abort();
    try {
      await p.evaluate(
        { state: "x", questions: { c: choice("W?", { a: null }) } },
        { signal: ac.signal },
      );
      assert.fail("should throw");
    } catch (e: any) {
      assert.equal(e.code, "SYSTEM_ONE_TRANSPORT");
    }
  });
});
