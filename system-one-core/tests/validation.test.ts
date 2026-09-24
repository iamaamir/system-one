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
          score: 0.7,
          probabilities: { easy: 0.3, hard: 0.7 },
          legend: { easy: 0, hard: 1 },
          confidence: 0.8,
        },
      },
    };
    const out = validateResponse(questions, raw, "p");
    assert.equal((out.answers.s as any).score, 0.7);
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
  it("rejects empty score probabilities with a complete legend", () => {
    const questions = { risk: score("Risk?", ["low", "high"]) };
    assert.throws(
      () =>
        validateResponse(
          questions,
          {
            answers: {
              risk: {
                type: "score",
                score: 1,
                confidence: 0.8,
                legend: { "0": "low", "1": "high" },
                probabilities: {},
              },
            },
          },
          "p",
        ),
      /score answer "risk" is missing probability for rubric level "0"/,
    );
  });
  it("rejects a missing rubric level in score probabilities", () => {
    const questions = { risk: score("Risk?", ["low", "med", "high"]) };
    assert.throws(
      () =>
        validateResponse(
          questions,
          {
            answers: {
              risk: {
                type: "score",
                score: 1,
                confidence: 0.8,
                legend: { "0": "low", "1": "med", "2": "high" },
                probabilities: { "0": 0.4, "1": 0.6 },
              },
            },
          },
          "p",
        ),
      /score answer "risk" is missing probability for rubric level "2"/,
    );
  });
  it("rejects an unexpected score probability key", () => {
    const questions = { risk: score("Risk?", ["low", "med", "high"]) };
    assert.throws(
      () =>
        validateResponse(
          questions,
          {
            answers: {
              risk: {
                type: "score",
                score: 1,
                confidence: 0.8,
                legend: { "0": "low", "1": "med", "2": "high" },
                probabilities: { "0": 0.3, "1": 0.4, "2": 0.2, "99": 0.1 },
              },
            },
          },
          "p",
        ),
      /score answer "risk" contains unexpected probability key "99"/,
    );
  });
  it("rejects scores outside the rubric range", () => {
    const questions = { risk: score("Risk?", ["low", "med", "high"]) };
    for (const badScore of [-0.1, 2.1, 92.7]) {
      assert.throws(
        () =>
          validateResponse(
            questions,
            {
              answers: {
                risk: {
                  type: "score",
                  score: badScore,
                  confidence: 0.8,
                  legend: { "0": "low", "1": "med", "2": "high" },
                  probabilities: { "0": 0.3, "1": 0.4, "2": 0.3 },
                },
              },
            },
            "p",
          ),
        new RegExp(
          `score answer "risk" has score ${badScore} outside valid rubric range 0\\.\\.2`,
        ),
      );
    }
  });
  it("rejects invalid score probabilities", () => {
    const questions = { risk: score("Risk?", ["low", "high"]) };
    for (const badProb of [NaN, Infinity, -0.1, 1.1, "0.5", null]) {
      assert.throws(
        () =>
          validateResponse(
            questions,
            {
              answers: {
                risk: {
                  type: "score",
                  score: 1,
                  confidence: 0.8,
                  legend: { "0": "low", "1": "high" },
                  probabilities: { "0": badProb, "1": 0.5 },
                },
              },
            },
            "p",
          ),
        /protocol/i,
      );
    }
  });
  it("rejects mismatched score legend entries", () => {
    const questions = { risk: score("Risk?", ["low", "med", "high"]) };
    const probs = { "0": 0.3, "1": 0.4, "2": 0.3 };
    assert.throws(
      () =>
        validateResponse(
          questions,
          {
            answers: {
              risk: {
                type: "score",
                score: 1,
                confidence: 0.8,
                legend: { "0": "low", "1": "med" },
                probabilities: probs,
              },
            },
          },
          "p",
        ),
      /score answer "risk" is missing legend entry for rubric level "2"/,
    );
    assert.throws(
      () =>
        validateResponse(
          questions,
          {
            answers: {
              risk: {
                type: "score",
                score: 1,
                confidence: 0.8,
                legend: { "0": "low", "1": "med", "2": "high", "9": "?" },
                probabilities: probs,
              },
            },
          },
          "p",
        ),
      /score answer "risk" contains unexpected legend key "9"/,
    );
  });
  it("accepts complete score distributions in either convention", () => {
    const questions = { risk: score("Risk?", ["low", "med", "high"]) };
    const indexRaw = {
      answers: {
        risk: {
          type: "score",
          score: 1.7,
          confidence: 0.8,
          legend: { "0": "low", "1": "med", "2": "high" },
          probabilities: { "0": 0.1, "1": 0.2, "2": 0.7 },
        },
      },
    };
    assert.equal(
      (validateResponse(questions, indexRaw, "p").answers.risk as any).score,
      1.7,
    );
    const labelRaw = {
      answers: {
        risk: {
          type: "score",
          score: 0.4,
          confidence: 0.8,
          legend: { low: 0, med: 1, high: 2 },
          probabilities: { low: 0.7, med: 0.2, high: 0.1 },
        },
      },
    };
    assert.equal(
      (validateResponse(questions, labelRaw, "p").answers.risk as any).score,
      0.4,
    );
  });
  it("rejects array containers for score probabilities and legend", () => {
    const questions = { risk: score("Risk?", ["low", "high"]) };
    assert.throws(
      () =>
        validateResponse(
          questions,
          {
            answers: {
              risk: {
                type: "score",
                score: 0.6,
                confidence: 0.8,
                probabilities: [0.4, 0.6],
                legend: { "0": "low", "1": "high" },
              },
            },
          },
          "p",
        ),
      /score answer "risk" probabilities must be an object map/,
    );
    assert.throws(
      () =>
        validateResponse(
          questions,
          {
            answers: {
              risk: {
                type: "score",
                score: 0.6,
                confidence: 0.8,
                probabilities: { "0": 0.4, "1": 0.6 },
                legend: ["low", "high"],
              },
            },
          },
          "p",
        ),
      /score answer "risk" legend must be an object map/,
    );
    assert.throws(
      () =>
        validateResponse(
          questions,
          {
            answers: {
              risk: {
                type: "score",
                score: 0.6,
                confidence: 0.8,
                probabilities: [0.4, 0.6],
                legend: ["low", "high"],
              },
            },
          },
          "p",
        ),
      /score answer "risk" (probabilities|legend) must be an object map/,
    );
  });
  it("keeps prototype-like score keys on own-property semantics", () => {
    const questions = JSON.parse(
      JSON.stringify({ s: score("Risk?", ["__proto__", "safe"]) }),
    );
    const raw = JSON.parse(
      JSON.stringify({
        answers: {
          s: {
            type: "score",
            score: 0,
            confidence: 0.8,
            legend: { ["__proto__"]: "weird", safe: "ok" },
            probabilities: { ["__proto__"]: 0.6, safe: 0.4 },
          },
        },
      }),
    );
    const out = validateResponse(questions, raw, "p");
    assert.equal((out.answers.s as any).score, 0);
    assert.equal(Object.getPrototypeOf(out.answers), Object.prototype);
    // A prototype-named key outside the rubric still fails closed.
    const evil = JSON.parse(
      JSON.stringify({
        answers: {
          s: {
            type: "score",
            score: 0,
            confidence: 0.8,
            legend: { "0": "weird", "1": "ok" },
            probabilities: { "0": 0.6, "1": 0.3, constructor: 0.1 },
          },
        },
      }),
    );
    assert.throws(
      () => validateResponse(questions, evil, "p"),
      /contains unexpected probability key "constructor"/,
    );
  });
});
