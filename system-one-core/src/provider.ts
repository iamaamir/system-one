import type { QuestionMap, ReadonlyQuestionMap } from "./questions.ts";
import type { SystemOneResponse } from "./responses.ts";
import type { SystemOneState } from "./types.ts";
export interface SystemOneRequest<Q extends QuestionMap = QuestionMap> {
  readonly state: SystemOneState;
  readonly questions: ReadonlyQuestionMap<Q>;
  readonly model?: string;
}
export interface SystemOneCallOptions {
  signal?: AbortSignal;
  model?: string;
}
export interface SystemOneCapabilities {
  questionTypes?: Array<"choice" | "noul" | "score">;
  batching?: boolean;
  structuredState?: boolean;
  multimodal?: boolean | "unknown";
  limits?: {
    maxQuestions?: number;
    maxChoiceOptions?: number;
    maxStateBytes?: number;
  };
}
export interface SystemOneProvider {
  readonly id: string;
  evaluate<Q extends QuestionMap>(
    request: SystemOneRequest<Q>,
    options?: SystemOneCallOptions,
  ): Promise<SystemOneResponse<Q>>;
  capabilities?(): SystemOneCapabilities | Promise<SystemOneCapabilities>;
}
