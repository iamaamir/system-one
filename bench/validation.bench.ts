// Focused validation benchmark: Set-vs-Array membership lookups in
// validateResponse(), measured per path and size on the REAL production
// validation logic. Run against this tree, then against the v1.2.0
// baseline tree (see bench/README.md) with the same file:
//   node --expose-gc --experimental-strip-types bench/validation.bench.ts

import { choice, noul, score } from "../system-one-core/src/questions.ts";
import { validateResponse } from "../system-one-core/src/validation.ts";
import { benchHeader, fmtTiming, measure } from "./harness.ts";

function choiceFixture(n: number) {
  const criteria: Record<string, null> = {};
  const probabilities: Record<string, number> = {};
  for (let i = 0; i < n; i += 1) {
    const key = `option_${i}`;
    Object.defineProperty(criteria, key, {
      value: null,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(probabilities, key, {
      value: i === 0 ? 0.9 : 0.1 / (n - 1),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return {
    questions: { q: choice("Pick?", criteria) },
    raw: {
      answers: {
        q: {
          type: "choice",
          choice: "option_0",
          probabilities,
          confidence: 0.8,
        },
      },
    },
  };
}

function scoreFixture(n: number) {
  const criteria: string[] = [];
  const probabilities: Record<string, number> = {};
  const legend: Record<string, string> = {};
  for (let i = 0; i < n; i += 1) {
    criteria.push(`level_${i}`);
    probabilities[String(i)] = i === 0 ? 0.9 : 0.1 / (n - 1);
    legend[String(i)] = `level_${i}`;
  }
  return {
    questions: { q: score("Rate?", criteria) },
    raw: {
      answers: {
        q: {
          type: "score",
          score: 0.5,
          probabilities,
          legend,
          confidence: 0.8,
        },
      },
    },
  };
}

function benchCase(
  path: string,
  size: number,
  fixture: () => { questions: never; raw: unknown },
): void {
  const { questions, raw } = fixture();
  // Sanity: the fixture must validate before timing.
  const once = validateResponse(questions, raw, "bench");
  if (!once.answers) throw new Error(`invalid fixture ${path}/${size}`);
  const t = measure(
    () => void JSON.stringify(validateResponse(questions, raw, "bench")),
    size >= 50 ? 10_000 : 50_000,
  );
  console.log(
    `${path.padEnd(7)} size ${String(size).padStart(3)} ${fmtTiming(t)}`,
  );
}

benchHeader("validateResponse (real production path, result stringified)");
for (const n of [3, 10, 50, 255])
  benchCase("choice", n, () => choiceFixture(n));
for (const n of [3, 10, 50, 255]) benchCase("score", n, () => scoreFixture(n));
// A mixed multi-question response, representative of real batches.
{
  const c = choiceFixture(5);
  const s = scoreFixture(5);
  const questions = {
    c: c.questions.q,
    s: s.questions.q,
    n: noul("Ready?"),
  } as never;
  const raw = {
    answers: {
      c: c.raw.answers.q,
      s: s.raw.answers.q,
      n: { type: "noul", noul: 0.6 },
    },
  };
  const t = measure(
    () => void JSON.stringify(validateResponse(questions, raw, "bench")),
    50_000,
  );
  console.log(`mixed   batch-of-3 ${fmtTiming(t)}`);
}
