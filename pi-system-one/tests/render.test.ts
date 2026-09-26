// pi-system-one/tests/render.test.ts

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderSystemOneResult } from "../src/render.ts";

describe("render", () => {
  it("renders mixed answers human-readably with full distributions", () => {
    const text = renderSystemOneResult({
      answers: {
        task: {
          type: "choice",
          choice: "coding",
          probabilities: { coding: 0.91, research: 0.06, writing: 0.03 },
          confidence: 0.91,
        },
        complex: { type: "noul", noul: 0.82 },
        difficulty: {
          type: "score",
          score: 1.7,
          probabilities: { "0": 0.1, "1": 0.2, "2": 0.7 },
          legend: { "0": "easy", "1": "medium", "2": "hard" },
          confidence: 0.84,
        },
      },
    } as any);
    assert.match(text, /task:[\s\S]*choice: coding/);
    assert.match(text, /probabilities:[\s\S]*coding: 0\.91/);
    assert.match(text, /complex:[\s\S]*noul: 0\.82/);
    assert.match(text, /difficulty:[\s\S]*score: 1\.7/);
    // The legend is the whole point: on the index-slot convention a bare
    // `0: 0.1` names no level, so it must render as `0 easy`.
    assert.match(text, /0 easy: 0\.1/);
    assert.match(text, /1 medium: 0\.2/);
    assert.match(text, /2 hard: 0\.7/);
    assert.match(text, /position on the 0\.\.2 rubric scale/);
  });

  it("does not duplicate a self-describing probability key", () => {
    // The contract also allows keys to be the level values themselves, in
    // which case the key already names the level and needs no legend.
    const text = renderSystemOneResult({
      answers: {
        difficulty: {
          type: "score",
          score: 0.4,
          probabilities: { easy: 0.6, hard: 0.4 },
          legend: { easy: "easy", hard: "hard" },
          confidence: 0.8,
        },
      },
    } as any);
    assert.match(text, /easy: 0\.6/);
    assert.doesNotMatch(text, /easy easy/);
  });

  it("still renders a slot key when the legend has no entry for it", () => {
    const text = renderSystemOneResult({
      answers: {
        difficulty: {
          type: "score",
          score: 1,
          probabilities: { "0": 0.5, "1": 0.5 },
          confidence: 0.5,
        },
      },
    } as any);
    assert.match(text, /0: 0\.5/);
  });

  it("states the reading rules once, for the whole result", () => {
    const text = renderSystemOneResult({
      answers: { a: { type: "noul", noul: 0.5 } },
    } as any);
    assert.match(text, /noul is P\(yes\)/);
    assert.match(text, /choice always returns a winner/);
    assert.match(text, /not permission to act/);
  });
  it("renders score probabilities and flags unknown types", () => {
    const text = renderSystemOneResult({
      answers: {
        difficulty: {
          type: "score",
          score: 1.7,
          probabilities: { "0": 0.1, "2": 0.7 },
          confidence: 0.84,
        },
        weird: { type: "mystery", value: 1 },
      },
    } as any);
    assert.match(text, /difficulty:[\s\S]*0: 0\.1/);
    assert.match(text, /weird:[\s\S]*unknown answer type: mystery/);
  });
});
