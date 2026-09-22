import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { choice, noul, score } from "../src/questions.ts";

describe("builders", () => {
  it("builds typed choice/noul/score questions", () => {
    const q = choice("Which?", { coding: "impl", research: null });
    assert.equal(q.type, "choice");
    assert.deepEqual(Object.keys(q.criteria), ["coding", "research"]);
    assert.equal(noul("Is it hard?").type, "noul");
    assert.equal(score("How hard?", ["easy", "hard"]).type, "score");
  });
  it("infers choice keys", () => {
    const q = choice("Which?", { a: null, b: null } as const);
    const k: keyof typeof q.criteria = "a";
    assert.equal(k, "a");
    const q2 = choice("Which?", { a: null, b: null });
    const probe: "a" | "b" = "a" as keyof typeof q2.criteria;
    assert.equal(probe, "a");
    assert.deepEqual(Object.keys(q2.criteria).sort(), ["a", "b"]);
    // @ts-expect-error - "c" is not a valid choice key
    const _bad: keyof typeof q2.criteria = "c";
    void _bad;
  });
  it("narrows score tuple", () => {
    const s = score("How?", ["easy", "hard"]);
    const first: "easy" = s.criteria[0];
    assert.equal(first, "easy");
    // @ts-expect-error - "nope" is not in the tuple
    const _wrong: (typeof s.criteria)[number] = "nope";
    void _wrong;
  });
});
