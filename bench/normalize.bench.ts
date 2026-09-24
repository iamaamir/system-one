// Phase 1 baseline: prepareSystemOneArgs() normalization cost.
// Scenarios mirror the PR brief (canonical / sloppy / mixed).
// Run: node --expose-gc --experimental-strip-types bench/normalize.bench.ts

import { prepareSystemOneArgs } from "../pi-system-one/src/tool.ts";
import { benchHeader, fmtTiming, garbageBytes, measure } from "./harness.ts";

const canonical = {
  state: { incident: "API latency increased after deploy" },
  questions: {
    rollback: { type: "noul", instructions: "Should we roll back?" },
    owner: {
      type: "choice",
      instructions: "Which team should own this?",
      criteria: { frontend: null, backend: null, platform: null },
    },
  },
};

const sloppy = {
  context: { incident: "API latency increased after deploy" },
  question: [
    { name: "rollback", type: "boolean", prompt: "Should we roll back?" },
    {
      name: "owner",
      type: "Choice",
      prompt: "Which team should own this?",
      options: ["frontend", "backend", "platform"],
    },
  ],
};

const mixed = {
  state: { incident: "API latency increased after deploy" },
  questions: {
    q1: { type: "noul", instructions: "Should we roll back?" },
    q2: {
      type: "choice",
      instructions: "Which team should own this?",
      criteria: { frontend: null, backend: null, platform: null },
    },
    q3: {
      type: "score",
      instructions: "How severe?",
      criteria: ["low", "medium", "high"],
    },
    q4: {
      type: "choice",
      instructions: "Where to announce?",
      criteria: { status: null, slack: null },
    },
    q5: { type: "noul", instructions: "Page on-call?" },
    // One sloppy question needing repair (alias type + array criteria).
    q6: { type: "Rating", prompt: "Rate the response", levels: ["1", "5"] },
  },
};

// Sanity: every scenario normalizes to an equivalent shape before timing.
for (const [name, input] of Object.entries({ canonical, sloppy, mixed })) {
  const out = prepareSystemOneArgs(input) as {
    questions?: Record<string, { type?: string }>;
  };
  const types = Object.values(out.questions ?? {})
    .map((q) => q.type)
    .join(",");
  console.log(`${name} -> questions: ${types}`);
}

// Global warmup: tier up the JIT for every shape BEFORE measuring, so the
// first-measured scenario isn't penalized by unoptimized code.
const once = prepareSystemOneArgs(canonical);
for (const input of [canonical, sloppy, mixed, once]) {
  for (let i = 0; i < 20_000; i += 1)
    void JSON.stringify(prepareSystemOneArgs(input));
}

benchHeader("prepareSystemOneArgs");
const N = 50_000;
for (const [name, input] of Object.entries({ canonical, sloppy, mixed })) {
  const t = measure(() => void JSON.stringify(prepareSystemOneArgs(input)), N);
  const g = garbageBytes(
    () => void JSON.stringify(prepareSystemOneArgs(input)),
    2_000,
  );
  console.log(
    `${name.padEnd(10)} ${fmtTiming(t)} | garbage ~${g.generatedPerOp.toFixed(0)}B/op retained ${g.retained}B`,
  );
}

// Second-pass cost: execute() re-normalizes defensively. Simulate it by
// normalizing already-normalized output — this must become ~free with CoW.
benchHeader("prepareSystemOneArgs(second pass on normalized output)");
const t2 = measure(() => void JSON.stringify(prepareSystemOneArgs(once)), N);
const g2 = garbageBytes(
  () => void JSON.stringify(prepareSystemOneArgs(once)),
  2_000,
);
console.log(
  `canonical2 ${fmtTiming(t2)} | garbage ~${g2.generatedPerOp.toFixed(0)}B/op retained ${g2.retained}B`,
);
