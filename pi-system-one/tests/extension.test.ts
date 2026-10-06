// pi-system-one/tests/extension.test.ts

import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import piSystemOneExtension, {
  systemOnePromptsDir,
  systemOneSkillsDir,
} from "../src/extension.ts";
import type { buildSystemOneTool } from "../src/tool.ts";

describe("extension resources", () => {
  it("startup warning does not echo an untrusted settings field name", () => {
    const dir = mkdtempSync(join(tmpdir(), "so-extension-warning-"));
    const previous = process.env.PI_CODING_AGENT_DIR;
    try {
      process.env.PI_CODING_AGENT_DIR = dir;
      writeFileSync(
        join(dir, "pi-system-one.json"),
        JSON.stringify({ "Bearer secret-token": "ignored" }),
      );
      const handlers: Record<string, (event: never, ctx: never) => void> = {};
      piSystemOneExtension({
        registerTool: () => {},
        registerCommand: () => {},
        on: (name: string, handler: (event: never, ctx: never) => void) => {
          handlers[name] = handler;
        },
      } as never);
      let warning = "";
      handlers.session_start(
        { reason: "startup" } as never,
        {
          ui: {
            notify: (message: string) => {
              warning = message;
            },
          },
        } as never,
      );
      assert.match(warning, /Ignoring saved settings/);
      assert.doesNotMatch(warning, /Bearer|secret-token/);
    } finally {
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("uses the registered tool after switching to native mode and rejects malformed success", async () => {
    const dir = mkdtempSync(join(tmpdir(), "so-extension-native-"));
    const previous = {
      dir: process.env.PI_CODING_AGENT_DIR,
      base: process.env.SYSTEM_ONE_BASE_URL,
    };
    try {
      process.env.PI_CODING_AGENT_DIR = dir;
      delete process.env.SYSTEM_ONE_BASE_URL;
      let tool: ReturnType<typeof buildSystemOneTool> | undefined;
      let command: ((args: string, ctx: never) => Promise<void>) | undefined;
      piSystemOneExtension({
        registerTool: (value: ReturnType<typeof buildSystemOneTool>) => {
          tool = value;
        },
        registerCommand: (
          _name: string,
          options: { handler: typeof command },
        ) => {
          command = options.handler;
        },
        on: () => {},
      } as never);
      await command?.("config native", { ui: { notify: () => {} } } as never);
      assert.ok(tool);
      let probability = 0.7;
      const ctx = {
        modelRegistry: {
          findOfType: () => ({ id: "jev-latest" }),
          classify: async () => ({
            stopReason: "stop",
            model: "jev-latest",
            provider: "typesafe",
            answers: { q: { type: "bool", probability } },
          }),
        },
      } as never;
      const args = {
        state: "x",
        questions: { q: { type: "noul" as const, instructions: "Yes?" } },
      };
      const result = await tool.execute(
        "native-valid",
        args,
        undefined,
        undefined,
        ctx,
      );
      assert.deepEqual(result.details.answers.q, { type: "noul", noul: 0.7 });
      probability = 2;
      await assert.rejects(
        tool.execute("native-invalid", args, undefined, undefined, ctx),
        /Pi native classifier failed/,
      );
    } finally {
      if (previous.dir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous.dir;
      if (previous.base === undefined) delete process.env.SYSTEM_ONE_BASE_URL;
      else process.env.SYSTEM_ONE_BASE_URL = previous.base;
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("loads saved native mode instead of an inherited TypeSafe endpoint on restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "so-saved-native-"));
    const oldDir = process.env.PI_CODING_AGENT_DIR;
    const oldUrl = process.env.SYSTEM_ONE_BASE_URL;
    const originalFetch = globalThis.fetch;
    try {
      process.env.PI_CODING_AGENT_DIR = dir;
      process.env.SYSTEM_ONE_BASE_URL = "https://api.typesafe.ai";
      writeFileSync(join(dir, "pi-system-one.json"), '{"mode":"native"}');
      let tool: ReturnType<typeof buildSystemOneTool> | undefined;
      let command: ((args: string, ctx: never) => Promise<void>) | undefined;
      piSystemOneExtension({
        registerTool: (value: ReturnType<typeof buildSystemOneTool>) => {
          tool = value;
        },
        registerCommand: (
          _name: string,
          options: { handler: typeof command },
        ) => {
          command = options.handler;
        },
        on: () => {},
      } as never);
      let status = "";
      await command?.("status", {
        ui: {
          notify: (message: string) => {
            status = message;
          },
        },
      } as never);
      assert.match(status, /mode: native \(saved\)/);
      globalThis.fetch = (async () => {
        throw Error("saved native mode must not make HTTP calls");
      }) as typeof fetch;
      assert.ok(tool);
      const result = await tool.execute(
        "saved-native",
        {
          state: "x",
          questions: { q: { type: "noul", instructions: "Yes?" } },
        },
        undefined,
        undefined,
        {
          modelRegistry: {
            findOfType: () => ({ id: "jev-latest" }),
            classify: async () => ({
              stopReason: "stop",
              answers: { q: { type: "bool", probability: 0.8 } },
            }),
          },
        } as never,
      );
      assert.deepEqual(result.details.answers.q, { type: "noul", noul: 0.8 });
    } finally {
      globalThis.fetch = originalFetch;
      if (oldDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = oldDir;
      if (oldUrl === undefined) delete process.env.SYSTEM_ONE_BASE_URL;
      else process.env.SYSTEM_ONE_BASE_URL = oldUrl;
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("reloads saved custom config across extension instances", async () => {
    const dir = mkdtempSync(join(tmpdir(), "so-extension-"));
    const prev = {
      base: process.env.SYSTEM_ONE_BASE_URL,
      model: process.env.SYSTEM_ONE_MODEL,
      agentDir: process.env.PI_CODING_AGENT_DIR,
    };
    try {
      delete process.env.SYSTEM_ONE_BASE_URL;
      delete process.env.SYSTEM_ONE_MODEL;
      process.env.PI_CODING_AGENT_DIR = dir;
      let command: ((args: string, ctx: never) => Promise<void>) | undefined;
      const pi = {
        registerTool: () => {},
        registerCommand: (
          _name: string,
          options: { handler: typeof command },
        ) => {
          command = options.handler;
        },
        on: () => {},
      };
      piSystemOneExtension(pi as never);
      const values = ["http://localhost:8008", "reflex", "temporary-key"];
      await command?.("config custom", {
        ui: { input: async () => values.shift(), notify: () => {} },
      } as never);
      const stored = readFileSync(join(dir, "pi-system-one.json"), "utf8");
      assert.doesNotMatch(stored, /temporary-key|apiKey/);
      piSystemOneExtension(pi as never);
      let status = "";
      await command?.("status", {
        ui: {
          notify: (value: string) => {
            status = value;
          },
        },
      } as never);
      assert.match(status, /mode: custom/);
      assert.match(status, /localhost:8008/);
      assert.match(status, /model: reflex/);
    } finally {
      for (const [key, value] of Object.entries({
        SYSTEM_ONE_BASE_URL: prev.base,
        SYSTEM_ONE_MODEL: prev.model,
        PI_CODING_AGENT_DIR: prev.agentDir,
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("contributes a valid system-one skill directory", async () => {
    const prev = process.env.SYSTEM_ONE_BASE_URL;
    process.env.SYSTEM_ONE_BASE_URL = "http://localhost:8008";
    try {
      const handlers: Record<string, (event: never) => unknown> = {};
      const pi = {
        registerTool: () => {},
        registerCommand: () => {},
        on: (channel: string, handler: (event: never) => unknown) => {
          handlers[channel] = handler;
        },
      };
      piSystemOneExtension(pi as never);
      const discover = handlers.resources_discover;
      assert.ok(discover, "resources_discover handler registered");
      const result = (await discover({} as never)) as {
        skillPaths: string[];
      };
      assert.equal(result.skillPaths.length, 1);
      assert.equal(result.skillPaths[0], systemOneSkillsDir());
      const skillMd = join(result.skillPaths[0], "system-one", "SKILL.md");
      assert.ok(existsSync(skillMd), `missing ${skillMd}`);
      const raw = readFileSync(skillMd, "utf-8");
      const frontmatter = raw.split("---")[1] ?? "";
      // YAML forbids `: ` inside unquoted plain scalars (it starts a nested
      // mapping — Pi rejects the skill). Every multi-word value must be
      // quoted or use a block scalar.
      for (const line of frontmatter.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const value = trimmed.replace(/^\w+:\s*/, "");
        const quoted =
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")) ||
          value.startsWith("|") ||
          value.startsWith(">");
        assert.ok(
          quoted || !value.includes(": "),
          `unquoted ": " in SKILL.md frontmatter: ${trimmed}`,
        );
      }
      const stripQuotes = (s: string) =>
        s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
      const name = stripQuotes(
        frontmatter.match(/name:\s*(.+)/)?.[1]?.trim() ?? "",
      );
      const description = stripQuotes(
        frontmatter.match(/description:\s*(.+)/)?.[1]?.trim() ?? "",
      );
      // Pi's skill validation rules (docs/skills.md): name 1-64 chars,
      // lowercase alphanumerics/hyphens, no leading/trailing or consecutive
      // hyphens; description required, max 1024 chars.
      assert.match(name, /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/);
      assert.ok(name.length >= 1 && name.length <= 64);
      assert.ok(!name.includes("--"));
      assert.ok(description.length >= 1 && description.length <= 1024);
      assert.match(description, /system_one|System One/);
      assert.ok(
        existsSync(
          join(
            result.skillPaths[0],
            "system-one",
            "references",
            "use-cases.md",
          ),
        ),
        "missing use-cases reference",
      );
    } finally {
      if (prev === undefined) delete process.env.SYSTEM_ONE_BASE_URL;
      else process.env.SYSTEM_ONE_BASE_URL = prev;
    }
  });

  it("contributes a valid /judge prompt template", async () => {
    const prev = process.env.SYSTEM_ONE_BASE_URL;
    process.env.SYSTEM_ONE_BASE_URL = "http://localhost:8008";
    try {
      const handlers: Record<string, (event: never) => unknown> = {};
      const pi = {
        registerTool: () => {},
        registerCommand: () => {},
        on: (channel: string, handler: (event: never) => unknown) => {
          handlers[channel] = handler;
        },
      };
      piSystemOneExtension(pi as never);
      const discover = handlers.resources_discover;
      assert.ok(discover, "resources_discover handler registered");
      const result = (await discover({} as never)) as {
        promptPaths: string[];
      };
      assert.equal(result.promptPaths.length, 1);
      assert.equal(result.promptPaths[0], systemOnePromptsDir());
      const judgeMd = join(result.promptPaths[0], "judge.md");
      assert.ok(existsSync(judgeMd), `missing ${judgeMd}`);
      const content = readFileSync(judgeMd, "utf-8");
      // Prompt templates take `$@` args and must name the tool explicitly:
      // that explicit naming is what makes routing deterministic.
      assert.match(content, /\$@/);
      assert.match(content, /system_one/);
      assert.match(content, /do not\s+answer it directly/i);
      // noul answers carry no confidence field; the template must not ask
      // the model to report one or it will invent numbers.
      assert.match(content, /for noul the probability/i);
    } finally {
      if (prev === undefined) delete process.env.SYSTEM_ONE_BASE_URL;
      else process.env.SYSTEM_ONE_BASE_URL = prev;
    }
  });
});
