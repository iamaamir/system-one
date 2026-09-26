import assert from "node:assert/strict";
import { it } from "node:test";
import { z } from "zod";
import { evaluateSystemOne, systemOneInputSchema } from "../src/tool.ts";

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

it("rejects prototype-shaped question ids and criteria labels without dropping them", async () => {
  const schema = z.object(systemOneInputSchema).strict();
  const questionIdRequest = JSON.parse(
    '{"state":"x","questions":{"__proto__":{"type":"noul","instructions":"is it?"}}}',
  ) as unknown;
  const labelRequest = JSON.parse(
    '{"state":"x","questions":{"q":{"type":"choice","instructions":"which?","criteria":{"__proto__":null,"safe":null}}}}',
  ) as unknown;
  assert.equal(schema.safeParse(questionIdRequest).success, false);
  assert.equal(schema.safeParse(labelRequest).success, false);
  await assert.rejects(
    evaluateSystemOne(questionIdRequest),
    /question id "__proto__" is not allowed/,
  );
  await assert.rejects(
    evaluateSystemOne(labelRequest),
    /criteria label "__proto__" is not allowed/,
  );
});

it("accepts JSON object and array instructions", () => {
  const schema = z.object(systemOneInputSchema).strict();
  assert.equal(
    schema.safeParse({
      state: "x",
      questions: {
        object: { type: "noul", instructions: { prompt: "blocked?" } },
        array: {
          type: "score",
          instructions: ["rate", { field: "severity" }],
          criteria: ["low", "high"],
        },
      },
    }).success,
    true,
  );
});
