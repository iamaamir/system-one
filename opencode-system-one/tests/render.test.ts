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
      ].join("\n"),
    );
    assert.doesNotMatch(
      output,
      /private-model|private-request|private-provider|42/,
    );
  });
});
