// Regression: real TypeSafe Jev response shapes must always validate.
// Fixtures captured 2026-09-22 with model jev-latest (resolved jev-1.13.0). No secrets in fixtures.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateResponse } from "../src/validation.ts";
import type { QuestionMap } from "../src/questions.ts";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("."));

describe("typesafe fixtures", () => {
  for (const f of files) {
    it(`${f} validates with normalized usage`, () => {
      const fx = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const out = validateResponse(fx.request.questions as QuestionMap, fx.response, "provider");
      assert.deepEqual(Object.keys(out.answers).sort(), Object.keys(fx.request.questions).sort());
      assert.ok(typeof out.model === "string" && out.model.length > 0, "model reported");
      assert.ok(out.usage?.inputTokens! > 0, "inputTokens normalized from input_tokens");
      assert.ok(out.usage?.outputTokens! >= 0, "outputTokens present");
      assert.ok(!("input_tokens" in (out.usage ?? {})), "no snake_case leak");
    });
  }
  it("score fixture keeps index-keyed probabilities + legend", () => {
    const fx = JSON.parse(readFileSync(join(dir, "typesafe-score-rubric.json"), "utf8"));
    const out = validateResponse(fx.request.questions as QuestionMap, fx.response, "typesafe");
    const c: any = (out.answers as any).complexity;
    assert.equal(c.legend["2"], "Complex");
    assert.ok(c.probabilities["2"] > 0.5);
  });
});
