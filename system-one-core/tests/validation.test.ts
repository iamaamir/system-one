import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateResponse } from "../src/validation.ts";
import { choice, noul, score } from "../src/questions.ts";
describe("validation", () => {
  it("accepts a valid mixed response", () => {
    const questions = { c: choice("Which?", { a: null, b: null }), n: noul("Is it?") };
    const raw = { answers: {
      c: { type: "choice", choice: "a", probabilities: { a: 0.8, b: 0.2 }, confidence: 0.8 },
      n: { type: "noul", noul: 0.3 },
    } };
    const out = validateResponse(questions, raw, "p");
    assert.equal((out.answers.c as any).choice, "a");
  });
  it("rejects unknown choice, bad probabilities, NaN, missing answers", () => {
    const questions = { c: choice("Which?", { a: null, b: null }) };
    for (const bad of [
      { answers: { c: { type: "choice", choice: "zzz", probabilities: { a: 0.5, b: 0.5 }, confidence: 0.5 } } },
      { answers: { c: { type: "choice", choice: "a", probabilities: { a: 1.5, b: 0 }, confidence: 0.5 } } },
      { answers: { c: { type: "choice", choice: "a", probabilities: { a: NaN, b: 0.5 }, confidence: 0.5 } } },
      { answers: {} },
    ]) {
      assert.throws(() => validateResponse(questions, bad, "p"), /protocol/i);
    }
  });
  it("validates score answers", () => {
    const questions = { s: score("How hard?", ["easy", "hard"]) };
    const raw = { answers: { s: { type: "score", score: 1.7, probabilities: { easy: 0.3, hard: 0.7 }, legend: { easy: 0, hard: 1 }, confidence: 0.8 } } };
    const out = validateResponse(questions, raw, "p");
    assert.equal((out.answers.s as any).score, 1.7);
    assert.throws(() => validateResponse(questions, { answers: { s: { type: "score", score: Infinity, probabilities: {}, legend: {}, confidence: 0.5 } } }, "p"), /protocol/i);
  });
});
