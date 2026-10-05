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
