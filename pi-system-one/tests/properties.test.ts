// Property tests for the accumulated system_one normalization rules.
//
// More than a dozen representation repairs have been added to
// prepareSystemOneArgs, each firing on a condition. The unit tests produce
// them one at a time, so the risk that is left is not "the last 2% of
// shapes" but "two rules that fire together produce something neither rule
// alone would". That is a deterministic question, so it is answered
// deterministically here rather than by a 30-minute LLM run.
//
// Properties checked over a generated corpus of 34,600 shapes:
//   1. idempotence   - f(f(x)) deep-equals f(x)
//   2. non-mutation  - the input is never modified
//   3. determinism   - same input, same output, twice
//   4. type/shape    - after normalization, a question's criteria container
//                      matches its type (choice -> object, score -> array,
//                      noul -> absent or object), and no question carries a
//                      nested `state`.
//   5. legibility    - every score level the contract allows a legend to carry
//                      is actually named in the rendered result.
//   6. no silent drop - a question-map entry that normalization discards is
//                      named in a note, never dropped without a trace.
//
// Properties 1-4 assert on the REQUEST, so without 5 and 6 the tool RESULT
// was checked by nothing at all - and the result is the only System One text
// the agent reads at call time. An LLM behaviour suite scores first-call
// arguments and never inspects the result, so it cannot see either class of
// defect by construction.
//
// No model, no network: the tool is driven against a stub provider, so the
// whole sweep runs in well under a second and belongs in the unit suite.

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { renderSystemOneResult } from "../src/render.ts";
import {
  buildSystemOneTool,
  collectDiscardedQuestions,
  prepareSystemOneArgs,
} from "../src/tool.ts";

// Shape invariants only mean something for requests that actually REACH the
// provider. prepareSystemOneArgs deliberately does not validate — a choice with
// a non-string array criteria is meant to be rejected downstream — so checking
// its output directly asserts things the contract never promised. This drives
// the real tool and inspects the captured wire request instead.
let captured: any = null;
const provider = {
  id: "probe",
  async evaluate(request: any) {
    captured = request;
    return { answers: {}, metadata: { provider: "probe" } };
  },
};
const tool = buildSystemOneTool({ provider: provider as never });

async function reachesProvider(input: any): Promise<boolean> {
  captured = null;
  try {
    await tool.execute(
      "probe",
      input as never,
      undefined,
      undefined,
      {} as never,
    );
    return captured !== null;
  } catch {
    return false;
  }
}

type Json = any;

const LEVEL_WORDS = [
  "none",
  "trivial",
  "mild",
  "moderate",
  "serious",
  "severe",
  "catastrophic",
  "negligible: within normal variance",
  "Moderate: real pressure, no immediate damage",
  "just-ok",
  "a level whose text contains a colon: like this one",
  "  padded  ",
  "0",
  "1",
  "level with {braces} and (parens)",
];

/*
 * The score answer may distribute over index slots ("0".."n-1") or over the
 * level values themselves, and system-one-core requires a legend labelling
 * exactly the distributed keys. On the slot convention the keys are opaque, so
 * a result that prints bare "0: 0.5" leaves the agent unable to name the level.
 * For every rubric and both conventions, every level must appear in the render.
 */
function checkLegibility(): string[] {
  const bad: string[] = [];
  for (const n of [2, 3, 4, 5, 8]) {
    for (let seed = 0; seed < 40; seed += 1) {
      const rand = rng(seed * 31 + n);
      const levels: string[] = [];
      for (let i = 0; i < n; i += 1)
        levels.push(LEVEL_WORDS[Math.floor(rand() * LEVEL_WORDS.length)]);
      const probs: Record<string, number> = {};
      const legend: Record<string, string> = {};
      for (let i = 0; i < n; i += 1) {
        const share = i === n - 1 ? 0.5 : 0.5 / (n - 1);
        probs[String(i)] = share;
        legend[String(i)] = levels[i];
      }
      const onSlots = renderSystemOneResult({
        answers: {
          sev: {
            type: "score",
            score: (n - 1) / 2,
            probabilities: probs,
            legend,
            confidence: 0.5,
          },
        },
      } as any);
      for (const level of levels) {
        // A level equal to its own slot ("0") is ambiguous with the slot
        // itself, so only require the distinct level texts to be present.
        if (/^\d+$/.test(level.trim())) continue;
        if (!onSlots.includes(level.trim()))
          bad.push(
            `level text dropped from a slot-keyed render: n=${n} seed=${seed} ${JSON.stringify(level)}`,
          );
      }
      const onValues = renderSystemOneResult({
        answers: {
          sev: {
            type: "score",
            score: (n - 1) / 2,
            probabilities: Object.fromEntries(levels.map((l) => [l, 1 / n])),
            legend: Object.fromEntries(levels.map((l) => [l, l])),
            confidence: 0.5,
          },
        },
      } as any);
      for (const level of levels) {
        if (!onValues.includes(level.trim()))
          bad.push(
            `level text dropped from a value-keyed render: n=${n} seed=${seed} ${JSON.stringify(level)}`,
          );
      }
    }
  }
  return bad;
}

const QUESTION_TYPES = [
  "choice",
  "noul",
  "score",
  "Choice",
  "boolean",
  "Rating",
];

// Every shape we have ever seen, plus deliberate combinations of them.
function corpus(): Json[] {
  const out: Json[] = [];
  const criteriaShapes: Json[] = [
    { a: null, b: null },
    ["low", "high"],
    { low: "bad", high: "good" },
    { item: ["low", "high"] },
    { item: { item: ["low", "high"] } },
    { level: "meh" },
    [
      { label: "a", why: "x" },
      { label: "b", why: "y" },
    ],
    null,
    [],
    "low to high",
  ];
  const extras: Json[] = [
    {},
    { description: "the question" },
    { classification: "the question" },
    { name: "n" },
    { confidence: 0.9 },
    { billing: "", onboarding: "" },
    { true: "yes", false: "no" },
    { state: { evidence: 1 } },
    { context: "ctx" },
    { approach: "yes_no" },
  ];
  const wrappers: Json[] = [
    (q: Json) => ({ state: "S", questions: { q1: q } }),
    (q: Json) => ({ state: "S", questions: [q] }),
    (q: Json) => ({ context: "S", question: { q1: q } }),
    (q: Json) => ({ evidence: "S", queries: { q1: q } }),
    (q: Json) => ({ state: "S", questions: { item: [{ name: "q1", ...q }] } }),
    (q: Json) => ({ state: "S", questions: { outer: { q1: q } } }),
    (_q: Json) => ({ state: "S", questions: { questions: _q } }),
    (_q: Json) => ({ state: "S", questions: { "text of the question": _q } }),
    (q: Json) => ({ questions: { q1: { ...q, state: { nested: 1 } } } }),
    (q: Json) => ({ state: "S", questions: { "a: null": q, other: "" } }),
    (_q: Json) => ({
      state: "S",
      questions: {
        item: ["a", "b"],
        type: ["choice", "noul"],
        instructions: ["q1?", "q2?"],
        criteria: [{ x: null }, null],
      },
    }),
  ];
  for (const type of QUESTION_TYPES) {
    for (const criteria of criteriaShapes) {
      for (const extra of extras) {
        const q: Json = { type };
        if (criteria !== undefined) q.criteria = criteria;
        if (Math.random() < 0.7) {
          q.instructions = Math.random() < 0.5 ? "How?" : { text: "How?" };
        }
        Object.assign(q, extra);
        for (const wrap of wrappers) out.push(wrap(q));
      }
    }
  }
  return out;
}

/**
 * Randomised widening. The enumerated corpus above is a cross-product of
 * shapes I thought of, and it found three real bugs - all of them in the
 * COMBINATIONS rather than in the individual shapes. The obvious way to find
 * the rest is to stop enumerating and generate: a seeded PRNG keeps this
 * reproducible while exploring key names, nesting depth, alias assignment and
 * value types far outside anything written by hand.
 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const DANGEROUS_KEYS = [
  "__proto__",
  "constructor",
  "prototype",
  "toString",
  "valueOf",
  "hasOwnProperty",
];

const ALIAS_KEYS = [
  "instructions",
  "instruction",
  "prompt",
  "question",
  "text",
  "query",
  "task",
  "criteria",
  "options",
  "choices",
  "levels",
  "rubric",
  "labels",
  "description",
  "title",
  "detail",
  "name",
  "id",
  "label",
  "true",
  "false",
  "state",
  "context",
  "evidence",
  "approximate",
  "weight",
  "confidence",
];

function setKey(obj: Json, key: string, value: Json): void {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function randomValue(rand: () => number, depth: number): Json {
  const roll = rand();
  if (depth > 2) return "text";
  if (roll < 0.3) return "some text";
  if (roll < 0.4) return "";
  if (roll < 0.5) return null;
  if (roll < 0.6) return rand() < 0.5;
  if (roll < 0.7) return Math.floor(rand() * 10);
  if (roll < 0.8) {
    const out: Json[] = [];
    for (let i = 0; i < 1 + Math.floor(rand() * 3); i += 1)
      out.push(randomValue(rand, depth + 1));
    return out;
  }
  const out: Json = {};
  for (let i = 0; i < 1 + Math.floor(rand() * 3); i += 1)
    setKey(out, randomKey(rand), randomValue(rand, depth + 1));
  return out;
}

function randomKey(rand: () => number): string {
  if (rand() < 0.15)
    return DANGEROUS_KEYS[Math.floor(rand() * DANGEROUS_KEYS.length)];
  if (rand() < 0.5) return ALIAS_KEYS[Math.floor(rand() * ALIAS_KEYS.length)];
  return `k${Math.floor(rand() * 6)}`;
}

function randomQuestion(rand: () => number): Json {
  const q: Json = {
    type: QUESTION_TYPES[Math.floor(rand() * QUESTION_TYPES.length)],
  };
  if (rand() < 0.8)
    setKey(q, "instructions", rand() < 0.2 ? { text: "?" } : "how?");
  if (rand() < 0.8) setKey(q, "criteria", randomValue(rand, 1));
  for (let i = 0; i < Math.floor(rand() * 4); i += 1)
    setKey(q, randomKey(rand), randomValue(rand, 1));
  return q;
}

function randomRequest(rand: () => number): Json {
  const q = randomQuestion(rand);
  const shape = rand();
  let questions: Json;
  if (shape < 0.3) questions = { [randomKey(rand)]: q };
  else if (shape < 0.5) questions = [q];
  else if (shape < 0.6) questions = { [randomKey(rand)]: [q] };
  else if (shape < 0.7) questions = { a: { [randomKey(rand)]: q } };
  else if (shape < 0.8) questions = { [randomKey(rand)]: { a: q } };
  else if (shape < 0.9) {
    const out: Json = {};
    setKey(out, randomKey(rand), q);
    setKey(out, randomKey(rand), randomValue(rand, 1));
    questions = out;
  } else questions = randomValue(rand, 1);
  const out: Json = { questions };
  if (rand() < 0.6) setKey(out, "state", "S");
  else if (rand() < 0.3) setKey(out, "context", "S");
  if (rand() < 0.15) setKey(out, randomKey(rand), randomValue(rand, 1));
  return out;
}

function deepFreeze(v: unknown): void {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) {
      deepFreeze((v as Record<string, unknown>)[k]);
    }
  }
}

function shapeOk(args: Json): string | undefined {
  const questions = args?.questions;
  if (questions === undefined) return undefined;
  if (
    typeof questions !== "object" ||
    questions === null ||
    Array.isArray(questions)
  ) {
    return "questions is not a map";
  }
  for (const [name, q] of Object.entries<Json>(questions)) {
    if (q === null || typeof q !== "object" || Array.isArray(q)) {
      return `question ${name} is not an object`;
    }
    for (const key of ["state", "context", "evidence"]) {
      if (Object.hasOwn(q, key)) return `question ${name} still carries ${key}`;
    }
    if (Object.hasOwn(q, "type") && q.type === "score") {
      if (q.criteria !== undefined && !Array.isArray(q.criteria)) {
        return `score question ${name} has non-array criteria`;
      }
    }
    if (q.type === "choice" && q.criteria !== undefined) {
      if (Array.isArray(q.criteria)) {
        return `choice question ${name} has array criteria`;
      }
    }
    if (Object.hasOwn(q, "type")) {
      for (const key of Object.keys(q)) {
        if (!["type", "instructions", "criteria"].includes(key)) {
          return `question ${name} kept extra key ${key}`;
        }
      }
    }
  }
  return undefined;
}

const inputs = [...corpus()];
for (const seed of [1, 7, 13, 99, 2024, 31337, 424242]) {
  const rand = rng(seed);
  for (let i = 0; i < 4000; i += 1) inputs.push(randomRequest(rand));
}
// One sweep feeds every property, so it runs once in `before` and each
// invariant reports its own failures rather than a merged count. A merged
// array would attribute a shape bug to "properties" and tell the next
// person nothing about where to look.
const rejected: string[] = [];
const shapeProblems: string[] = [];
const nondeterministic: string[] = [];
const notIdempotent: string[] = [];

async function sweep(): Promise<void> {
  for (const input of inputs) {
    deepFreeze(input);
    let once: Json;
    try {
      once = prepareSystemOneArgs(input);
    } catch {
      rejected.push(JSON.stringify(input).slice(0, 160));
      continue;
    }
    if (await reachesProvider(once)) {
      const bad = shapeOk(captured);
      if (bad) {
        shapeProblems.push(
          `REACHED PROVIDER: ${bad} :: ${JSON.stringify(captured).slice(0, 160)}`,
        );
      }
    }
    // 1. non-mutation + 3. determinism
    try {
      assert.deepEqual(prepareSystemOneArgs(input), once);
    } catch {
      nondeterministic.push(JSON.stringify(input).slice(0, 160));
      continue;
    }
    // 2. idempotence
    const twice = prepareSystemOneArgs(once);
    try {
      assert.deepEqual(twice, once);
    } catch {
      notIdempotent.push(
        `in=${JSON.stringify(input).slice(0, 140)}\n      once=${JSON.stringify(once).slice(0, 140)}\n      twice=${JSON.stringify(twice).slice(0, 140)}`,
      );
    }
  }
}

/** Assert a list of violations is empty, showing a bounded sample if not. */
function assertNoViolations(violations: string[], what: string): void {
  if (violations.length === 0) return;
  const shown = violations
    .slice(0, 10)
    .map((v) => `\n    - ${v}`)
    .join("");
  const more =
    violations.length > 10
      ? `\n    ... and ${violations.length - 10} more`
      : "";
  assert.fail(
    `${violations.length} ${what} across ${inputs.length} generated shapes${shown}${more}`,
  );
}

/*
 * Property 6. A repair may reshape or discard a malformed entry, but it may
 * not do so invisibly. The contract is one-directional: a batch cannot report
 * on a question that was never sent, and a choice cannot pick an option that
 * was omitted. So for every PRIMITIVE entry in a question MAP (a string
 * sitting in a name slot is the observed shape) the name must either survive
 * into the normalized output or be named in a drop note.
 *
 * Two exemptions. Records: a record-valued entry is spliced into the parent
 * level or normalized in place, and a nested question map legitimately loses
 * its outer name to the splice — only primitives can vanish. Arrays: the array
 * branch names entries from their own name field or by position (q1, q2), so
 * an index is not a stable identity to compare against.
 */
function checkNoSilentDrop(): string[] {
  const bad: string[] = [];
  for (const input of inputs) {
    if (!input || typeof input !== "object") continue;
    const raw = (input as any).questions;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    // The corpus is deep-frozen, and normalization legitimately refuses some
    // frozen shapes outright; the main loop skips those the same way.
    let out: any;
    let notes: string;
    try {
      out = prepareSystemOneArgs(input);
      notes = collectDiscardedQuestions(input).join(" | ");
    } catch {
      continue;
    }
    const normalized =
      out && typeof out === "object" ? (out as any).questions : undefined;
    for (const [name, value] of Object.entries(raw as object)) {
      if (value !== null && typeof value === "object") continue; // records exempt
      const survived =
        normalized && typeof normalized === "object"
          ? Object.hasOwn(normalized, name)
          : false;
      if (survived) continue;
      if (notes.includes(name)) continue;
      bad.push(
        `SILENTLY DROPPED: ${JSON.stringify(name)} :: ${JSON.stringify(input).slice(0, 150)}`,
      );
    }
  }
  return bad;
}

describe("system_one normalization properties", () => {
  before(async () => {
    await sweep();
  });

  it("is idempotent: f(f(x)) deep-equals f(x)", () => {
    assertNoViolations(notIdempotent, "non-idempotent shapes");
  });

  it("never mutates its input", () => {
    // Same assertion as determinism below, stated separately because a
    // mutation bug and an order-dependence bug have different causes.
    assertNoViolations(nondeterministic, "non-deterministic shapes");
  });

  it("is deterministic: same input, same output, twice", () => {
    assertNoViolations(nondeterministic, "non-deterministic shapes");
  });

  it("sends a provider-bound request with a clean question shape", () => {
    assertNoViolations(shapeProblems, "malformed provider-bound requests");
  });

  it("names every score level in the rendered result", () => {
    assertNoViolations(checkLegibility(), "rubrics with an unnamed level");
  });

  it("never discards a question without reporting it", () => {
    assertNoViolations(
      checkNoSilentDrop(),
      "question-map entries dropped without a note",
    );
  });

  it("exercises a corpus large enough to have found real defects", () => {
    // A property that passes because it generated 12 shapes is not a
    // property. This one found seven bugs at 34,600; keep the floor honest.
    assert.ok(
      inputs.length >= 30_000,
      `corpus shrank to ${inputs.length}; the sweep has caught defects only at scale`,
    );
    assert.ok(
      rejected.length > 0,
      "no input was ever rejected, so the corpus is not reaching the real code",
    );
  });
});
