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
 * Public tool parameters (the LLM-facing boundary schema).
 *
 * The LLM-facing tool contract is intentionally more permissive than the
 * System One domain model. The schema answers only "can I safely accept
 * and inspect this?" — every field is optional, extra keys are allowed,
 * and `questions` accepts any JSON so near-miss shapes (singular
 * `question`, arrays, unwrapped singles, alias spellings like `Choice`,
 * `rating`, or `Yes/No`) survive Pi's pre-execution validation on every
 * Pi version, including older ones without `prepareArguments`.
 * Normalization (`prepareSystemOneArgs`) repairs representation only;
 * semantic validation in `execute()` (via `assertAnswerableQuestions`)
 * establishes the canonical System One contract — `{type: "choice" |
 * "noul" | "score", instructions, criteria}` per question — and rejects
 * what cannot be repaired with an actionable error.
 */
export const systemOneParams = Type.Object(
  {
    state: Type.Optional(
      Type.Any({
        description:
          "Shared state or evidence that all questions should be evaluated against. Usually a string or object. Aliases: context, evidence.",
      }),
    ),

    context: Type.Optional(Type.Any()),
    evidence: Type.Optional(Type.Any()),

    questions: Type.Optional(
      Type.Any({
        description:
          'One or more named decision questions. "choice" selects one outcome from a bounded set (criteria is an object keyed by label); "noul" estimates a yes/no likelihood (criteria usually omitted); "score" scores against an ordered rubric (criteria is an array of at least two levels). Accepts a name-keyed object, an array of questions, or a single unwrapped question. Aliases: question, queries; near-miss type spellings are normalized.',
      }),
    ),
    question: Type.Optional(Type.Any()),
    queries: Type.Optional(Type.Any()),
  },
  {
    additionalProperties: true,
    description:
      'Evaluate bounded decision questions against shared state. Example: {"state": "...", "questions": {"q1": {"type": "choice", "instructions": "...", "criteria": {"a": null, "b": null}}}}.',
  },
);

export type SystemOneParams = Static<typeof systemOneParams>;

/**
 * Near-miss spellings low-quality models emit for the `type` discriminator.
 * Lookup is case-insensitive; unlisted values pass through untouched so
 * validation still reports a clear error for genuinely unknown kinds.
 *
 * Every entry here must be SAFE: a representation-only difference whose
 * meaning is unambiguous. Deliberately NOT aliased (rejected instead):
 * - "probability" / "likelihood": describe an output statistic, not a task.
 *   They could mean a noul question, a choice with probabilities, or a
 *   free-floating number. Guessing noul would silently convert the wrong
 *   task into a valid but semantically incorrect request — a believable
 *   wrong answer is worse than a validation error the model can retry.
 * - "ranking": ordering items relative to each other is not scoring each
 *   against a rubric. Mapping it to score would corrupt the task.
 */
const QUESTION_TYPE_ALIASES = new Map<string, string>([
  ["choice", "choice"],
  ["choose", "choice"],
  ["multiple_choice", "choice"],
  ["categorical", "choice"],
  ["select", "choice"],
  ["classify", "choice"],
  ["classification", "choice"],
  ["noul", "noul"],
  ["boolean", "noul"],
  ["bool", "noul"],
  ["yes_no", "noul"],
  ["yesno", "noul"],
  ["score", "score"],
  ["rating", "score"],
  ["rate", "score"],
  ["scale", "score"],
  ["rubric", "score"],
  ["grade", "score"],
]);

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

/**
 * Assign an externally controlled key. Plain `obj[key] = value` with
 * `key === "__proto__"` would reparent the object instead of storing an
 * entry; defineProperty always creates an ordinary own data property.
 */
function setOwn(
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function normalizeQuestionType(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const key = raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[-\s/.]+/g, "_");
  // Map lookup (not a plain object) so inherited names like "__proto__"
  // or "constructor" can never accidentally resolve to an alias.
  return QUESTION_TYPE_ALIASES.get(key) ?? raw;
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
 * Copy-on-write canonicality check for one question. Returns true when
 * running the builder below would produce a key-for-key, value-for-value
 * identical record — in which case the caller reuses the input by
 * reference instead of allocating a copy. Any doubt returns false (the
 * builder then produces the correct output); false negatives only cost an
 * allocation, never correctness.
 *
 * Deliberately allocation-free itself (own-key probes, no entries/keys
 * arrays) so the defensive second normalization in execute() stays cheap.
 */
function isCanonicalQuestion(input: Record<string, unknown>): boolean {
  const hasType = Object.hasOwn(input, "type");
  // Probe only: an exact canonical spelling (alias-map value identical to
  // the key) needs no work. Near-miss spellings report non-canonical
  // WITHOUT running full normalization here — the builder below runs it
  // exactly once. Non-string types pass (the builder copies them verbatim),
  // so doubt always errs toward a wasted rebuild, never a wrong share.
  if (
    hasType &&
    typeof input.type === "string" &&
    QUESTION_TYPE_ALIASES.get(input.type) !== input.type
  ) {
    return false;
  }
  // Strings reaching here are already canonical, so the raw type doubles
  // as the normalized one for the criteria decisions below.
  const normalizedType = hasType ? input.type : undefined;
  const instructions = pickAlias(input, INSTRUCTIONS_ALIASES);
  // NOTE: no `else` for an own defined "instructions" slot — "instructions"
  // is the first alias, so pickAlias would have returned it above; reaching
  // here with one means it is undefined and the builder omits it too.
  if (instructions !== undefined) {
    // The builder emits own "instructions" with this value; canonical only
    // if it already sits there and no sibling alias key lingers (dropped).
    if (
      !Object.hasOwn(input, "instructions") ||
      input.instructions !== instructions
    ) {
      return false;
    }
  }
  for (const alias of INSTRUCTIONS_ALIASES) {
    if (alias !== "instructions" && Object.hasOwn(input, alias)) return false;
  }
  let criteria = pickAlias(input, CRITERIA_ALIASES);
  if (normalizedType === "noul" && criteria === null) {
    // The builder drops it; canonical only if no own alias key is dropped.
    for (const alias of CRITERIA_ALIASES) {
      if (Object.hasOwn(input, alias)) return false;
    }
    criteria = undefined;
  }
  if (
    normalizedType === "choice" &&
    Array.isArray(criteria) &&
    (criteria as unknown[]).every((item) => typeof item === "string")
  ) {
    return false; // The builder folds string arrays to an object.
  }
  if (criteria !== undefined) {
    if (!Object.hasOwn(input, "criteria") || input.criteria !== criteria) {
      return false;
    }
  } else if (Object.hasOwn(input, "criteria")) {
    return false; // Own undefined criteria is dropped by the builder.
  }
  for (const alias of CRITERIA_ALIASES) {
    if (alias !== "criteria" && Object.hasOwn(input, alias)) return false;
  }
  for (const key of QUESTION_JUNK_KEYS) {
    if (Object.hasOwn(input, key)) return false;
  }
  // Any other own key is preserved by reference, so it cannot differ.
  return true;
}

/**
 * Coerce one question into the flat schema shape: canonical `type`,
 * `instructions` / `criteria` resolved through aliases, array-form choice
 * criteria (`["a", "b"]`) folded to `{"a": null, "b": null}`, and
 * naming/junk keys stripped.
 *
 * Pure, idempotent, non-mutating, with structural sharing: canonical input
 * is returned by reference; only repaired questions allocate.
 */
function normalizeQuestion(input: unknown): unknown {
  if (!isRecord(input)) return input;
  if (isCanonicalQuestion(input)) return input;
  const out: Record<string, unknown> = {};
  if (Object.hasOwn(input, "type"))
    out.type = normalizeQuestionType(input.type);
  const instructions = pickAlias(input, INSTRUCTIONS_ALIASES);
  if (instructions !== undefined) out.instructions = instructions;
  else if (Object.hasOwn(input, "instructions"))
    out.instructions = input.instructions;
  let criteria = pickAlias(input, CRITERIA_ALIASES);
  // `null` is this schema's idiom for "no content"; on noul it reads as
  // "omitted" rather than a degenerate value worth a backend round trip.
  if (out.type === "noul" && criteria === null) criteria = undefined;
  if (
    out.type === "choice" &&
    Array.isArray(criteria) &&
    criteria.every((item) => typeof item === "string")
  ) {
    const folded: Record<string, unknown> = {};
    for (const item of criteria as string[]) setOwn(folded, item, null);
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
    setOwn(out, key, value);
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
        // No intermediate `{...rest}` copy: normalizeQuestion() already
        // drops name/id/key as junk, so passing the entry through repairs
        // naming metadata and aliases in a single construction pass.
        const rawName = entry.name ?? entry.id ?? entry.key;
        const base =
          typeof rawName === "string" && rawName.trim() !== ""
            ? rawName
            : `q${index + 1}`;
        setOwn(record, claimName(base), normalizeQuestion(entry));
      } else {
        setOwn(record, claimName(`q${index + 1}`), entry);
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
    // Copy-on-write: share the map (and each canonical question) when
    // nothing needs repair; otherwise rebuild with repaired questions and
    // unaffected siblings shared by reference. The scan probes
    // canonicality only — it must never build (and discard) repairs.
    let dirty = false;
    for (const name in input) {
      if (!Object.hasOwn(input, name)) continue;
      const question = input[name];
      if (!isRecord(question) || !isCanonicalQuestion(question)) {
        dirty = true;
        break;
      }
    }
    if (!dirty) return input;
    const record: Record<string, unknown> = {};
    for (const name in input) {
      if (!Object.hasOwn(input, name)) continue;
      setOwn(record, name, normalizeQuestion(input[name]));
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
  const questions =
    args.questions ?? args.question ?? args.queries ?? undefined;
  const normalizedQuestions =
    questions !== undefined ? normalizeQuestions(questions) : undefined;
  // Copy-on-write fast path: canonical state/questions slots, no alias keys
  // to rename, no unknown keys to drop — return the input by reference so
  // the defensive re-normalization in execute() allocates ~nothing.
  const questionsCanonical =
    normalizedQuestions === questions &&
    (questions === undefined
      ? !Object.hasOwn(args, "questions") &&
        !Object.hasOwn(args, "question") &&
        !Object.hasOwn(args, "queries")
      : questions === args.questions &&
        !Object.hasOwn(args, "question") &&
        !Object.hasOwn(args, "queries"));
  if (
    questionsCanonical &&
    Object.hasOwn(args, "state") &&
    args.state !== undefined &&
    !Object.hasOwn(args, "context") &&
    !Object.hasOwn(args, "evidence")
  ) {
    let knownKeysOnly = true;
    for (const key in args) {
      if (Object.hasOwn(args, key) && key !== "state" && key !== "questions") {
        knownKeysOnly = false;
        break;
      }
    }
    if (knownKeysOnly) return args as SystemOneParams;
  }
  const out: Record<string, unknown> = {};
  if (args.state !== undefined) {
    out.state = args.state;
  } else if (args.context !== undefined) {
    out.state = args.context;
  } else if (args.evidence !== undefined) {
    out.state = args.evidence;
  }
  if (normalizedQuestions !== undefined) out.questions = normalizedQuestions;
  // Drop unknown top-level keys; a missing `state` / `questions` still
  // produces a clear error from semantic validation in execute().
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
 * Runtime semantic validation: "is this actually a valid System One
 * request?" The public schema lets repairable shapes through; this gate
 * enforces the canonical contract the provider requires. Limits here are
 * the ones the tool itself guarantees (verified against
 * system-one-core, which enforces no option/level counts — the backend
 * is the final arbiter for anything stricter). Every error states what
 * was wrong, which question it was in, and what valid shape looks like.
 */
const KNOWN_QUESTION_KEYS = new Set(["type", "instructions", "criteria"]);

function assertAnswerableQuestions(questions: unknown): void {
  if (questions === undefined) {
    throw new Error(
      'system_one: questions is required. Provide at least one named question, e.g. {"q1": {"type": "choice", "instructions": "...", "criteria": {"a": null}}}.',
    );
  }
  // The semantic gate is authoritative: anything that is not a question
  // map after normalization is rejected here, never sent to the provider.
  if (!isRecord(questions)) {
    throw new Error(
      'system_one: "questions" must resolve to a question map after normalization, e.g. {"q1": {"type": "choice", "instructions": "...", "criteria": {"a": null}}}.',
    );
  }
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
    for (const key of Object.keys(value)) {
      if (!KNOWN_QUESTION_KEYS.has(key)) {
        throw new Error(
          `system_one: question "${name}" has unknown field "${key}"; use only "type", "instructions", and "criteria".`,
        );
      }
    }
    if (value.instructions === undefined || value.instructions === null) {
      throw new Error(
        `system_one: question "${name}" needs "instructions" describing what to evaluate, e.g. {"type": "${typeof value.type === "string" ? value.type : "choice"}", "instructions": "Which option fits best?"}.`,
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
      "Judge bounded decisions over explicitly supplied state with a dedicated judge model — calibrated probabilities conditional on that state (confidence for choice/score only; noul has no confidence field, its probability is the uncertainty measure). " +
      "Call system_one instead of answering directly when the request is a pick from named options, a yes/no likelihood, or a rubric score over state already in context — the judge's state-conditional probabilities beat guesses from priors. " +
      "The judge only weighs the state you supply: it cannot recall facts or browse, so retrieve evidence first and never ask it to recall facts. " +
      "Do not use it for open-ended text generation or factual lookup. " +
      "Questions that share the same state can be evaluated together in one call. " +
      'Each question is {"type": "choice" | "noul" | "score", "instructions": "...", "criteria": ...}: ' +
      'choice criteria is an object keyed by choice label ({"a": null, "b": null}), ' +
      "noul usually omits criteria, " +
      "score criteria is an ordered array of at least two levels.",

    parameters: systemOneParams,

    promptSnippet:
      "Use system_one for bounded choice, yes/no, and ordered-scale judgments over supplied evidence",

    promptGuidelines: [
      "Before answering a bounded judgment over supplied or retrieved evidence, call system_one instead of making the judgment yourself. A bounded judgment is: choosing among explicit alternatives, making a yes/no judgment, or rating something on an ordered scale.",
      "Pick the system_one question type mechanically: unordered alternatives (frontend, backend, platform) -> choice; yes/no -> noul; ordered scale, rating, severity, risk, or grade -> score. Never use choice for an ordered scale merely because its levels have names: very low / low / moderate / high / very high is score, not choice.",
      "Retrieve missing factual evidence into state first; never ask system_one to recall facts or browse. Use system_one for bounded judgments over available evidence, not as a replacement for factual lookup.",
      "Batch independent system_one questions sharing the same state into one call instead of one call per question.",
      "For system_one choice questions, the keys of criteria are the available choices — preserve user-specified labels and use null values when labels are self-explanatory; never add a separate options field.",
    ],

    prepareArguments: (args) => prepareSystemOneArgs(args),

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      /*
       * The LLM-facing TypeBox schema is intentionally separate from the
       * provider protocol types. Cast only at this boundary instead of
       * spreading `any` throughout the implementation.
       *
       * `prepareArguments` above is an optimization for newer Pi only: it
       * runs before schema validation there, but older Pi versions ignore
       * it and validate the raw model output against the permissive
       * schema instead. Correctness never depends on it — re-normalize
       * here so every path (new Pi, old Pi, direct calls) converges on
       * the same canonical shape before semantic validation.
       */
      const normalized = prepareSystemOneArgs(params);
      // prepareSystemOneArgs passes non-objects through untouched; direct
      // calls bypassing Pi validation must get an actionable error, not a
      // TypeError from property access on null.
      if (!isRecord(normalized)) {
        throw new Error(
          'system_one: request must be an object with "state" and "questions".',
        );
      }
      if (normalized.state === undefined) {
        throw new Error(
          'system_one: state is required. Put the material under judgment in "state" (string or object), e.g. {"state": "<evidence>", "questions": {...}}.',
        );
      }
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
