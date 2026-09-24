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
  it("forwards a bounded backend error body on 422", async () => {
    const fakeFetch = async () =>
      new Response(JSON.stringify({ detail: "criteria must not be empty" }), {
        status: 422,
      });
    const p = new HttpSystemOneProvider({
      baseUrl: "https://x.example",
      fetch: fakeFetch as any,
    });
    await assert.rejects(
      p.evaluate({ state: "x", questions: { c: choice("W?", { a: null }) } }),
      /provider error 422.*criteria must not be empty/,
    );
  });
  it("extracts messages from known error envelopes", async () => {
    const bodies = [
      JSON.stringify({ message: "bad question shape" }),
      JSON.stringify({ error: { message: "nested problem" } }),
      JSON.stringify({ error: "flat problem" }),
    ];
    for (const body of bodies) {
      const fakeFetch = async () => new Response(body, { status: 400 });
      const p = new HttpSystemOneProvider({
        baseUrl: "https://x.example",
        fetch: fakeFetch as any,
      });
      await assert.rejects(
        p.evaluate({
          state: "x",
          questions: { c: choice("W?", { a: null }) },
        }),
        /provider error 400: (bad question shape|nested problem|flat problem)/,
      );
    }
  });
  it("forwards short non-JSON 4xx bodies but not HTML error pages", async () => {
    for (const [body, expected] of [
      ["missing state field", /provider error 400: missing state field/],
      ["<html><body>bad gateway page</body></html>", /^provider error 400$/],
    ] as Array<[string, RegExp]>) {
      const fakeFetch = async () => new Response(body, { status: 400 });
      const p = new HttpSystemOneProvider({
        baseUrl: "https://x.example",
        fetch: fakeFetch as any,
      });
      try {
        await p.evaluate({
          state: "x",
          questions: { c: choice("W?", { a: null }) },
        });
        assert.fail("should throw");
      } catch (e: any) {
        assert.match(e.message, expected);
      }
    }
  });
  it("redacts credential-shaped values echoed in error bodies", async () => {
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({
          detail:
            "upstream rejected api_key=s3cr3t-value with Bearer abc123 for state",
        }),
        { status: 422 },
      );
    const p = new HttpSystemOneProvider({
      baseUrl: "https://x.example",
      fetch: fakeFetch as any,
    });
    try {
      await p.evaluate({
        state: "x",
        questions: { c: choice("W?", { a: null }) },
      });
      assert.fail("should throw");
    } catch (e: any) {
      assert.match(e.message, /api_key=\[redacted\]/);
      assert.match(e.message, /Bearer \[redacted\]/);
      assert.doesNotMatch(e.message, /s3cr3t-value|abc123/);
    }
  });
  it("never forwards 5xx response bodies", async () => {
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({
          detail: "traceback with password=hunter2 on host db-internal",
        }),
        { status: 500 },
      );
    const p = new HttpSystemOneProvider({
      baseUrl: "https://x.example",
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
      assert.equal(e.message, "provider error 500");
    }
  });
  it("cuts off oversized success bodies mid-stream without full buffering", async () => {
    let pulls = 0;
    const chunk = new TextEncoder().encode("x".repeat(1024));
    const fakeFetch = async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            pulls += 1;
            controller.enqueue(chunk);
          },
        }),
        { status: 200 },
      );
    const p = new HttpSystemOneProvider({
      baseUrl: "https://x.example",
      maxResponseBytes: 2048,
      fetch: fakeFetch as any,
    });
    await assert.rejects(
      p.evaluate({ state: "x", questions: { c: choice("W?", { a: null }) } }),
      /response too large/,
    );
    // 100+ chunks available; the read must stop once the bound is hit.
    assert.ok(pulls < 10, `buffered the whole body (${pulls} pulls)`);
  });
  it("reports timeout when the success body stalls after 200 headers", async () => {
    const fakeFetch = async (_u: any, init: any) =>
      new Response(
        new ReadableStream({
          start(c) {
            // 200 headers flush; the body never arrives. Aborting the
            // signal errors the stream like a real fetch would.
            init.signal?.addEventListener("abort", () => {
              c.error(new Error("body stalled"));
            });
          },
        }),
        { status: 200 },
      );
    const p = new HttpSystemOneProvider({
      baseUrl: "https://x.example",
      timeoutMs: 20,
      fetch: fakeFetch as any,
    });
    try {
      await p.evaluate({
        state: "x",
        questions: { c: choice("W?", { a: null }) },
      });
      assert.fail("should throw");
    } catch (e: any) {
      assert.equal(e.code, "SYSTEM_ONE_TIMEOUT");
      assert.equal(e.name, "SystemOneTimeoutError");
    }
  });
  it("reports transport on external abort while the success body streams", async () => {
    const fakeFetch = async (_u: any, init: any) =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode('{"answers":'));
            init.signal?.addEventListener("abort", () => {
              c.error(new Error("aborted mid-body"));
            });
          },
        }),
        { status: 200 },
      );
    const p = new HttpSystemOneProvider({
      baseUrl: "https://x.example",
      timeoutMs: 5000,
      fetch: fakeFetch as any,
    });
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 20);
    try {
      await p.evaluate(
        { state: "x", questions: { c: choice("W?", { a: null }) } },
        { signal: ac.signal },
      );
      assert.fail("should throw");
    } catch (e: any) {
      assert.equal(e.code, "SYSTEM_ONE_TRANSPORT");
      assert.equal(e.name, "SystemOneTransportError");
    }
  });
  it("wraps mid-stream success-body failures as transport, never raw", async () => {
    const fakeFetch = async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode('{"answers":'));
            c.error(new Error("boom mid-stream"));
          },
        }),
        { status: 200 },
      );
    const p = new HttpSystemOneProvider({
      baseUrl: "https://x.example",
      fetch: fakeFetch as any,
    });
    try {
      await p.evaluate({
        state: "x",
        questions: { c: choice("W?", { a: null }) },
      });
      assert.fail("should throw");
    } catch (e: any) {
      assert.equal(e.code, "SYSTEM_ONE_TRANSPORT");
      assert.match(e.message, /boom mid-stream/);
    }
  });
  it("reports timeout when the error body stalls after error headers", async () => {
    const fakeFetch = async (_u: any, init: any) =>
      new Response(
        new ReadableStream({
          start(c) {
            // Headers flush (status is available); the body never arrives.
            // Like a real fetch, aborting the signal errors the stream.
            init.signal?.addEventListener("abort", () => {
              c.error(new Error("body stalled"));
            });
          },
        }),
        { status: 422 },
      );
    const p = new HttpSystemOneProvider({
      baseUrl: "https://x.example",
      timeoutMs: 20,
      fetch: fakeFetch as any,
    });
    try {
      await p.evaluate({
        state: "x",
        questions: { c: choice("W?", { a: null }) },
      });
      assert.fail("should throw");
    } catch (e: any) {
      assert.equal(e.code, "SYSTEM_ONE_TIMEOUT");
    }
  });
  it("omits the detail suffix when the error body is empty", async () => {
    const fakeFetch = async () => new Response("", { status: 400 });
    const p = new HttpSystemOneProvider({
      baseUrl: "https://x.example",
      fetch: fakeFetch as any,
    });
    try {
      await p.evaluate({
        state: "x",
        questions: { c: choice("W?", { a: null }) },
      });
      assert.fail("should throw");
    } catch (e: any) {
      assert.equal(e.message, "provider error 400");
    }
  });
  it("truncates long backend error bodies", async () => {
    const fakeFetch = async () =>
      new Response("e".repeat(5000), { status: 422 });
    const p = new HttpSystemOneProvider({
      baseUrl: "https://x.example",
      fetch: fakeFetch as any,
    });
    try {
      await p.evaluate({
        state: "x",
        questions: { c: choice("W?", { a: null }) },
      });
      assert.fail("should throw");
    } catch (e: any) {
      assert.match(e.message, /^provider error 422: e+$/);
      assert.ok(e.message.length < 600);
    }
  });
  it("maps abort during the error-body read to transport, not http", async () => {
    const fakeFetch = async (_u: any, init: any) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init.signal?.addEventListener("abort", () => {
              controller.error(new Error("aborted mid-body"));
            });
          },
        }),
        { status: 422 },
      );
    const p = new HttpSystemOneProvider({
      baseUrl: "https://x.example",
      timeoutMs: 5000,
      fetch: fakeFetch as any,
    });
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 20);
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
