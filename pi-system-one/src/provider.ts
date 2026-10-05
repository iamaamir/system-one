import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import {
  HttpSystemOneProvider,
  type QuestionMap,
  type SystemOneCallOptions,
  type SystemOneProvider,
  type SystemOneRequest,
  type SystemOneResponse,
} from "system-one-core";
import {
  type SessionConfig,
  TYPESAFE_BASE_URL,
  TYPESAFE_MODEL,
} from "./config.ts";

export function isTypeSafeEndpoint(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return (
      url.origin === TYPESAFE_BASE_URL &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

class PiNativeProvider implements SystemOneProvider {
  readonly id = "pi-native";
  private readonly ctx: ExtensionToolContext;
  constructor(ctx: ExtensionToolContext) {
    this.ctx = ctx;
  }

  async evaluate<Q extends QuestionMap>(
    request: SystemOneRequest<Q>,
    options?: SystemOneCallOptions,
  ): Promise<SystemOneResponse<Q>> {
    const model = this.ctx.modelRegistry?.findOfType?.(
      "classifier",
      "typesafe",
      "jev-latest",
    );
    if (!model)
      throw new Error(
        "Pi classifier jev-latest unavailable. Use /so config to select TypeSafe HTTP instead.",
      );
    const questions: Record<string, unknown> = Object.create(null);
    for (const [id, question] of Object.entries(request.questions)) {
      if (question.type === "score")
        throw new Error(
          "Pi native classifier omits Score probabilities. Use /so config to select TypeSafe HTTP for Score questions.",
        );
      if (typeof question.instructions !== "string")
        throw new Error(
          "Pi native classifier requires string instructions. Use TypeSafe HTTP for structured instructions.",
        );
      if (question.type === "choice") {
        const criteria: Record<string, string> = Object.create(null);
        for (const [key, meaning] of Object.entries(question.criteria)) {
          if (meaning !== null && typeof meaning !== "string")
            throw new Error(
              "Pi native classifier requires string Choice criteria. Use TypeSafe HTTP for structured criteria.",
            );
          criteria[key] = meaning ?? key;
        }
        questions[id] = {
          type: "choice",
          instructions: question.instructions,
          criteria,
        };
      } else {
        const values = question.criteria;
        if (
          values &&
          (typeof values.true !== "string" || typeof values.false !== "string")
        )
          throw new Error(
            "Pi native classifier requires string yes/no criteria. Use TypeSafe HTTP for structured criteria.",
          );
        questions[id] = {
          type: "bool",
          instructions: question.instructions,
          criteria: {
            true: values?.true ?? "Yes",
            false: values?.false ?? "No",
          },
        };
      }
    }
    const state =
      typeof request.state === "object" &&
      request.state !== null &&
      !Array.isArray(request.state)
        ? request.state
        : { state: request.state };
    const result = await this.ctx.modelRegistry.classify(
      model,
      { state, questions } as never,
      { signal: options?.signal },
    );
    if (result.stopReason !== "stop")
      throw new Error(
        result.errorMessage ?? `Pi classifier ${result.stopReason}`,
      );
    const answers: Record<string, unknown> = Object.create(null);
    for (const [id, answer] of Object.entries(result.answers))
      answers[id] =
        answer.type === "bool"
          ? { type: "noul", noul: answer.probability }
          : answer;
    return {
      model: result.model,
      answers: answers as SystemOneResponse<Q>["answers"],
      usage: result.usage
        ? { inputTokens: result.usage.input, outputTokens: result.usage.output }
        : undefined,
      metadata: { provider: result.provider },
    };
  }
}

/** Resolve credentials at call time. Never forward Pi's TypeSafe key to a custom origin. */
export async function resolveSessionProvider(
  session: SessionConfig,
  ctx: ExtensionToolContext,
): Promise<SystemOneProvider> {
  if (session.mode === "native") return new PiNativeProvider(ctx);
  const config = session.current;
  if (!config.baseUrl)
    throw new Error("Custom endpoint missing. Run /so config.");
  const typeSafe = isTypeSafeEndpoint(config.baseUrl);
  const key =
    config.apiKey ??
    (typeSafe
      ? await ctx.modelRegistry?.getApiKeyForProvider?.("typesafe")
      : undefined);
  if (typeSafe && !key)
    throw new Error(
      "TypeSafe key missing. Run /login typesafe or set SYSTEM_ONE_API_KEY.",
    );
  return new HttpSystemOneProvider({
    id: typeSafe ? "typesafe" : "configured",
    baseUrl: config.baseUrl,
    apiKey: key,
    defaultModel: config.model ?? (typeSafe ? TYPESAFE_MODEL : undefined),
    timeoutMs: config.timeoutMs,
  });
}
