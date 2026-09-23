// pi-system-one/tests/commands.test.ts

import assert from "node:assert/strict";
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
    ui: {
      input: async () => answers.shift(),
      notify: (msg: string) => {
        cap.notices.push(msg);
      },
    },
  } as never;
}

describe("so command", () => {
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
  it("bare /so configures from blank session and registers the tool", async () => {
    const { pi, cap } = harness();
    const store: SessionStore = {};
    registerSystemOneCommands(pi, store);
    await cap.handler?.("", ctxFor(["http://x/", "", ""], cap));
    assert.deepEqual(cap.tools, ["system_one"]);
    assert.equal(store.session?.current.baseUrl, "http://x/");
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
    await cap.handler?.("", ctxFor(["", "", ""], cap));
    assert.equal(store.session?.current.baseUrl, "http://keep/");
  });
  it("whitespace-only base URL is rejected", async () => {
    const { pi, cap } = harness();
    const store: SessionStore = {};
    registerSystemOneCommands(pi, store);
    await cap.handler?.("", ctxFor(["   ", "", ""], cap));
    assert.equal(store.session, undefined);
    assert.match(cap.notices[0], /Cancelled/);
  });
  it("'-' forgets a memory key back to env", async () => {
    const { pi, cap } = harness();
    const store: SessionStore = {
      session: createSessionConfig({ SYSTEM_ONE_BASE_URL: "http://x/" }),
    };
    registerSystemOneCommands(pi, store);
    await cap.handler?.("", ctxFor(["", "", "sk-mem", ""], cap));
    assert.equal(store.session?.keyInMemory, true);
    await cap.handler?.("", ctxFor(["", "", "-", ""], cap));
    // After forgetting the memory key, the API key should revert to the environment variable (if any).
    // In the CI environment, SYSTEM_ONE_API_KEY may be set; otherwise it will be undefined.
    assert.equal(store.session?.keyInMemory, false);
    assert.equal(
      store.session?.current.apiKey,
      process.env.SYSTEM_ONE_API_KEY || undefined,
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
  it("status with no session explains how to configure", async () => {
    const { pi, cap } = harness();
    registerSystemOneCommands(pi, {});
    await cap.handler?.("status", ctxFor([], cap));
    assert.match(cap.notices[0], /not configured/);
  });
});
