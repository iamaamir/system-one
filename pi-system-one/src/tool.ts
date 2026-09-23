import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  SystemOne,
  type QuestionMap,
  type SystemOneProvider,
  type SystemOneState,
} from "system-one-core";
import type { Static } from "typebox";
import { Type } from "typebox";
import { renderSystemOneResult } from "./render.ts";

/**
 * JSON value accepted by System One.
 *
 * Arrays/objects use Type.Any() recursively because tool arguments already
 * cross a JSON boundary. Keeping the schema non-recursive also tends to be
 * easier for tool-calling models to consume.
 */
const JsonValue = Type.Union(
  [
    Type.String(),
    Type.Number(),
    Type.Boolean(),
    Type.Null(),
    Type.Array(Type.Any()),
    Type.Record(Type.String(), Type.Any()),
  ],
  {
    description: "A JSON value: string, number, boolean, null, object, or array.",
  },
);

const ChoiceQ = Type.Object(
  {
    type: Type.Literal("choice", {
      description: "Select exactly one outcome from a bounded set.",
    }),

    instructions: JsonValue,

    criteria: Type.Record(Type.String(), JsonValue, {
      minProperties: 1,
      description:
        "Available choices keyed by choice label. Each value describes that choice; use null when the label is self-explanatory. The keys are the choices; do not provide a separate options field.",
    }),
  },
  {
    additionalProperties: false,
    description:
      "A closed-set categorical decision. The keys of criteria are the available choices.",
  },
);

const NoulCriteria = Type.Object(
  {
    true: Type.Optional(JsonValue),
    false: Type.Optional(JsonValue),
  },
  {
    additionalProperties: false,
    minProperties: 1,
    description:
      "Optional descriptions of the true/yes and false/no outcomes.",
  },
);

const NoulQ = Type.Object(
  {
    type: Type.Literal("noul", {
      description: "Estimate the likelihood of a yes/true outcome.",
    }),

    instructions: JsonValue,

    criteria: Type.Optional(NoulCriteria),
  },
  {
    additionalProperties: false,
    description:
      "A probabilistic yes/no judgment. Omit criteria unless the true or false outcomes need clarification.",
  },
);

const ScoreQ = Type.Object(
  {
    type: Type.Literal("score", {
      description: "Score the state against an ordered rubric.",
    }),

    instructions: JsonValue,

    criteria: Type.Array(JsonValue, {
      minItems: 2,
      description:
        "Ordered score levels from lowest to highest. Each array item defines one level of the rubric.",
    }),
  },
  {
    additionalProperties: false,
    description:
      "An ordered rubric decision. Criteria are ordered from lowest to highest.",
  },
);

const Question = Type.Union([ChoiceQ, NoulQ, ScoreQ]);

export const systemOneParams = Type.Object(
  {
    state: Type.Union(
      [
        Type.String(),
        Type.Number(),
        Type.Boolean(),
        Type.Null(),
        Type.Record(Type.String(), Type.Any()),
        Type.Array(Type.Any()),
      ],
      {
        description:
          "Shared state or evidence that all questions should be evaluated against.",
      },
    ),

    questions: Type.Record(Type.String(), Question, {
      minProperties: 1,
      description:
        "One or more named decision questions. Questions sharing the same state should be sent together.",
    }),
  },
  {
    additionalProperties: false,
    description:
      "Evaluate bounded decision questions against shared state.",
  },
);

export type SystemOneParams = Static<typeof systemOneParams>;

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
      "Evaluate bounded choice, yes/no likelihood, and ordered score questions against shared state. " +
      "Use this when the possible outcomes or scoring rubric are known and structured probabilistic results are useful. " +
      "Do not use it for open-ended text generation. " +
      "Questions that share the same state can be evaluated together in one call.",

    parameters: systemOneParams,

    promptSnippet:
      "Evaluate bounded choices, yes/no likelihoods, and ordered scores from shared state",

    promptGuidelines: [
      "Use system_one for closed-set classification, probabilistic yes/no judgments, or ordered rubric scoring.",
      "Do not use system_one for open-ended text generation or when there is no bounded answer space or rubric.",
      "Preserve user-specified choice labels, criteria, and score levels instead of inventing replacements.",
      "For choice questions, the keys of criteria are the available choices; never add a separate options field.",
      "For self-explanatory choice labels, prefer null criteria values instead of inventing definitions that could bias the decision.",
      "For noul questions, omit criteria unless the true/yes or false/no outcomes need clarification.",
      "For score questions, criteria must contain at least two ordered levels from lowest to highest.",
      "Batch independent questions into one system_one call when they share the same state.",
    ],

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      /*
       * The LLM-facing TypeBox schema is intentionally separate from the
       * provider protocol types. Cast only at this boundary instead of
       * spreading `any` throughout the implementation.
       */
      const response = await systemOne.evaluate(
        {
          state: params.state as SystemOneState,
          questions: params.questions as QuestionMap,
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
