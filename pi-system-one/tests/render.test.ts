// pi-system-one/tests/render.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderSystemOneResult } from "../src/render.ts";

describe("render", () => {
  it("renders mixed answers human-readably with full distributions", () => {
    const text = renderSystemOneResult({
      answers: {
        task: { type: "choice", choice: "coding", probabilities: { coding: 0.91, research: 0.06, writing: 0.03 }, confidence: 0.91 },
        complex: { type: "noul", noul: 0.82 },
        difficulty: { type: "score", score: 1.7, probabilities: { "0": 0.1, "1": 0.2, "2": 0.7 }, legend: { "0": "easy", "1": "medium", "2": "hard" }, confidence: 0.84 },
      },
    } as any);
    assert.match(text, /task:[\s\S]*choice: coding/);
    assert.match(text, /probabilities:[\s\S]*coding: 0\.91/);
    assert.match(text, /complex:[\s\S]*noul: 0\.82/);
    assert.match(text, /difficulty:[\s\S]*score: 1\.7/);
  });
});
