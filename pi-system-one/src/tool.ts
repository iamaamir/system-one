// pi-system-one/src/tool.ts
import { Type } from "typebox";
import type { Static } from "typebox";
import { SystemOne, type SystemOneProvider } from "system-one-core";
import { renderSystemOneResult } from "./render.ts";

const ChoiceQ = Type.Object({
  type: Type.Literal("choice"),
  instructions: Type.Any(),
  criteria: Type.Record(Type.String(), Type.Union([Type.Any(), Type.Null()])),
});
const NoulQ = Type.Object({
  type: Type.Literal("noul"),
  instructions: Type.Any(),
  criteria: Type.Optional(Type.Record(Type.String(), Type.Union([Type.Any(), Type.Null()]))),
});
const ScoreQ = Type.Object({
  type: Type.Literal("score"),
  instructions: Type.Any(),
  criteria: Type.Array(Type.Any()),
});
export const systemOneParams = Type.Object({
  state: Type.Union([Type.String(), Type.Record(Type.String(), Type.Any()), Type.Array(Type.Any())]),
  questions: Type.Record(Type.String(), Type.Union([ChoiceQ, NoulQ, ScoreQ])),
  model: Type.Optional(Type.String()),
});
export type SystemOneParams = Static<typeof systemOneParams>;

export function buildSystemOneTool(deps: { provider: SystemOneProvider }) {
  const systemOne = new SystemOne({ provider: deps.provider });
  return {
    name: "system_one",
    label: "System One",
    description:
      "Evaluate one or more bounded decision questions against shared state using the configured System One provider. " +
      "Use this when the answer space is known and a fast probabilistic decision is preferable to generating free-form text. " +
      "Multiple independent choice, noul, and score questions should be batched into one call when they share the same state.",
    parameters: systemOneParams,
    async execute(_toolCallId: string, params: SystemOneParams, signal: AbortSignal | undefined) {
      // Throw on failure per Pi contract — never encode errors in content.
      // Safe to propagate unwrapped: core error messages/codes never contain secrets.
      const response = await systemOne.evaluate(
        { state: params.state as any, questions: params.questions as any, ...(params.model ? { model: params.model } : {}) },
        { signal }
      );
      const text = renderSystemOneResult(response as any);
      return { content: [{ type: "text", text }], details: { answers: response.answers, model: response.model, usage: response.usage } };
    },
  };
}
