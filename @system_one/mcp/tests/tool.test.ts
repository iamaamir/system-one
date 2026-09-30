import assert from "node:assert/strict";
import { it } from "node:test";
import { evaluateSystemOne, systemOneInputSchema } from "../src/tool.ts";

it("accepts the canonical mixed request and rejects extra fields", () => {
  const schema = systemOneInputSchema;
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

it("allows constructor and prototype labels but rejects __proto__", async () => {
  const schema = systemOneInputSchema;
  const questionIdRequest = JSON.parse(
    '{"state":"x","questions":{"__proto__":{"type":"noul","instructions":"is it?"}}}',
  ) as unknown;
  const labelRequest = JSON.parse(
    '{"state":"x","questions":{"q":{"type":"choice","instructions":"which?","criteria":{"__proto__":null,"safe":null}}}}',
  ) as unknown;
  assert.throws(
    () => schema.safeParse(questionIdRequest),
    /question id "__proto__" is not allowed/,
  );
  assert.throws(
    () => schema.safeParse(labelRequest),
    /criteria label "__proto__" is not allowed/,
  );
  for (const questionId of ["constructor", "prototype"]) {
    assert.equal(
      schema.safeParse({
        state: "x",
        questions: {
          [questionId]: { type: "noul", instructions: "is it?" },
        },
      }).success,
      true,
    );
  }
  for (const label of ["constructor", "prototype"]) {
    assert.equal(
      schema.safeParse({
        state: "x",
        questions: {
          q: {
            type: "choice",
            instructions: "which?",
            criteria: { [label]: null },
          },
        },
      }).success,
      true,
    );
  }
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
  const schema = systemOneInputSchema;
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
