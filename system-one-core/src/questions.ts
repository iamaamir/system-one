// biome-ignore-all lint/suspicious/noExplicitAny: intentional dynamic boundary over JSON protocol values
import type { JsonValue } from "./types.ts";
export interface NoulQuestion {
  type: "noul";
  instructions: JsonValue;
  criteria?: Record<string, JsonValue | null>;
}
export interface ChoiceQuestion<
  T extends Record<string, JsonValue | null> = Record<string, JsonValue | null>,
> {
  type: "choice";
  instructions: JsonValue;
  criteria: T;
}
export interface ScoreQuestion<
  T extends readonly JsonValue[] = readonly JsonValue[],
> {
  type: "score";
  instructions: JsonValue;
  criteria: T;
}
export type Question = NoulQuestion | ChoiceQuestion<any> | ScoreQuestion<any>;
export type QuestionMap = Record<string, Question>;
export function noul(
  instructions: JsonValue,
  criteria?: Record<string, JsonValue | null>,
): NoulQuestion {
  return criteria
    ? { type: "noul", instructions, criteria }
    : { type: "noul", instructions };
}
export function choice<const T extends Record<string, JsonValue | null>>(
  instructions: JsonValue,
  criteria: T,
): ChoiceQuestion<T> {
  return { type: "choice", instructions, criteria };
}
export function score<const T extends readonly JsonValue[]>(
  instructions: JsonValue,
  criteria: T,
): ScoreQuestion<T> {
  return { type: "score", instructions, criteria };
}
