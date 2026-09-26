import assert from "node:assert/strict";
import { it } from "node:test";
import { z } from "zod";
import { systemOneInputSchema } from "../src/tool.ts";

it("accepts the canonical mixed request and rejects extra fields", () => {
  const schema = z.object(systemOneInputSchema).strict();
  assert.equal(
    schema.safeParse({
      state: { diff: "x" },
      questions: {
        team: {
          type: "choice",
          instructions: "owner?",
          criteria: { frontend: null, backend: null },
        },
        blocked: { type: "noul", instructions: "blocked?" },
        severity: {
          type: "score",
          instructions: "severity?",
          criteria: ["minor", "blocking"],
        },
      },
    }).success,
    true,
  );
  assert.equal(
    schema.safeParse({ state: "x", questions: {}, extra: true }).success,
    false,
  );
});
