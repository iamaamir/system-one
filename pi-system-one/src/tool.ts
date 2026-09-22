// biome-ignore-all lint/suspicious/noExplicitAny: intentional dynamic boundary over JSON protocol values
// pi-system-one/src/tool.ts

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { SystemOne, type SystemOneProvider } from "system-one-core";
import type { Static } from "typebox";
import { Type } from "typebox";
import { renderSystemOneResult } from "./render.ts";

const ChoiceQ = Type.Object({
  type: Type.Literal("choice"),
  instructions: Type.Any(),
  criteria: Type.Record(Type.String(), Type.Union([Type.Any(), Type.Null()])),
});
const NoulQ = Type.Object({
  type: Type.Literal("noul"),
  instructions: Type.Any(),
  criteria: Type.Optional(
    Type.Record(Type.String(), Type.Union([Type.Any(), Type.Null()])),
  ),
});
const ScoreQ = Type.Object({
  type: Type.Literal("score"),
  instructions: Type.Any(),
  criteria: Type.Array(Type.Any()),
});
export const systemOneParams = Type.Object({
  state: Type.Union([
    Type.String(),
    Type.Record(Type.String(), Type.Any()),
    Type.Array(Type.Any()),
  ]),
  questions: Type.Record(Type.String(), Type.Union([ChoiceQ, NoulQ, ScoreQ])),
  model: Type.Optional(Type.String()),
});
export type SystemOneParams = Static<typeof systemOneParams>;

export interface SystemOneDetails {
  answers: Record<string, unknown>;
  model?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  metadata: { provider: string; latencyMs?: number };
}

export function buildSystemOneTool(deps: { provider: SystemOneProvider }) {
  const systemOne = new SystemOne({ provider: deps.provider });
  const tool: ToolDefinition<typeof systemOneParams, SystemOneDetails> = {
    name: "system_one",
    label: "System One",
    description:
      "Evaluate one or more bounded decision questions against shared state using the configured System One provider. " +
      "Use this when the answer space is known and a fast probabilistic decision is preferable to generating free-form text. " +
      "Multiple independent choice, noul, and score questions should be batched into one call when they share the same state.",
    parameters: systemOneParams,
    async execute(toolCallId, params, signal, _onUpdate, _ctx) {
      void toolCallId;
      // Throw on failure per Pi contract — never encode errors in content.
      // Safe to propagate unwrapped: core error messages/codes never contain secrets.
      const response = await systemOne.evaluate(
        {
          state: params.state as any,
          questions: params.questions as any,
          ...(params.model ? { model: params.model } : {}),
        },
        { signal },
      );
      const text = renderSystemOneResult(response as any);
      return {
        content: [{ type: "text" as const, text }],
        details: {
          answers: response.answers,
          model: response.model,
          usage: response.usage,
          metadata: response.metadata,
        },
      };
    },
  };
  return tool;
}
