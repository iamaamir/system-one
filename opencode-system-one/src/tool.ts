import { tool } from "@opencode-ai/plugin";
import {
  type QuestionMap,
  SystemOne,
  type SystemOneProvider,
  type SystemOneState,
} from "system-one-core";
import { renderSystemOneResult } from "./render.ts";

const questionInstructions = tool.schema
  .json()
  .describe("The bounded question to evaluate.");

const choiceQuestion = tool.schema
  .object({
    type: tool.schema.literal("choice"),
    instructions: questionInstructions,
    criteria: tool.schema
      .record(tool.schema.string(), tool.schema.json().nullable())
      .describe("Available choices keyed by their exact labels."),
  })
  .strict();

const noulQuestion = tool.schema
  .object({
    type: tool.schema.literal("noul"),
    instructions: questionInstructions,
    criteria: tool.schema
      .record(tool.schema.string(), tool.schema.json().nullable())
      .optional()
      .describe("Optional descriptions of the true and false outcomes."),
  })
  .strict();

const scoreQuestion = tool.schema
  .object({
    type: tool.schema.literal("score"),
    instructions: questionInstructions,
    criteria: tool.schema
      .array(tool.schema.json())
      .min(2)
      .describe("Ordered rubric levels from lowest to highest."),
  })
  .strict();

const question = tool.schema.discriminatedUnion("type", [
  choiceQuestion,
  noulQuestion,
  scoreQuestion,
]);

export const systemOneParams = tool.schema
  .object({
    state: tool.schema
      .json()
      .describe("Shared JSON evidence or context under judgment."),
    questions: tool.schema
      .record(tool.schema.string(), question)
      .refine((value) => Object.keys(value).length > 0, {
        message: "At least one named question is required.",
      })
      .describe("One or more named bounded decision questions."),
  })
  .strict()
  .describe("Evaluate bounded decisions against supplied state.");

export function buildSystemOneTool(provider: SystemOneProvider) {
  const systemOne = new SystemOne({ provider });

  return tool({
    description:
      "Evaluate bounded choice, yes/no, and ordered-scale decisions over supplied state using a dedicated System One provider. Batch independent questions that share state. Do not use this tool for factual lookup, browsing, or open-ended text generation.",
    args: systemOneParams.shape,
    async execute(args, context) {
      const parsedArgs = systemOneParams.parse(args);
      const response = await systemOne.evaluate(
        {
          state: parsedArgs.state as SystemOneState,
          questions: parsedArgs.questions as QuestionMap,
        },
        { signal: context.abort },
      );
      return renderSystemOneResult(response);
    },
  });
}
