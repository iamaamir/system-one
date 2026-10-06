import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import {
  HttpSystemOneProvider,
  type QuestionMap,
  type SystemOneCallOptions,
  type SystemOneProvider,
  type SystemOneRequest,
  type SystemOneResponse,
  validateResponse,
} from "system-one-core";
import {
  isTypeSafeEndpoint,
  type SessionConfig,
  TYPESAFE_BASE_URL,
  TYPESAFE_MODEL,
} from "./config.ts";

export type NativeFailureCategory =
  | "native model unavailable"
  | "native Score unsupported"
  | "native input incompatible"
  | "native classify threw"
  | "native classifier returned error"
  | "invalid native response"
  | "native request aborted";

/** Fixed diagnostic category only; never include Pi/provider error text. */
export class PiNativeDiagnosticError extends Error {
  readonly category: NativeFailureCategory;
  constructor(category: NativeFailureCategory, message: string) {
    super(message);
    this.category = category;
  }
}

function nativeFailure(
  category: NativeFailureCategory,
  aborted: boolean,
): PiNativeDiagnosticError {
  return new PiNativeDiagnosticError(
    aborted ? "native request aborted" : category,
    aborted
      ? "Pi native classifier request aborted."
      : "Pi native classifier failed. Check /login typesafe and Pi logs.",
  );
}

class PiNativeProvider implements SystemOneProvider {
  readonly id = "pi-native";
  private readonly ctx: ExtensionToolContext;
  private readonly timeoutMs: number;
  private readonly onDispatch?: () => void;
  constructor(
    ctx: ExtensionToolContext,
    timeoutMs: number,
    onDispatch?: () => void,
  ) {
    this.ctx = ctx;
    this.timeoutMs = timeoutMs;
    this.onDispatch = onDispatch;
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
      throw new PiNativeDiagnosticError(
        "native model unavailable",
        "Pi classifier jev-latest unavailable. Use /so config to select TypeSafe HTTP instead.",
      );
    const questions: Record<string, unknown> = Object.create(null);
    for (const [id, question] of Object.entries(request.questions)) {
      if (question.type === "score")
        throw new PiNativeDiagnosticError(
          "native Score unsupported",
          "Pi native classifier omits Score probabilities. Use /so config to select TypeSafe HTTP for Score questions.",
        );
      if (typeof question.instructions !== "string")
        throw new PiNativeDiagnosticError(
          "native input incompatible",
          "Pi native classifier requires string instructions. Use TypeSafe HTTP for structured instructions.",
        );
      if (question.type === "choice") {
        const criteria: Record<string, string> = Object.create(null);
        for (const [key, meaning] of Object.entries(question.criteria)) {
          if (meaning !== null && typeof meaning !== "string")
            throw new PiNativeDiagnosticError(
              "native input incompatible",
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
          throw new PiNativeDiagnosticError(
            "native input incompatible",
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
    let result: Awaited<
      ReturnType<ExtensionToolContext["modelRegistry"]["classify"]>
    >;
    try {
      this.onDispatch?.();
      result = await this.ctx.modelRegistry.classify(
        model,
        { state, questions } as never,
        { signal: options?.signal, timeoutMs: this.timeoutMs },
      );
    } catch {
      // Pi and its provider may include untrusted response bodies in errors.
      throw nativeFailure(
        "native classify threw",
        options?.signal?.aborted === true,
      );
    }
    if (result.stopReason !== "stop")
      throw nativeFailure(
        "native classifier returned error",
        result.stopReason === "aborted" || options?.signal?.aborted === true,
      );
    try {
      const answers: Record<string, unknown> = Object.create(null);
      for (const [id, answer] of Object.entries(result.answers))
        answers[id] =
          answer.type === "bool"
            ? { type: "noul", noul: answer.probability }
            : answer;
      return validateResponse(
        request.questions,
        {
          model: result.model,
          answers,
          usage: result.usage
            ? {
                inputTokens: result.usage.input,
                outputTokens: result.usage.output,
              }
            : undefined,
        },
        this.id,
      );
    } catch {
      // Core validation can quote provider-controlled values; hide its detail.
      throw nativeFailure("invalid native response", false);
    }
  }
}

function supportsNative(request: SystemOneRequest<QuestionMap>): boolean {
  return Object.values(request.questions).every((question) => {
    if (question.type === "score" || typeof question.instructions !== "string")
      return false;
    if (question.type === "choice")
      return Object.values(question.criteria).every(
        (value) => value === null || typeof value === "string",
      );
    return (
      !question.criteria ||
      (Object.keys(question.criteria).every(
        (key) => key === "true" || key === "false",
      ) &&
        typeof question.criteria.true === "string" &&
        typeof question.criteria.false === "string")
    );
  });
}

export type RouteObserver = (
  provider: "pi-native" | "typesafe" | "configured",
  reason:
    | "compatible request"
    | "contains Score"
    | "native-incompatible input"
    | "classifier unavailable"
    | "selected mode",
) => void;

class AutoSystemOneProvider implements SystemOneProvider {
  readonly id = "auto";
  private readonly session: SessionConfig;
  private readonly ctx: ExtensionToolContext;
  private readonly onRoute?: RouteObserver;
  private readonly onDispatch?: () => void;
  constructor(
    session: SessionConfig,
    ctx: ExtensionToolContext,
    onRoute?: RouteObserver,
    onDispatch?: () => void,
  ) {
    this.session = session;
    this.ctx = ctx;
    this.onRoute = onRoute;
    this.onDispatch = onDispatch;
  }

  async evaluate<Q extends QuestionMap>(
    request: SystemOneRequest<Q>,
    options?: SystemOneCallOptions,
  ): Promise<SystemOneResponse<Q>> {
    const compatible = supportsNative(request);
    if (
      compatible &&
      this.ctx.modelRegistry?.findOfType?.(
        "classifier",
        "typesafe",
        "jev-latest",
      )
    ) {
      this.onRoute?.("pi-native", "compatible request");
      return new PiNativeProvider(
        this.ctx,
        this.session.current.timeoutMs,
        this.onDispatch,
      ).evaluate(request, options);
    }
    this.onRoute?.(
      "typesafe",
      compatible
        ? "classifier unavailable"
        : Object.values(request.questions).some(
              (question) => question.type === "score",
            )
          ? "contains Score"
          : "native-incompatible input",
    );
    const http = await resolveSessionProvider(
      {
        ...this.session,
        mode: "typesafe",
        current: {
          ...this.session.current,
          baseUrl: TYPESAFE_BASE_URL,
          model: TYPESAFE_MODEL,
        },
      },
      this.ctx,
    );
    this.onDispatch?.();
    return http.evaluate(request, options);
  }
}

/** Resolve credentials at call time. Never forward Pi's TypeSafe key to a custom origin. */
export async function resolveSessionProvider(
  session: SessionConfig,
  ctx: ExtensionToolContext,
  onRoute?: RouteObserver,
  onDispatch?: () => void,
): Promise<SystemOneProvider> {
  if (session.mode === "native") {
    onRoute?.("pi-native", "selected mode");
    return new PiNativeProvider(ctx, session.current.timeoutMs, onDispatch);
  }
  if (session.mode === "auto")
    return new AutoSystemOneProvider(session, ctx, onRoute, onDispatch);
  const config = session.current;
  if (!config.baseUrl)
    throw new Error("Custom endpoint missing. Run /so config.");
  const typeSafe = isTypeSafeEndpoint(config.baseUrl);
  onRoute?.(typeSafe ? "typesafe" : "configured", "selected mode");
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
