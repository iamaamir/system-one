import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SystemOne } from "../src/client.ts";
import type { SystemOneRequest } from "../src/provider.ts";
import {
  type ChoiceQuestion,
  choice,
  type NoulQuestion,
  noul,
  type ScoreQuestion,
  score,
} from "../src/questions.ts";

type ReadonlyRequestQuestions = {
  choice: ChoiceQuestion<{ a: null; b: "b" }>;
  score: ScoreQuestion<string[]>;
  noul: NoulQuestion;
};

function checkRequestReadonlyContract(): void {
  const choiceQuestion = choice("Which?", { a: null, b: "b" });
  const scoreCriteria: string[] = ["low", "high"];
  const scoreQuestion = score("How?", scoreCriteria);
  const noulQuestion = noul("Is it hard?", {
    coding: "impl",
    research: null,
  });
  const request: SystemOneRequest<ReadonlyRequestQuestions> = {
    state: "state",
    questions: {
      choice: choiceQuestion,
      score: scoreQuestion,
      noul: noulQuestion,
    },
  };

  // @ts-expect-error - request slots are readonly
  request.state = "changed";
  // @ts-expect-error - request slots are readonly
  request.questions = {
    choice: choiceQuestion,
    score: scoreQuestion,
    noul: noulQuestion,
  };
  // @ts-expect-error - request slots are readonly
  request.model = "changed";
  // @ts-expect-error - question map entries are readonly
  request.questions.choice = choiceQuestion;
  // @ts-expect-error - question fields are readonly
  request.questions.choice.instructions = "changed";
  // @ts-expect-error - question criteria are readonly
  request.questions.choice.criteria = choiceQuestion.criteria;
  // @ts-expect-error - choice criteria entries are readonly
  request.questions.choice.criteria.a = null;
  // @ts-expect-error - score criteria arrays are readonly
  request.questions.score.criteria.push("new");
  // @ts-expect-error - score criteria entries are readonly
  request.questions.score.criteria[0] = "new";
  // @ts-expect-error - noul question fields are readonly
  request.questions.noul.instructions = "changed";
  // @ts-expect-error - noul criteria are readonly
  request.questions.noul.criteria = noulQuestion.criteria;
  if (request.questions.noul.criteria) {
    // @ts-expect-error - noul criteria entries are readonly
    request.questions.noul.criteria.coding = "changed";
  }
  void request;
}

async function checkInlineResponseInference(client: SystemOne) {
  const result = await client.evaluate({
    state: "state",
    questions: {
      c: {
        type: "choice",
        instructions: "Which?",
        criteria: { a: null, b: null },
      },
      s: {
        type: "score",
        instructions: "How severe?",
        criteria: ["low", "high"],
      },
    },
  });
  const choice: "a" | "b" = result.answers.c.choice;
  const score: number = result.answers.s.score;
  return { choice, score };
}

function checkMutableConstruction() {
  const questions = {
    c: {
      type: "choice" as const,
      instructions: "Which?",
      criteria: { a: null, b: null },
    },
  };
  const request: SystemOneRequest = {
    state: "state",
    questions,
  };
  void request;
}

void checkRequestReadonlyContract;
void checkInlineResponseInference;
void checkMutableConstruction;

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
