import assert from "node:assert/strict";
import { it } from "node:test";
import { renderSystemOneResult } from "../src/render.ts";

it("renders all answer types and score legends", () => {
  const text = renderSystemOneResult({
    answers: {
      team: {
        type: "choice",
        choice: "frontend",
        confidence: 0.8,
        probabilities: { frontend: 0.8 },
      },
      blocked: { type: "noul", noul: 0.2 },
      severity: {
        type: "score",
        score: 1,
        confidence: 0.7,
        probabilities: { "0": 0.2, "1": 0.8 },
        legend: { "0": "minor", "1": "blocking" },
      },
    },
  });
  assert.match(text, /choice: frontend/);
  assert.match(text, /noul: 0.2 \(P\(yes\)\)/);
  assert.match(text, /1 blocking: 0.8/);
  assert.match(text, /choice always returns a winner/);
  assert.match(text, /poor fit/);
  assert.match(text, /not permission to act/);
});
