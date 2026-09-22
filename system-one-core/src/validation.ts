// biome-ignore-all lint/suspicious/noExplicitAny: intentional dynamic boundary over JSON protocol values
import { SystemOneProtocolError } from "./errors.ts";
import type { QuestionMap } from "./questions.ts";
import type { SystemOneResponse } from "./responses.ts";

function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}
function assertProb(n: unknown, what: string): void {
  if (!isFiniteNum(n) || n < 0 || n > 1)
    throw new SystemOneProtocolError(`invalid probability for ${what}`);
}
function asCount(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
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
  questions: Q,
  raw: unknown,
  providerId: string,
): SystemOneResponse<Q> {
  if (!raw || typeof raw !== "object")
    throw new SystemOneProtocolError("response is not an object");
  const r = raw as Record<string, any>;
  if (!r.answers || typeof r.answers !== "object")
    throw new SystemOneProtocolError("missing answers");
  const answers: Record<string, any> = {};
  for (const [id, q] of Object.entries(questions)) {
    const a = r.answers[id];
    if (!a || typeof a !== "object")
      throw new SystemOneProtocolError(`missing answer for ${id}`);
    if (a.type !== (q as any).type)
      throw new SystemOneProtocolError(`wrong answer type for ${id}`);
    if (q.type === "noul") {
      if (!isFiniteNum(a.noul) || a.noul < 0 || a.noul > 1)
        throw new SystemOneProtocolError(`invalid noul for ${id}`);
      answers[id] = { type: "noul", noul: a.noul };
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
      answers[id] = {
        type: "choice",
        choice: a.choice,
        probabilities: a.probabilities,
        confidence: a.confidence,
      };
    } else {
      // Score keys come in two conventions (both seen live): index slots
      // ("0".."n-1") or criteria values. Accept either, reject anything else.
      const criteria = (q as any).criteria as readonly unknown[];
      const slots = criteria.map((_, i) => String(i));
      const values = criteria.map((c) => String(c));
      const keyOk = (k: string) => slots.includes(k) || values.includes(k);
      if (!isFiniteNum(a.score))
        throw new SystemOneProtocolError(`invalid score for ${id}`);
      if (!isFiniteNum(a.confidence) || a.confidence < 0 || a.confidence > 1)
        throw new SystemOneProtocolError(`invalid confidence for ${id}`);
      if (!a.legend || typeof a.legend !== "object")
        throw new SystemOneProtocolError(`missing legend for ${id}`);
      const legendKeys = Object.keys(a.legend as object);
      const legendOk =
        slots.every((s) => legendKeys.includes(s)) ||
        values.every((v) => legendKeys.includes(v));
      if (!legendOk)
        throw new SystemOneProtocolError(`incomplete legend for ${id}`);
      if (!a.probabilities || typeof a.probabilities !== "object")
        throw new SystemOneProtocolError(`missing probabilities for ${id}`);
      for (const k of Object.keys(a.probabilities)) {
        if (!keyOk(k))
          throw new SystemOneProtocolError(
            `unknown probability key for ${id}.${k}`,
          );
        assertProb((a.probabilities as any)[k], `${id}.${k}`);
      }
      answers[id] = {
        type: "score",
        score: a.score,
        probabilities: a.probabilities,
        legend: a.legend,
        confidence: a.confidence,
      };
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
