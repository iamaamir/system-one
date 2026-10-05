// pi-system-one/tests/commands.test.ts

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  registerSystemOneCommands,
  type SessionStore,
} from "../src/commands.ts";
import { createSessionConfig } from "../src/config.ts";
import { resolveSessionProvider } from "../src/provider.ts";

interface Captured {
  tools: string[];
  handler: ((args: string, ctx: never) => Promise<void>) | undefined;
  completions: ((prefix: string) => { value: string }[]) | undefined;
  notices: string[];
}

function harness() {
  const cap: Captured = {
    tools: [],
    handler: undefined,
    completions: undefined,
    notices: [],
  };
  const pi = {
    registerTool: (t: { name: string }) => {
      cap.tools.push(t.name);
    },
    registerCommand: (
      _n: string,
      o: {
        handler: (args: string, ctx: never) => Promise<void>;
        getArgumentCompletions?: (prefix: string) => { value: string }[];
      },
    ) => {
      cap.handler = o.handler;
      cap.completions = o.getArgumentCompletions;
    },
    on: () => {},
  };
  return { pi: pi as never, cap };
}

function ctxFor(answers: (string | undefined)[], cap: Captured) {
  return {
    modelRegistry: { getApiKeyForProvider: async () => undefined },
    ui: {
      input: async () => answers.shift(),
      notify: (msg: string) => {
        cap.notices.push(msg);
      },
    },
  } as never;
}

describe("so command", () => {
  it("keeps explicit TypeSafe environment key after selecting TypeSafe", async () => {
    const previousKey = process.env.SYSTEM_ONE_API_KEY;
    const previousUrl = process.env.SYSTEM_ONE_BASE_URL;
    const originalFetch = globalThis.fetch;
    try {
      process.env.SYSTEM_ONE_API_KEY = "test-key";
      delete process.env.SYSTEM_ONE_BASE_URL;
      const { pi, cap } = harness();
      const store: SessionStore = { session: createSessionConfig(process.env) };
      registerSystemOneCommands(pi, store);
      await cap.handler?.("config typesafe", ctxFor([], cap));
      globalThis.fetch = (async (_url, options) => {
        assert.equal(
          new Headers(options?.headers).get("authorization"),
          "Bearer test-key",
        );
        return new Response(
          JSON.stringify({ answers: { q: { type: "noul", noul: 0.7 } } }),
          { status: 200 },
        );
      }) as typeof fetch;
      const session = store.session;
      assert.ok(session);
      const provider = await resolveSessionProvider(session, {
        modelRegistry: { getApiKeyForProvider: async () => undefined },
      } as never);
      await provider.evaluate({
        state: "x",
        questions: { q: { type: "noul", instructions: "Yes?" } },
      });
    } finally {
      if (previousKey === undefined) delete process.env.SYSTEM_ONE_API_KEY;
      else process.env.SYSTEM_ONE_API_KEY = previousKey;
      if (previousUrl === undefined) delete process.env.SYSTEM_ONE_BASE_URL;
      else process.env.SYSTEM_ONE_BASE_URL = previousUrl;
      globalThis.fetch = originalFetch;
    }
  });
  it("does not carry a custom endpoint environment key to TypeSafe", async () => {
    const previousKey = process.env.SYSTEM_ONE_API_KEY;
    const previousUrl = process.env.SYSTEM_ONE_BASE_URL;
    try {
      process.env.SYSTEM_ONE_API_KEY = "custom-key";
      process.env.SYSTEM_ONE_BASE_URL = "https://custom.example";
      const { pi, cap } = harness();
      const store: SessionStore = { session: createSessionConfig(process.env) };
      registerSystemOneCommands(pi, store);
      await cap.handler?.("config typesafe", ctxFor([], cap));
      assert.equal(store.session?.current.apiKey, undefined);
    } finally {
      if (previousKey === undefined) delete process.env.SYSTEM_ONE_API_KEY;
      else process.env.SYSTEM_ONE_API_KEY = previousKey;
      if (previousUrl === undefined) delete process.env.SYSTEM_ONE_BASE_URL;
      else process.env.SYSTEM_ONE_BASE_URL = previousUrl;
    }
  });
  it("does not save a URL containing a token or change the active session", async () => {
    const dir = mkdtempSync(join(tmpdir(), "so-command-"));
    try {
      const path = join(dir, "pi-system-one.json");
      const { pi, cap } = harness();
      const store: SessionStore = { session: createSessionConfig({}) };
      registerSystemOneCommands(pi, store, path);
      await cap.handler?.(
        "config custom",
        ctxFor(["https://example.com/?token=secret", "", ""], cap),
      );
      assert.equal(store.session?.mode, "typesafe");
      assert.match(cap.notices.at(-1) ?? "", /Could not save settings/);
      assert.doesNotMatch(cap.notices.join(" "), /secret/);
      assert.throws(() => readFileSync(path, "utf8"), /ENOENT/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("persists custom settings without session key and switches back to native", async () => {
    const dir = mkdtempSync(join(tmpdir(), "so-command-"));
    try {
      const path = join(dir, "pi-system-one.json");
      const { pi, cap } = harness();
      const store: SessionStore = {};
      registerSystemOneCommands(pi, store, path);
      await cap.handler?.(
        "config custom",
        ctxFor(["http://localhost:8008", "reflex", "secret"], cap),
      );
      assert.equal(store.session?.current.apiKey, "secret");
      const saved = readFileSync(path, "utf8");
      assert.doesNotMatch(saved, /secret|apiKey/);
      assert.match(saved, /localhost:8008/);
      await cap.handler?.("config native", ctxFor([], cap));
      assert.equal(store.session?.mode, "native");
      assert.equal(store.session?.current.apiKey, undefined);
      assert.match(readFileSync(path, "utf8"), /native/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("completes config + status, case-insensitively", () => {
    const { pi, cap } = harness();
    registerSystemOneCommands(pi, {});
    assert.deepEqual(
      cap.completions?.("").map((c) => c.value),
      ["config", "status"],
    );
    assert.deepEqual(
      cap.completions?.("S").map((c) => c.value),
      ["status"],
    );
    assert.deepEqual(cap.completions?.("x"), []);
  });
  it("registers the tool before config and switches to custom on request", async () => {
    const { pi, cap } = harness();
    const store: SessionStore = {};
    registerSystemOneCommands(pi, store).applyProvider();
    assert.deepEqual(cap.tools, ["system_one"]);
    await cap.handler?.("", ctxFor(["custom", "http://x/", "", ""], cap));
    assert.equal(store.session?.current.baseUrl, "http://x/");
    assert.equal(store.session?.mode, "custom");
  });
  it("cancel (undefined) keeps everything and registers nothing", async () => {
    const { pi, cap } = harness();
    const store: SessionStore = {};
    registerSystemOneCommands(pi, store);
    await cap.handler?.("", ctxFor([undefined], cap));
    assert.deepEqual(cap.tools, []);
    assert.equal(store.session, undefined);
    assert.match(cap.notices[0], /Cancelled/);
  });
  it("empty base URL keeps existing value", async () => {
    const { pi, cap } = harness();
    const store: SessionStore = {
      session: createSessionConfig({ SYSTEM_ONE_BASE_URL: "http://keep/" }),
    };
    registerSystemOneCommands(pi, store);
    await cap.handler?.("", ctxFor(["custom", "", "", ""], cap));
    assert.equal(store.session?.current.baseUrl, "http://keep/");
  });
  it("whitespace-only base URL is rejected", async () => {
    const { pi, cap } = harness();
    const store: SessionStore = { session: createSessionConfig({}) };
    registerSystemOneCommands(pi, store);
    await cap.handler?.("", ctxFor(["custom", "   ", "", ""], cap));
    assert.equal(store.session?.mode, "typesafe");
    assert.match(cap.notices[0], /Cancelled/);
  });
  it("'-' forgets a memory key back to env", async () => {
    const { pi, cap } = harness();
    const store: SessionStore = {
      session: createSessionConfig({ SYSTEM_ONE_BASE_URL: "http://x/" }),
    };
    registerSystemOneCommands(pi, store);
    await cap.handler?.("", ctxFor(["custom", "", "", "sk-mem"], cap));
    assert.equal(store.session?.keyInMemory, true);
    await cap.handler?.("", ctxFor(["custom", "", "", "-"], cap));
    // A key from another endpoint must never follow this configured URL.
    assert.equal(store.session?.keyInMemory, false);
    assert.equal(
      store.session?.current.apiKey,
      process.env.SYSTEM_ONE_BASE_URL === "http://x/"
        ? process.env.SYSTEM_ONE_API_KEY || undefined
        : undefined,
    );
  });
  it("status shows current config; STATUS routes case-insensitively", async () => {
    const { pi, cap } = harness();
    const store: SessionStore = {
      session: createSessionConfig({ SYSTEM_ONE_BASE_URL: "http://x/" }),
    };
    registerSystemOneCommands(pi, store);
    await cap.handler?.("STATUS", ctxFor([], cap));
    assert.match(cap.notices[0], /http:\/\/x\//);
  });
  it("status shows TypeSafe defaults and login guidance without auth", async () => {
    const { pi, cap } = harness();
    registerSystemOneCommands(pi, { session: createSessionConfig({}) });
    await cap.handler?.("status", ctxFor([], cap));
    assert.match(cap.notices[0], /typesafe/);
    assert.match(cap.notices[0], /login typesafe/);
  });
});
