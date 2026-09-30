import {
  HttpSystemOneProvider,
  type QuestionMap,
  SystemOne,
  type SystemOneState,
} from "system-one-core";
import { z } from "zod";
import { loadSystemOneConfig } from "./config.ts";
import { renderSystemOneResult } from "./render.ts";

const jsonValue: z.ZodType = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

const UNSAFE_KEYS = new Set(["__proto__"]);

function inspectUnsafeQuestionMap(
  value: unknown,
  onUnsafe: (message: string) => void,
): void {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return;
  for (const [questionId, questionValue] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(questionId)) {
      onUnsafe(`question id "${questionId}" is not allowed`);
    }
    if (
      typeof questionValue !== "object" ||
      questionValue === null ||
      Array.isArray(questionValue)
    )
      continue;
    const criteria = (questionValue as Record<string, unknown>).criteria;
    if (
      typeof criteria !== "object" ||
      criteria === null ||
      Array.isArray(criteria)
    )
      continue;
    for (const label of Object.keys(criteria)) {
      if (UNSAFE_KEYS.has(label)) {
        onUnsafe(`criteria label "${label}" is not allowed`);
      }
    }
  }
}

const criteriaObject = z.record(z.string(), jsonValue);
const nonEmptyCriteriaObject = criteriaObject
  .check(z.minSize(1))
  .meta({ minProperties: 1 });

const choiceQuestion = z
  .object({
    type: z.literal("choice"),
    instructions: jsonValue,
    criteria: nonEmptyCriteriaObject,
  })
  .strict();
const noulQuestion = z
  .object({
    type: z.literal("noul"),
    instructions: jsonValue,
    criteria: criteriaObject.optional(),
  })
  .strict();
const scoreQuestion = z
  .object({
    type: z.literal("score"),
    instructions: jsonValue,
    criteria: z.array(jsonValue).min(2),
  })
  .strict();
const question = z.discriminatedUnion("type", [
  choiceQuestion,
  noulQuestion,
  scoreQuestion,
]);
const questions = z
  .record(z.string(), question)
  .refine(
    (value) => Object.keys(value).length > 0,
    "at least one question is required",
  )
  .meta({ minProperties: 1 });

const protectedQuestions = z.preprocess((value) => {
  inspectUnsafeQuestionMap(value, (message) => {
    throw new Error(message);
  });
  return value;
}, questions);

export const systemOneInputSchema = z
  .object({
    state: z.unknown(),
    questions: protectedQuestions,
  })
  .strict();

export const systemOneDescription =
  "Use for bounded judgments over evidence already available: choose among named options, estimate a yes/no likelihood, or score against an ordered rubric. Retrieve missing factual evidence first. Do not use for factual recall, browsing, open-ended generation, or authorization to perform an action. Batch questions that share state.";

const probability = z.number().min(0).max(1);
const answer = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("choice"),
    choice: z.string(),
    probabilities: z.record(z.string(), probability),
    confidence: probability,
  }),
  z.object({
    type: z.literal("noul"),
    noul: probability,
  }),
  z.object({
    type: z.literal("score"),
    score: z.number().nonnegative(),
    probabilities: z.record(z.string(), probability),
    legend: z.record(z.string(), jsonValue),
    confidence: probability,
  }),
]);

export const systemOneOutputSchema = z.object({
  model: z.string().optional(),
  answers: z.record(z.string(), answer),
  usage: z
    .object({
      inputTokens: z.number().nonnegative().optional(),
      outputTokens: z.number().nonnegative().optional(),
    })
    .strict()
    .optional(),
  requestId: z.string().optional(),
  metadata: z
    .object({
      provider: z.string(),
      latencyMs: z.number().nonnegative().optional(),
    })
    .strict(),
});

export async function evaluateSystemOne(args: unknown, signal?: AbortSignal) {
  const parsed = systemOneInputSchema.safeParse(args);
  if (!parsed.success)
    throw new Error(`system_one input is invalid: ${parsed.error.message}`);
  const config = loadSystemOneConfig();
  const provider = new HttpSystemOneProvider({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    defaultModel: config.model,
    timeoutMs: config.timeoutMs,
  });
  const response = await new SystemOne({ provider }).evaluate(
    {
      state: parsed.data.state as SystemOneState,
      questions: parsed.data.questions as QuestionMap,
    },
    { signal },
  );
  return {
    structuredContent: response,
    text: renderSystemOneResult(response as never),
  };
}
