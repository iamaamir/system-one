import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";

it("keeps the Node shebang in the packed executable", async () => {
  const entry = join(process.cwd(), "dist/index.js");
  const firstLine = (await readFile(entry, "utf8")).split("\n", 1)[0];
  assert.equal(firstLine, "#!/usr/bin/env node");
});

it("starts through an npm-style bin symlink", async () => {
  const directory = await mkdtemp(join(tmpdir(), "systemone-mcp-"));
  const link = join(directory, "systemone-mcp");
  const entry = join(process.cwd(), "dist/index.js");
  await symlink(entry, link);
  const child = spawn(process.execPath, [link], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  try {
    const response = new Promise<string>((resolve, reject) => {
      let output = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
        if (output.includes("\n")) resolve(output.trim().split("\n")[0]);
      });
      child.on("error", reject);
      child.stderr.resume();
    });
    child.stdin.end(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "smoke", version: "1" },
        },
      })}\n`,
    );
    const message = JSON.parse(await response) as {
      result?: { serverInfo?: { name?: string } };
    };
    assert.equal(message.result?.serverInfo?.name, "systemone-mcp");
  } finally {
    child.kill();
    await rm(directory, { recursive: true, force: true });
  }
});
