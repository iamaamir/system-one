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

type ReadonlyNoulQuestion = {
  readonly type: "noul";
  readonly instructions: JsonValue;
  readonly criteria?: Readonly<Record<string, JsonValue | null>>;
};
type ReadonlyChoiceQuestion<T extends Record<string, JsonValue | null>> = {
  readonly type: "choice";
  readonly instructions: JsonValue;
  readonly criteria: Readonly<T>;
};
type ReadonlyScoreQuestion<T extends readonly JsonValue[]> = {
  readonly type: "score";
  readonly instructions: JsonValue;
  readonly criteria: Readonly<T>;
};
type ReadonlyQuestionFields<T extends Question> = {
  readonly [P in keyof T]: P extends "criteria" ? Readonly<T[P]> : T[P];
};
export type ReadonlyQuestion<T extends Question = Question> =
  ReadonlyQuestionFields<T> &
    (T extends ChoiceQuestion<infer C>
      ? ReadonlyChoiceQuestion<C>
      : T extends ScoreQuestion<infer C>
        ? ReadonlyScoreQuestion<C>
        : ReadonlyNoulQuestion);
export type ReadonlyQuestionMap<Q extends QuestionMap = QuestionMap> = {
  readonly [K in keyof Q]: ReadonlyQuestion<Q[K]>;
};

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
