import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SystemOneResponse } from "system-one-core";
import { renderSystemOneResult } from "../src/render.ts";

describe("System One response renderer", () => {
  it("renders mixed answers without response metadata", () => {
    const response: SystemOneResponse = {
      model: "private-model",
      requestId: "private-request",
      metadata: {
        provider: "private-provider",
        latencyMs: 42,
      },
      answers: {
        color: {
          type: "choice",
          choice: "red",
          confidence: 0.7,
          probabilities: {
            red: 0.7,
            blue: 0.3,
          },
        },
        blocked: {
          type: "noul",
          noul: 0.2,
        },
        quality: {
          type: "score",
          score: 0.8,
          confidence: 0.8,
          probabilities: {
            low: 0.2,
            high: 0.8,
          },
          legend: {
            low: "Low quality",
            high: "High quality",
          },
        },
        impact: {
          type: "score",
          score: 0.7,
          confidence: 0.7,
          probabilities: {
            "0": 0.1,
            "1": 0.7,
            "2": 0.2,
          },
          legend: {
            "0": "minor",
            "1": { label: "degraded" },
            "2": "blocking",
          },
        },
      },
    };

    const output = renderSystemOneResult(response);

    assert.equal(
      output,
      [
        "System One result",
        "",
        "color:",
        "  choice: red",
        "  confidence: 0.7",
        "  probabilities:",
        "    red: 0.7",
        "    blue: 0.3",
        "",
        "blocked:",
        "  noul: 0.2",
        "",
        "quality:",
        "  score: 0.8",
        "  confidence: 0.8",
        "  probabilities:",
        "    low: 0.2",
        "    high: 0.8",
        "  legend:",
        '    low: "Low quality"',
        '    high: "High quality"',
        "",
        "impact:",
        "  score: 0.7",
        "  confidence: 0.7",
        "  probabilities:",
        "    0: 0.1",
        "    1: 0.7",
        "    2: 0.2",
        "  legend:",
        '    0: "minor"',
        '    1: {"label":"degraded"}',
        '    2: "blocking"',
      ].join("\n"),
    );
    assert.doesNotMatch(
      output,
      /private-model|private-request|private-provider|42/,
    );
  });

  it("renders numeric score slots with their rubric legend", () => {
    const output = renderSystemOneResult({
      metadata: { provider: "test" },
      answers: {
        impact: {
          type: "score",
          score: 0.7,
          confidence: 0.7,
          probabilities: { "0": 0.1, "1": 0.7, "2": 0.2 },
          legend: { "0": "minor", "1": "degraded", "2": "blocking" },
        },
      },
    });

    assert.match(
      output,
      /probabilities:\n {4}0: 0.1\n {4}1: 0.7\n {4}2: 0.2\n {2}legend:\n {4}0: "minor"\n {4}1: "degraded"\n {4}2: "blocking"/,
    );
  });
});
