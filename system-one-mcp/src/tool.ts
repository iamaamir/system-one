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

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

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

function rejectUnsafeQuestionMap(value: unknown): void {
  inspectUnsafeQuestionMap(value, (message) => {
    throw new Error(message);
  });
}

const question = z
  .object({
    type: z.enum(["choice", "noul", "score"]),
    instructions: jsonValue,
    criteria: z
      .union([z.record(z.string(), z.unknown()), z.array(z.unknown()).min(2)])
      .optional(),
  })
  .strict();

export const systemOneInputSchema = {
  state: z.unknown(),
  questions: z.preprocess(
    (value, ctx) => {
      inspectUnsafeQuestionMap(value, (message) => {
        ctx.addIssue({ code: "custom", message });
      });
      return value;
    },
    z
      .record(z.string(), question)
      .refine(
        (value) => Object.keys(value).length > 0,
        "at least one question is required",
      ),
  ),
};

export const systemOneDescription =
  "Evaluate bounded choice, yes/no likelihood, or ordered rubric questions over supplied state using the configured System One provider.";

export const systemOneOutputSchema = {
  model: z.string().optional(),
  answers: z.record(z.string(), z.unknown()),
  usage: z
    .object({
      inputTokens: z.number().optional(),
      outputTokens: z.number().optional(),
    })
    .optional(),
  requestId: z.string().optional(),
  metadata: z.object({
    provider: z.string(),
    latencyMs: z.number().optional(),
  }),
};

function rejectUnsafeQuestionKeys(args: unknown): void {
  if (typeof args !== "object" || args === null || Array.isArray(args)) return;
  rejectUnsafeQuestionMap((args as Record<string, unknown>).questions);
}

function assertQuestions(
  questions: Record<string, z.infer<typeof question>>,
): void {
  for (const [name, value] of Object.entries(questions)) {
    if (
      value.type === "choice" &&
      (!value.criteria ||
        Array.isArray(value.criteria) ||
        Object.keys(value.criteria).length === 0)
    )
      throw new Error(
        `choice question "${name}" needs a non-empty criteria object`,
      );
    if (
      value.type === "score" &&
      (!Array.isArray(value.criteria) || value.criteria.length < 2)
    )
      throw new Error(
        `score question "${name}" needs an ordered criteria array with at least two levels`,
      );
    if (
      value.type === "noul" &&
      value.criteria !== undefined &&
      (Array.isArray(value.criteria) ||
        typeof value.criteria !== "object" ||
        value.criteria === null)
    )
      throw new Error(
        `noul question "${name}" needs an object criteria or no criteria`,
      );
  }
}

export async function evaluateSystemOne(args: unknown, signal?: AbortSignal) {
  rejectUnsafeQuestionKeys(args);
  const parsed = z.object(systemOneInputSchema).strict().safeParse(args);
  if (!parsed.success)
    throw new Error(`system_one input is invalid: ${parsed.error.message}`);
  assertQuestions(parsed.data.questions);
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
