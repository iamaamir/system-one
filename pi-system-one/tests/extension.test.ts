// pi-system-one/tests/extension.test.ts

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import piSystemOneExtension, {
  systemOnePromptsDir,
  systemOneSkillsDir,
} from "../src/extension.ts";

describe("extension resources", () => {
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
