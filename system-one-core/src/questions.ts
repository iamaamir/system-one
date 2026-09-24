import type { JsonValue } from "./types.ts";

export interface NoulQuestion {
  readonly type: "noul";
  readonly instructions: JsonValue;
  readonly criteria?: Readonly<Record<string, JsonValue | null>>;
}

export interface ChoiceQuestion<
  T extends Readonly<Record<string, JsonValue | null>> = Readonly<
    Record<string, JsonValue | null>
  >,
> {
  readonly type: "choice";
  readonly instructions: JsonValue;
  readonly criteria: Readonly<T>;
}

export interface ScoreQuestion<
  T extends readonly JsonValue[] = readonly JsonValue[],
> {
  readonly type: "score";
  readonly instructions: JsonValue;
  readonly criteria: Readonly<T>;
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type QuestionMap = Readonly<Record<string, Question>>;
export type ReadonlyQuestion = Question;
export type ReadonlyQuestionMap<Q extends QuestionMap = QuestionMap> = {
  readonly [K in keyof Q]: Readonly<Q[K]> & ReadonlyQuestion;
};

export function noul(
  instructions: JsonValue,
  criteria?: Readonly<Record<string, JsonValue | null>>,
): NoulQuestion {
  return criteria
    ? { type: "noul", instructions, criteria }
    : { type: "noul", instructions };
}

export function choice<
  const T extends Readonly<Record<string, JsonValue | null>>,
>(instructions: JsonValue, criteria: T): ChoiceQuestion<T> {
  return { type: "choice", instructions, criteria };
}

export function score<const T extends readonly JsonValue[]>(
  instructions: JsonValue,
  criteria: T,
): ScoreQuestion<T> {
  return { type: "score", instructions, criteria };
}
