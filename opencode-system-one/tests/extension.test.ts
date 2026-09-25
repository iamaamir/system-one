import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PluginInput } from "@opencode-ai/plugin";
import SystemOnePlugin from "../src/index.ts";

interface LogEntry {
  service: string;
  level: string;
  message: string;
}

const envKeys = [
  "SYSTEM_ONE_BASE_URL",
  "SYSTEM_ONE_API_KEY",
  "SYSTEM_ONE_MODEL",
  "SYSTEM_ONE_TIMEOUT_MS",
] as const;

async function withEnv<T>(
  values: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> {
  const saved = envKeys.map((key) => [key, process.env[key]] as const);
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function createPluginContext(): { input: PluginInput; logs: LogEntry[] } {
  const logs: LogEntry[] = [];
  const input = {
    client: {
      app: {
        log: async (options: { body?: LogEntry }) => {
          if (options.body) {
            logs.push(options.body);
          }
          return { data: true };
        },
      },
    },
    project: { id: "project", worktree: "/tmp" },
    directory: "/tmp",
    worktree: "/tmp",
    $: () => undefined,
  } as unknown as PluginInput;

  return { input, logs };
}

const canonicalArgs = {
  state: { diff: "- 1 line" },
  questions: {
    color: {
      type: "choice",
      instructions: "Pick the color.",
      criteria: { red: "Stop.", blue: "Go." },
    },
  },
};

const validEnv = {
  SYSTEM_ONE_BASE_URL: "http://localhost:8008",
  SYSTEM_ONE_API_KEY: "test-key",
  SYSTEM_ONE_MODEL: "test-model",
  SYSTEM_ONE_TIMEOUT_MS: "2500",
};

function toolInput(tool: string) {
  return { tool, sessionID: "session", callID: "call" };
}

describe("System One plugin registration", () => {
  it("registers exactly the system_one tool for a valid configuration", async () => {
    const { input, logs } = createPluginContext();

    const hooks = await withEnv(validEnv, () => SystemOnePlugin(input));

    assert.deepEqual(Object.keys(hooks.tool ?? {}), ["system_one"]);
    assert.deepEqual(logs, []);
  });

  it("returns no tools and logs one warning when the base URL is missing", async () => {
    const { input, logs } = createPluginContext();

    const hooks = await withEnv(
      { ...validEnv, SYSTEM_ONE_BASE_URL: undefined },
      () => SystemOnePlugin(input),
    );

    assert.deepEqual(hooks.tool, {});
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.level, "warn");
    assert.equal(logs[0]?.service, "opencode-system-one");
    assert.match(logs[0]?.message ?? "", /SYSTEM_ONE_BASE_URL/);
  });

  it("returns no tools and never logs the API key for an invalid timeout", async () => {
    const { input, logs } = createPluginContext();
    const secret = "super-secret-key";

    const hooks = await withEnv(
      { ...validEnv, SYSTEM_ONE_API_KEY: secret, SYSTEM_ONE_TIMEOUT_MS: "0" },
      () => SystemOnePlugin(input),
    );

    assert.deepEqual(hooks.tool, {});
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.level, "warn");
    assert.match(logs[0]?.message ?? "", /SYSTEM_ONE_TIMEOUT_MS/);
    assert.doesNotMatch(logs[0]?.message ?? "", new RegExp(secret));
    assert.doesNotMatch(JSON.stringify(logs), new RegExp(secret));
  });
});

describe("System One tool.execute.before hook", () => {
  it("rejects an unknown top-level argument for system_one", async () => {
    const { input } = createPluginContext();
    const hooks = await withEnv(validEnv, () => SystemOnePlugin(input));
    const hook = hooks["tool.execute.before"];
    assert.ok(hook);

    await assert.rejects(async () =>
      hook(toolInput("system_one"), {
        args: { ...canonicalArgs, model: "private-model" },
      }),
    );
  });

  it("ignores unrelated tools", async () => {
    const { input } = createPluginContext();
    const hooks = await withEnv(validEnv, () => SystemOnePlugin(input));
    const hook = hooks["tool.execute.before"];
    assert.ok(hook);
    const output = { args: { filePath: "/tmp/file.ts", model: "private" } };

    await hook(toolInput("read"), output);

    assert.deepEqual(output.args, {
      filePath: "/tmp/file.ts",
      model: "private",
    });
  });

  it("accepts canonical system_one arguments unchanged", async () => {
    const { input } = createPluginContext();
    const hooks = await withEnv(validEnv, () => SystemOnePlugin(input));
    const hook = hooks["tool.execute.before"];
    assert.ok(hook);
    const output = { args: { ...canonicalArgs } };

    await hook(toolInput("system_one"), output);

    assert.deepEqual(output.args, canonicalArgs);
  });
});
