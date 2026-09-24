// biome-ignore-all lint/suspicious/noExplicitAny: intentional dynamic boundary over JSON protocol values
import { SystemOneProtocolError } from "./errors.ts";
import type {
  Question,
  QuestionMap,
  ReadonlyQuestionMap,
} from "./questions.ts";
import type { SystemOneResponse } from "./responses.ts";

function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function assertProb(n: unknown, what: string): void {
  if (!isFiniteNum(n) || n < 0 || n > 1)
    throw new SystemOneProtocolError(`invalid probability for ${what}`);
}
function asCount(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Insert under an externally controlled id. Plain `obj[id] = v` with
 * `id === "__proto__"` would reparent the object instead of storing an
 * answer; defineProperty always creates an ordinary own data property.
 */
function setOwnAnswer(
  answers: Record<string, any>,
  id: string,
  value: unknown,
): void {
  Object.defineProperty(answers, id, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}
function normalizeUsage(
  u: unknown,
): { inputTokens?: number; outputTokens?: number } | undefined {
  if (!u || typeof u !== "object") return undefined;
  const o = u as Record<string, unknown>;
  const inputTokens = asCount(o.inputTokens) ?? asCount(o.input_tokens);
  const outputTokens = asCount(o.outputTokens) ?? asCount(o.output_tokens);
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
  };
}
export function validateResponse<Q extends QuestionMap>(
  questions: Q | ReadonlyQuestionMap<Q>,
  raw: unknown,
  providerId: string,
): SystemOneResponse<Q>;
export function validateResponse(
  questions: Readonly<Record<string, Question>>,
  raw: unknown,
  providerId: string,
): SystemOneResponse<QuestionMap> {
  if (!raw || typeof raw !== "object")
    throw new SystemOneProtocolError("response is not an object");
  const r = raw as Record<string, any>;
  if (!r.answers || typeof r.answers !== "object")
    throw new SystemOneProtocolError("missing answers");
  const answers: Record<string, any> = {};
  for (const [id, q] of Object.entries(questions)) {
    // Own-key read: a provider-controlled answers object must not satisfy
    // the presence check via an inherited property.
    const a = Object.hasOwn(r.answers, id) ? r.answers[id] : undefined;
    if (!a || typeof a !== "object")
      throw new SystemOneProtocolError(`missing answer for ${id}`);
    if (a.type !== (q as any).type)
      throw new SystemOneProtocolError(`wrong answer type for ${id}`);
    if (q.type === "noul") {
      if (!isFiniteNum(a.noul) || a.noul < 0 || a.noul > 1)
        throw new SystemOneProtocolError(`invalid noul for ${id}`);
      setOwnAnswer(answers, id, { type: "noul", noul: a.noul });
    } else if (q.type === "choice") {
      const criteria = (q as any).criteria as Record<string, unknown>;
      const keys = Object.keys(criteria);
      if (!keys.includes(a.choice))
        throw new SystemOneProtocolError(`unknown choice for ${id}`);
      if (!a.probabilities || typeof a.probabilities !== "object")
        throw new SystemOneProtocolError(`missing probabilities for ${id}`);
      for (const k of keys) assertProb(a.probabilities[k], `${id}.${k}`);
      if (!isFiniteNum(a.confidence) || a.confidence < 0 || a.confidence > 1)
        throw new SystemOneProtocolError(`invalid confidence for ${id}`);
      setOwnAnswer(answers, id, {
        type: "choice",
        choice: a.choice,
        probabilities: a.probabilities,
        confidence: a.confidence,
      });
    } else {
      // Score is a location on the ordered rubric, expressed in one full
      // convention: index slots ("0".."n-1") or criteria values (both seen
      // live). The distribution must cover every level exactly once, the
      // legend must label exactly the distributed keys, and the score must
      // sit on the rubric. Rubrics are small; clarity over cleverness.
      const criteria = (q as any).criteria as readonly unknown[];
      const slots = criteria.map((_, i) => String(i));
      const values = criteria.map((c) => String(c));
      if (!isFiniteNum(a.score))
        throw new SystemOneProtocolError(`invalid score for ${id}`);
      if (!isFiniteNum(a.confidence) || a.confidence < 0 || a.confidence > 1)
        throw new SystemOneProtocolError(`invalid confidence for ${id}`);
      if (!isRecord(a.legend))
        throw new SystemOneProtocolError(
          `score answer "${id}" legend must be an object map`,
        );
      if (!isRecord(a.probabilities))
        throw new SystemOneProtocolError(
          `score answer "${id}" probabilities must be an object map`,
        );
      const probKeys = Object.keys(a.probabilities as object);
      const probs = a.probabilities as Record<string, unknown>;
      const slotsComplete = slots.every((s) => Object.hasOwn(probs, s));
      const valuesComplete = values.every((v) => Object.hasOwn(probs, v));
      // Exact cover: every level present, nothing extra. Length plus
      // per-key presence implies the key set equals one convention.
      const complete =
        probKeys.length === criteria.length &&
        (slotsComplete || valuesComplete);
      if (!complete) {
        const inSlots = probKeys.every((k) => slots.includes(k));
        const inValues = probKeys.every((k) => values.includes(k));
        if (!inSlots && !inValues) {
          const unknown = probKeys.find(
            (k) => !slots.includes(k) && !values.includes(k),
          );
          if (unknown !== undefined)
            throw new SystemOneProtocolError(
              `score answer "${id}" contains unexpected probability key "${unknown}"`,
            );
          throw new SystemOneProtocolError(
            `score answer "${id}" mixes rubric index and label probability keys`,
          );
        }
        const expected = inSlots ? slots : values;
        const missing = expected.find((k) => !Object.hasOwn(probs, k));
        if (missing === undefined)
          throw new SystemOneProtocolError(
            `score answer "${id}" mixes rubric index and label probability keys`,
          );
        throw new SystemOneProtocolError(
          `score answer "${id}" is missing probability for rubric level "${missing}"`,
        );
      }
      for (const k of probKeys) assertProb(probs[k], `${id}.${k}`);
      const legendKeys = Object.keys(a.legend as object);
      for (const k of probKeys) {
        if (!Object.hasOwn(a.legend, k))
          throw new SystemOneProtocolError(
            `score answer "${id}" is missing legend entry for rubric level "${k}"`,
          );
      }
      for (const k of legendKeys) {
        if (!Object.hasOwn(probs, k))
          throw new SystemOneProtocolError(
            `score answer "${id}" contains unexpected legend key "${k}"`,
          );
      }
      const max = criteria.length - 1;
      if (a.score < 0 || a.score > max)
        throw new SystemOneProtocolError(
          `score answer "${id}" has score ${a.score} outside valid rubric range 0..${max}`,
        );
      setOwnAnswer(answers, id, {
        type: "score",
        score: a.score,
        probabilities: a.probabilities,
        legend: a.legend,
        confidence: a.confidence,
      });
    }
  }
  const usage = normalizeUsage((r as Record<string, any>).usage);
  return {
    model: typeof r.model === "string" ? r.model : undefined,
    answers: answers as any,
    ...(usage ? { usage } : {}),
    requestId: typeof r.requestId === "string" ? r.requestId : undefined,
    metadata: { provider: providerId },
  };
}
