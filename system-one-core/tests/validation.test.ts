import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { choice, noul, score } from "../src/questions.ts";
import { validateResponse } from "../src/validation.ts";

describe("validation", () => {
  it("accepts a valid mixed response", () => {
    const questions = {
      c: choice("Which?", { a: null, b: null }),
      n: noul("Is it?"),
    };
    const raw = {
      answers: {
        c: {
          type: "choice",
          choice: "a",
          probabilities: { a: 0.8, b: 0.2 },
          confidence: 0.8,
        },
        n: { type: "noul", noul: 0.3 },
      },
    };
    const out = validateResponse(questions, raw, "p");
    assert.equal((out.answers.c as any).choice, "a");
  });
  it("rejects unknown choice, bad probabilities, NaN, missing answers", () => {
    const questions = { c: choice("Which?", { a: null, b: null }) };
    for (const bad of [
      {
        answers: {
          c: {
            type: "choice",
            choice: "zzz",
            probabilities: { a: 0.5, b: 0.5 },
            confidence: 0.5,
          },
        },
      },
      {
        answers: {
          c: {
            type: "choice",
            choice: "a",
            probabilities: { a: 1.5, b: 0 },
            confidence: 0.5,
          },
        },
      },
      {
        answers: {
          c: {
            type: "choice",
            choice: "a",
            probabilities: { a: NaN, b: 0.5 },
            confidence: 0.5,
          },
        },
      },
      { answers: {} },
    ]) {
      assert.throws(() => validateResponse(questions, bad, "p"), /protocol/i);
    }
  });
  it("validates score answers", () => {
    const questions = { s: score("How hard?", ["easy", "hard"]) };
    const raw = {
      answers: {
        s: {
          type: "score",
          score: 1.7,
          probabilities: { easy: 0.3, hard: 0.7 },
          legend: { easy: 0, hard: 1 },
          confidence: 0.8,
        },
      },
    };
    const out = validateResponse(questions, raw, "p");
    assert.equal((out.answers.s as any).score, 1.7);
    assert.throws(
      () =>
        validateResponse(
          questions,
          {
            answers: {
              s: {
                type: "score",
                score: Infinity,
                probabilities: {},
                legend: {},
                confidence: 0.5,
              },
            },
          },
          "p",
        ),
      /protocol/i,
    );
  });
  it("binds score keys to criteria in either convention", () => {
    const questions = { s: score("How hard?", ["easy", "hard"]) };
    const goodIndex = {
      answers: {
        s: {
          type: "score",
          score: 1,
          probabilities: { "0": 0.5, "1": 0.5 },
          legend: { "0": "easy", "1": "hard" },
          confidence: 0.5,
        },
      },
    };
    assert.equal(
      (validateResponse(questions, goodIndex, "p").answers.s as any).score,
      1,
    );
    for (const bad of [
      {
        answers: {
          s: {
            type: "score",
            score: 1,
            probabilities: { "0": 0.5, "9": 0.5 },
            legend: { "0": "easy", "1": "hard" },
            confidence: 0.5,
          },
        },
      },
      {
        answers: {
          s: {
            type: "score",
            score: 1,
            probabilities: { "0": 0.5, "1": 0.5 },
            legend: { "0": "easy" },
            confidence: 0.5,
          },
        },
      },
    ]) {
      assert.throws(() => validateResponse(questions, bad, "p"), /protocol/i);
    }
  });
  it("handles prototype-like question ids as ordinary entries", () => {
    // Computed keys (like JSON-parsed model output) create own "__proto__"
    // entries; a bare literal would set the prototype instead.
    const questions = JSON.parse(
      JSON.stringify({ ["__proto__"]: noul("Is it?") }),
    );
    const raw = JSON.parse(
      JSON.stringify({
        answers: { ["__proto__"]: { type: "noul", noul: 0.5 } },
      }),
    );
    const out = validateResponse(questions, raw, "p");
    assert.ok(Object.hasOwn(out.answers, "__proto__"));
    // biome-ignore lint/suspicious/noProto: reads the own entry to prove it is data, not a reparented prototype.
    assert.equal((out.answers as any).__proto__.noul, 0.5);
    assert.equal(Object.getPrototypeOf(out.answers), Object.prototype);
  });
  it("still reports a missing answer for inherited-only ids", () => {
    const questions = JSON.parse(JSON.stringify({ toString: noul("Is it?") }));
    assert.throws(
      () => validateResponse(questions, { answers: {} }, "p"),
      /missing answer for toString/,
    );
  });
});
