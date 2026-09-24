// Phase 2 baseline: bounded-memory response handling in HttpSystemOneProvider.
// The important property is BOUNDED memory, not throughput: over-limit
// streams must be cut off mid-read, error bodies capped, and small
// responses cheap. Uses a small maxResponseBytes so the bench stays fast.
// Run: node --expose-gc --experimental-strip-types bench/http-memory.bench.ts

import { HttpSystemOneProvider } from "../system-one-core/src/providers/http.ts";
import {
  benchHeader,
  fmtTiming,
  garbageBytesAsync,
  measure,
  measureAsync,
} from "./harness.ts";

const MAX_BYTES = 10_000;

function fakeResponse(opts: {
  ok: boolean;
  status: number;
  bodyBytes: number;
  chunkBytes?: number;
  json?: boolean;
}): Response {
  // A valid System One JSON body of ~bodyBytes; padded with whitespace
  // (JSON.parse tolerates leading/trailing whitespace).
  const core = JSON.stringify({
    answers: {
      rollback: { type: "noul", noul: 0.7 },
    },
  });
  const pad = opts.json === false ? "E" : " ";
  const text =
    opts.json === false
      ? "E".repeat(opts.bodyBytes)
      : core + pad.repeat(Math.max(0, opts.bodyBytes - core.length));
  const bytes = new TextEncoder().encode(text);
  const chunk = opts.chunkBytes ?? bytes.length;
  let offset = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(bytes.length, offset + chunk);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  });
  return new Response(stream, {
    status: opts.status,
    headers: { "content-type": "application/json" },
  });
}

function providerWith(fetchImpl: (url: string, init: unknown) => unknown) {
  return new HttpSystemOneProvider({
    baseUrl: "https://bench.invalid",
    maxResponseBytes: MAX_BYTES,
    fetch: fetchImpl as typeof fetch,
  });
}

const request = {
  state: "incident",
  questions: { rollback: { type: "noul", instructions: "Roll back?" } },
} as never;

async function main(): Promise<void> {
  benchHeader("HTTP bounded-memory behavior");

  // 1. Small successful JSON response.
  {
    const p = providerWith(async () =>
      fakeResponse({ ok: true, status: 200, bodyBytes: 300 }),
    );
    const out = (await p.evaluate(request)) as {
      answers: { rollback: { noul: number } };
    };
    console.log(`small ok: noul=${out.answers.rollback.noul}`);
    const t = await measureAsync(() => p.evaluate(request), 2_000);
    const g = await garbageBytesAsync(() => p.evaluate(request), 200);
    console.log(
      `small ok ${fmtTiming(t)} | garbage ~${g.generatedPerOp.toFixed(0)}B/op retained ${g.retained}B`,
    );
  }

  // 2. Near-limit successful response (just under the cap, many chunks).
  {
    const p = providerWith(async () =>
      fakeResponse({
        ok: true,
        status: 200,
        bodyBytes: MAX_BYTES - 100,
        chunkBytes: 500,
      }),
    );
    const out = (await p.evaluate(request)) as {
      answers: { rollback: { noul: number } };
    };
    console.log(`near-limit ok parses: noul=${out.answers.rollback.noul}`);
    const t = await measureAsync(() => p.evaluate(request), 500);
    const g = await garbageBytesAsync(() => p.evaluate(request), 100);
    console.log(
      `near-limit ok (~${MAX_BYTES}B, 500B chunks) ${fmtTiming(t)} | garbage ~${g.generatedPerOp.toFixed(0)}B/op retained ${g.retained}B`,
    );
  }

  // 3. Over-limit streamed response: 10x the cap in small chunks. Must throw
  // "response too large" WITHOUT buffering the whole stream.
  {
    const p = providerWith(async () =>
      fakeResponse({
        ok: true,
        status: 200,
        bodyBytes: MAX_BYTES * 10,
        chunkBytes: 1_000,
      }),
    );
    let message = "";
    try {
      await p.evaluate(request);
    } catch (e) {
      message = (e as Error).message;
    }
    const g = await garbageBytesAsync(
      () => p.evaluate(request).catch(() => {}),
      50,
    );
    console.log(
      `over-limit ok (100KB stream, 10KB cap): throws "${message}" | garbage ~${g.generatedPerOp.toFixed(0)}B/op retained ${g.retained}B`,
    );
  }

  // 4. Small 4xx with structured envelope.
  {
    const p = providerWith(
      async () =>
        new Response(JSON.stringify({ detail: "bad question" }), {
          status: 422,
        }),
    );
    let message = "";
    try {
      await p.evaluate(request);
    } catch (e) {
      message = (e as Error).message;
    }
    console.log(`small 4xx: throws "${message}"`);
  }

  // 5. Near-limit 4xx: error body larger than the 2KB error cap must be cut.
  {
    const big = "E".repeat(20_000);
    const p = providerWith(async () => new Response(big, { status: 400 }));
    let message = "";
    try {
      await p.evaluate(request);
    } catch (e) {
      message = (e as Error).message;
    }
    console.log(
      `near-limit 4xx (20KB body): detail chars=${message.length} (cap allows "<= ~520 incl. prefix")`,
    );
  }

  // 6. Sync-constructed provider cost (Phase 7 will move work here).
  const t6 = measure(
    () =>
      void new HttpSystemOneProvider({
        baseUrl: "https://bench.invalid/",
        headers: { "x-test": "1" },
        apiKey: "k",
      }),
    20_000,
  );
  console.log(`provider construction ${fmtTiming(t6)}`);
}

await main();
