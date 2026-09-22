export interface NoulAnswer { type: "noul"; noul: number; }
export interface ChoiceAnswer<TChoice extends string = string> {
  type: "choice"; choice: TChoice; probabilities: Record<TChoice, number>; confidence: number;
}
export interface ScoreAnswer {
  type: "score"; score: number; probabilities: Record<string, number>;
  legend: Record<string, unknown>; confidence: number;
}
export type Answer = NoulAnswer | ChoiceAnswer<any> | ScoreAnswer;
export type AnswerFor<Q> = Q extends import("./questions.ts").NoulQuestion ? NoulAnswer
  : Q extends { type: "choice"; criteria: infer C } ? ChoiceAnswer<Extract<keyof C, string>>
  : Q extends import("./questions.ts").ScoreQuestion<any> ? ScoreAnswer : never;
export type AnswersFor<Q extends import("./questions.ts").QuestionMap> = { [K in keyof Q]: AnswerFor<Q[K]> };
export interface SystemOneResponse<Q extends import("./questions.ts").QuestionMap = import("./questions.ts").QuestionMap> {
  model?: string;
  answers: AnswersFor<Q>;
  usage?: { inputTokens?: number; outputTokens?: number };
  requestId?: string;
  metadata: { provider: string; latencyMs?: number };
}
