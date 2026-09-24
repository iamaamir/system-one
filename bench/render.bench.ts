// Phase 3 baseline: renderSystemOneResult() output sizes.
// Also evaluates the compact single-line candidate from the PR brief.
// Run: node --experimental-strip-types bench/render.bench.ts
// biome-ignore-all lint/suspicious/noExplicitAny: bench mirrors render.ts's dynamic answer boundary

import { renderSystemOneResult } from "../pi-system-one/src/render.ts";
import { benchHeader, fmtTiming, measure } from "./harness.ts";

function choiceAnswer(n: number): Record<
  string,
  {
    type: string;
    choice: string;
    confidence: number;
    probabilities: Record<string, number>;
  }
> {
  const probabilities: Record<string, number> = {};
  for (let i = 0; i < n; i += 1) {
    Object.defineProperty(probabilities, `option_${i}`, {
      value: i === 0 ? 0.9 : 0.1 / (n - 1),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return {
    q: { type: "choice", choice: "option_0", confidence: 0.77, probabilities },
  };
}

const scoreAnswer = {
  risk: {
    type: "score",
    score: 2.1,
    confidence: 0.76,
    probabilities: {
      "very low": 0.01,
      low: 0.09,
      moderate: 0.8,
      high: 0.09,
      "very high": 0.01,
    },
    legend: {
      "0": "very low",
      "1": "low",
      "2": "moderate",
      "3": "high",
      "4": "very high",
    },
  },
};

const multiAnswer = {
  release_action: {
    type: "choice",
    choice: "release_as_prerelease",
    confidence: 0.77,
    probabilities: {
      release_normally: 0.13,
      release_as_prerelease: 0.85,
      hold_release: 0.02,
    },
  },
  production_ready: { type: "noul", noul: 0.61 },
  risk_rating: {
    type: "score",
    score: 2.1,
    confidence: 0.76,
    probabilities: {
      "very low": 0.01,
      low: 0.09,
      moderate: 0.8,
      high: 0.09,
      "very high": 0.01,
    },
    legend: {
      "0": "very low",
      "1": "low",
      "2": "moderate",
      "3": "high",
      "4": "very high",
    },
  },
};

/** Compact single-line candidate from the PR brief (evaluation only). */
function renderCompact(response: { answers: Record<string, any> }): string {
  const lines: string[] = [];
  for (const [id, a] of Object.entries(response.answers)) {
    if (a?.type === "choice") {
      lines.push(
        `${id}: choice=${a.choice} confidence=${a.confidence} probabilities=${JSON.stringify(a.probabilities ?? {})}`,
      );
    } else if (a?.type === "noul") {
      lines.push(`${id}: noul=${a.noul}`);
    } else if (a?.type === "score") {
      lines.push(
        `${id}: score=${a.score} confidence=${a.confidence} probabilities=${JSON.stringify(a.probabilities ?? {})}`,
      );
    } else {
      lines.push(`${id}: unknown answer type: ${a?.type ?? "missing"}`);
    }
  }
  return lines.join("\n");
}

benchHeader("renderSystemOneResult sizes");
const cases: Array<[string, Record<string, any>]> = [
  ["choice/3", choiceAnswer(3)],
  ["choice/50", choiceAnswer(50)],
  ["choice/255", choiceAnswer(255)],
  ["score/5", scoreAnswer],
  ["multi(choice+noul+score)", multiAnswer],
];
for (const [name, answers] of cases) {
  const current = renderSystemOneResult({ answers });
  const compact = renderCompact({ answers });
  const t = measure(() => void renderSystemOneResult({ answers }), 20_000);
  console.log(
    `${name.padEnd(24)} current ${current.length} chars / ${Buffer.byteLength(current)}B` +
      ` | compact ${compact.length} chars (${((1 - compact.length / current.length) * 100).toFixed(0)}% smaller)` +
      ` | render ${fmtTiming(t)}`,
  );
}
console.log("\n--- current multi-question output ---");
console.log(renderSystemOneResult({ answers: multiAnswer }));
console.log("\n--- compact candidate ---");
console.log(renderCompact({ answers: multiAnswer }));
