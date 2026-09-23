import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  type QuestionMap,
  SystemOne,
  type SystemOneProvider,
  type SystemOneState,
} from "system-one-core";
import type { Static } from "typebox";
import { Type } from "typebox";
import { renderSystemOneResult } from "./render.ts";

/**
 * Discriminator for the single flat question shape.
 *
 * Uses a plain `{ type: "string", enum: [...] }` schema (the same shape Pi's
 * `StringEnum` helper produces) instead of `Type.Literal` / `Type.Union`.
 * Pi's docs call out that `Type.Union` / `Type.Literal` doesn't work with
 * Google's API, and multi-branch `anyOf` schemas are the top source of
 * validation failures from low-quality models.
 */
const QuestionType = Type.Unsafe({
  type: "string",
  enum: ["choice", "noul", "score"],
  description:
    'Question kind: "choice" selects one outcome from a bounded set, "noul" estimates a yes/true likelihood, "score" scores against an ordered rubric.',
});

/**
 * Single flat question shape.
 *
 * One object with an enum discriminator instead of a three-way
 * `Type.Union([ChoiceQ, NoulQ, ScoreQ])`. `instructions` and `criteria` are
 * `Type.Any()` so the schema contains zero `anyOf` branches: low-quality
 * models just fill in the shape from the description and example, and
 * `prepareArguments` coerces common near-misses (aliases, casing) before
 * validation. Per-type criteria rules stay in the description and
 * guidelines rather than in union arms the model must discriminate.
 */
const Question = Type.Object(
  {
    type: QuestionType,

    instructions: Type.Any({
      description:
        "What to evaluate. Usually a short string; any JSON value is accepted.",
    }),

    criteria: Type.Optional(
      Type.Any({
        description:
          'Choice: object keyed by choice label, e.g. {"a": null, "b": "means ..."}; use null values when labels are self-explanatory. Noul: omit unless true/false need clarification. Score: array of at least two ordered levels from lowest to highest.',
      }),
    ),
  },
  {
    additionalProperties: false,
    description:
      'A bounded decision question. Example: {"type": "choice", "instructions": "Pick one", "criteria": {"a": null, "b": null}}.',
  },
);

export const systemOneParams = Type.Object(
  {
    state: Type.Any({
      description:
        "Shared state or evidence that all questions should be evaluated against. Usually a string or object.",
    }),

    questions: Type.Record(Type.String(), Question, {
      minProperties: 1,
      description:
        "One or more named decision questions. Questions sharing the same state should be sent together.",
    }),
  },
  {
    additionalProperties: false,
    description:
      'Evaluate bounded decision questions against shared state. Example: {"state": "...", "questions": {"q1": {"type": "choice", "instructions": "...", "criteria": {"a": null, "b": null}}}}.',
  },
);

export type SystemOneParams = Static<typeof systemOneParams>;

/**
 * Near-miss spellings low-quality models emit for the `type` discriminator.
 * Lookup is case-insensitive; unlisted values pass through untouched so
 * validation still reports a clear error for genuinely unknown kinds.
 */
const QUESTION_TYPE_ALIASES: Record<string, string> = {
  choice: "choice",
  choose: "choice",
  multiple_choice: "choice",
  categorical: "choice",
  select: "choice",
  classify: "choice",
  classification: "choice",
  noul: "noul",
  boolean: "noul",
  bool: "noul",
  yes_no: "noul",
  yesno: "noul",
  probability: "noul",
  likelihood: "noul",
  score: "score",
  rating: "score",
  rate: "score",
  scale: "score",
  rubric: "score",
  grade: "score",
  ranking: "score",
};

/** Field aliases models use instead of `criteria`. First hit wins. */
const CRITERIA_ALIASES = [
  "criteria",
  "options",
  "choices",
  "levels",
  "rubric",
  "labels",
  "candidates",
  "outcomes",
];

/** Field aliases models use instead of `instructions`. First hit wins. */
const INSTRUCTIONS_ALIASES = [
  "instructions",
  "instruction",
  "prompt",
  "question",
  "text",
  "query",
  "task",
];

/**
 * Question-level keys that are never part of the schema (naming metadata
 * from array-form questions, or hallucinated documentation fields).
 * Dropped so they don't trip `additionalProperties: false`.
 */
const QUESTION_JUNK_KEYS = new Set([
  "description",
  "title",
  "detail",
  "details",
  "example",
  "examples",
  "id",
  "key",
  "name",
  "label",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeQuestionType(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[-\s/.]+/g, "_");
  return QUESTION_TYPE_ALIASES[key] ?? raw;
}

function pickAlias(
  input: Record<string, unknown>,
  aliases: readonly string[],
): unknown {
  for (const alias of aliases) {
    if (input[alias] !== undefined) return input[alias];
  }
  return undefined;
}

/**
 * Coerce one question into the flat schema shape: canonical `type`,
 * `instructions` / `criteria` resolved through aliases, array-form choice
 * criteria (`["a", "b"]`) folded to `{"a": null, "b": null}`, and
 * naming/junk keys stripped.
 */
function normalizeQuestion(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const out: Record<string, unknown> = {};
  if ("type" in input) out.type = normalizeQuestionType(input.type);
  const instructions = pickAlias(input, INSTRUCTIONS_ALIASES);
  if (instructions !== undefined) out.instructions = instructions;
  else if ("instructions" in input) out.instructions = input.instructions;
  let criteria = pickAlias(input, CRITERIA_ALIASES);
  if (
    out.type === "choice" &&
    Array.isArray(criteria) &&
    criteria.every((item) => typeof item === "string")
  ) {
    const folded: Record<string, unknown> = {};
    for (const item of criteria as string[]) folded[item] = null;
    criteria = folded;
  }
  if (criteria !== undefined) out.criteria = criteria;
  // Preserve any other non-junk keys so genuinely new fields still surface
  // in validation instead of being silently dropped.
  for (const [key, value] of Object.entries(input)) {
    if (
      key === "type" ||
      INSTRUCTIONS_ALIASES.includes(key) ||
      CRITERIA_ALIASES.includes(key) ||
      QUESTION_JUNK_KEYS.has(key)
    ) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function normalizeQuestions(input: unknown): unknown {
  if (Array.isArray(input)) {
    const record: Record<string, unknown> = {};
    const used = new Set<string>();
    // Duplicate names would silently overwrite; suffix instead so every
    // requested question reaches the backend.
    const claimName = (base: string): string => {
      let candidate = base;
      for (let n = 2; used.has(candidate); n += 1) candidate = `${base}_${n}`;
      used.add(candidate);
      return candidate;
    };
    input.forEach((entry, index) => {
      if (isRecord(entry)) {
        const { name, id, key, ...rest } = entry;
        const rawName = name ?? id ?? key;
        const base =
          typeof rawName === "string" && rawName.trim() !== ""
            ? rawName
            : `q${index + 1}`;
        record[claimName(base)] = normalizeQuestion(rest);
      } else {
        record[claimName(`q${index + 1}`)] = entry;
      }
    });
    return record;
  }
  if (isRecord(input)) {
    // Single question sent without a wrapping name (`questions: {type, ...}`)
    // instead of (`questions: {q1: {type, ...}}`). Unwrap on a known kind so
    // a hallucinated extra field still reports against the question (not as
    // phantom questions named "type"/"instructions"); fall back to the
    // vocabulary check for unknown types so those report precisely too. A
    // record that merely contains a question *named* "type" has an object
    // there, never a string, so it is never misread.
    if (typeof input.type === "string") {
      const kind = normalizeQuestionType(input.type);
      const knownKind =
        kind === "choice" || kind === "noul" || kind === "score";
      const keys = Object.keys(input);
      const allQuestionKeys = keys.every(
        (key) =>
          key === "type" ||
          INSTRUCTIONS_ALIASES.includes(key) ||
          CRITERIA_ALIASES.includes(key) ||
          QUESTION_JUNK_KEYS.has(key),
      );
      if (knownKind || allQuestionKeys) return { q: normalizeQuestion(input) };
    }
    const record: Record<string, unknown> = {};
    for (const [name, question] of Object.entries(input)) {
      record[name] = normalizeQuestion(question);
    }
    return record;
  }
  return input;
}

/**
 * Compatibility shim for sloppy tool arguments. Runs before schema
 * validation (wired as `prepareArguments`) and is idempotent, so `execute`
 * re-applies it defensively for direct calls that bypass validation.
 */
export function prepareSystemOneArgs(args: unknown): SystemOneParams {
  if (!isRecord(args)) return args as SystemOneParams;
  const out: Record<string, unknown> = {};
  if (args.state !== undefined) {
    out.state = args.state;
  } else if (args.context !== undefined) {
    out.state = args.context;
  } else if (args.evidence !== undefined) {
    out.state = args.evidence;
  }
  const questions =
    args.questions ?? args.question ?? args.queries ?? undefined;
  if (questions !== undefined) out.questions = normalizeQuestions(questions);
  // Drop unknown top-level keys; a missing `state` / `questions` still
  // produces a clear required-property error from validation.
  return out as SystemOneParams;
}

export interface SystemOneDetails {
  answers: Record<string, unknown>;
  model?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  requestId?: string;
  metadata: {
    provider: string;
    latencyMs?: number;
  };
}

/**
 * Backend-intersection guardrails.
 *
 * The flat tool schema is intentionally permissive so weak models pass Pi
 * validation, but every /v1/systemone backend (Reflex, Von, Laya, TypeSafe)
 * still rejects degenerate questions with 400/422. Catch those shapes here
 * and throw model-actionable errors so the caller can retry a fixed call
 * instead of parsing a backend status code.
 */
function assertAnswerableQuestions(questions: unknown): void {
  // Missing/non-object questions are left for schema validation (or the
  // backend, on direct calls) to report.
  if (!isRecord(questions)) return;
  if (Object.keys(questions).length === 0) {
    throw new Error(
      "system_one: at least one question is required in questions.",
    );
  }
  for (const [name, value] of Object.entries(questions)) {
    if (!isRecord(value)) {
      throw new Error(
        `system_one: question "${name}" must be an object with "type", "instructions", and "criteria".`,
      );
    }
    if (value.type === "choice") {
      if (
        !isRecord(value.criteria) ||
        Object.keys(value.criteria).length === 0
      ) {
        throw new Error(
          `system_one: choice question "${name}" needs criteria as an object keyed by choice label with at least one choice, e.g. {"a": null, "b": null}.`,
        );
      }
    } else if (value.type === "score") {
      if (!Array.isArray(value.criteria) || value.criteria.length < 2) {
        throw new Error(
          `system_one: score question "${name}" needs criteria as an ordered array of at least two levels from lowest to highest, e.g. ["low", "high"].`,
        );
      }
    } else if (value.type === "noul") {
      if (value.criteria !== undefined && !isRecord(value.criteria)) {
        throw new Error(
          `system_one: noul question "${name}" needs criteria omitted or as an object describing the true/false outcomes, e.g. {"true": "...", "false": "..."}.`,
        );
      }
    } else {
      const got =
        typeof value.type === "string" ? `"${value.type}"` : "missing";
      throw new Error(
        `system_one: question "${name}" has unknown type ${got}; use "choice", "noul", or "score".`,
      );
    }
  }
}

export function buildSystemOneTool(deps: {
  provider: SystemOneProvider;
}): ToolDefinition<typeof systemOneParams, SystemOneDetails> {
  const systemOne = new SystemOne({
    provider: deps.provider,
  });

  return {
    name: "system_one",
    label: "System One",

    description:
      "Get calibrated probabilities, confidences, and a committed pick for bounded decisions from a dedicated judge model. " +
      "Call system_one instead of answering directly whenever the user asks for a likelihood, a confidence, a choice between named options, or a rubric score — the judge's measured probabilities beat guesses from priors. " +
      "Do not use it for open-ended text generation. " +
      "Questions that share the same state can be evaluated together in one call. " +
      'Each question is {"type": "choice" | "noul" | "score", "instructions": "...", "criteria": ...}: ' +
      'choice criteria is an object keyed by choice label ({"a": null, "b": null}), ' +
      "noul usually omits criteria, " +
      "score criteria is an ordered array of at least two levels.",

    parameters: systemOneParams,

    promptSnippet:
      "Get calibrated probabilities for bounded decisions instead of answering from priors",

    promptGuidelines: [
      "When the user asks for a likelihood, confidence, or probability, call system_one instead of stating a number from priors.",
      "When the request resolves to picking one option from several, estimating a yes/no chance, or placing something on an ordered scale — in any domain, any phrasing — call system_one instead of answering directly.",
      "Use system_one for closed-set classification, probabilistic yes/no judgments, or ordered rubric scoring; never for open-ended text generation.",
      "For system_one choice questions, the keys of criteria are the available choices — preserve user-specified labels and use null values when labels are self-explanatory; never add a separate options field.",
      "Batch independent system_one questions into one call when they share the same state.",
    ],

    prepareArguments: (args) => prepareSystemOneArgs(args),

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      /*
       * The LLM-facing TypeBox schema is intentionally separate from the
       * provider protocol types. Cast only at this boundary instead of
       * spreading `any` throughout the implementation. Re-normalize here so
       * direct calls that bypass `prepareArguments` get the same tolerance.
       */
      const normalized = prepareSystemOneArgs(params);
      assertAnswerableQuestions(normalized.questions);
      const response = await systemOne.evaluate(
        {
          state: normalized.state as SystemOneState,
          questions: normalized.questions as QuestionMap,
        },
        { signal },
      );

      return {
        content: [
          {
            type: "text" as const,
            text: renderSystemOneResult(response),
          },
        ],

        details: {
          answers: response.answers,
          model: response.model,
          usage: response.usage,
          requestId: response.requestId,
          metadata: response.metadata,
        },
      };
    },
  };
}
