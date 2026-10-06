import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import {
  type QuestionMap,
  type SystemOneCallOptions,
  SystemOneHttpError,
  type SystemOneProvider,
  type SystemOneRequest,
  type SystemOneResponse,
  SystemOneTimeoutError,
  SystemOneTransportError,
} from "system-one-core";
import { type SessionConfig, TYPESAFE_BASE_URL } from "./config.ts";
import {
  type NativeFailureCategory,
  PiNativeDiagnosticError,
  type RouteObserver,
  resolveSessionProvider,
} from "./provider.ts";

const SAFE_PATH_SEGMENTS = new Set([
  "api",
  "v1",
  "v2",
  "systemone",
  "system-one",
  "classify",
]);

/** Mirror HTTP provider's POST target, but never retain userinfo, query, fragment, or arbitrary path segments. */
export function safeRequestTarget(baseUrl: string): string {
  try {
    // HttpSystemOneProvider appends /v1/systemone after trimming one trailing slash.
    const url = new URL(`${baseUrl.replace(/\/$/, "")}/v1/systemone`);
    if (url.protocol !== "https:" && url.protocol !== "http:")
      return "POST invalid HTTP endpoint";
    const path = url.pathname
      .split("/")
      .map((segment) =>
        SAFE_PATH_SEGMENTS.has(segment) ? segment : segment ? "[redacted]" : "",
      )
      .join("/");
    const note =
      url.search || url.hash
        ? " (base URL contains query/fragment; check path)"
        : "";
    return `POST ${url.origin}${path}${note}`;
  } catch {
    return "POST invalid HTTP endpoint";
  }
}

export interface DebugEntry {
  startedAt: string;
  mode: SessionConfig["mode"];
  provider: "pi-native" | "typesafe" | "configured" | "not selected";
  reason: string;
  requestTarget?: string;
  outcome: "pending" | "success" | "failure";
  attempted: boolean;
  durationMs?: number;
  failure?:
    | NativeFailureCategory
    | "HTTP error"
    | "timeout"
    | "transport error"
    | "request failed";
  httpStatus?: number;
  questions: { choice: number; noul: number; score: number };
}

/** Bounded, in-memory diagnostics. Never retain input, credentials, raw URLs or raw errors. */
export class DebugHistory {
  readonly entries: DebugEntry[] = [];

  clear(): void {
    this.entries.length = 0;
  }

  start(mode: SessionConfig["mode"], questions: QuestionMap): DebugEntry {
    const counts = { choice: 0, noul: 0, score: 0 };
    for (const question of Object.values(questions)) counts[question.type]++;
    const entry: DebugEntry = {
      startedAt: new Date().toISOString(),
      mode,
      provider: "not selected",
      reason: "route not selected",
      outcome: "pending",
      attempted: false,
      questions: counts,
    };
    this.entries.unshift(entry);
    if (this.entries.length > 20) this.entries.length = 20;
    return entry;
  }
}

export function observedProvider(
  session: SessionConfig,
  ctx: ExtensionToolContext,
  history: DebugHistory,
): SystemOneProvider {
  return {
    id: "diagnostic-wrapper",
    async evaluate<Q extends QuestionMap>(
      request: SystemOneRequest<Q>,
      options?: SystemOneCallOptions,
    ): Promise<SystemOneResponse<Q>> {
      const entry = history.start(session.mode, request.questions);
      const started = Date.now();
      const onRoute: RouteObserver = (provider, reason) => {
        entry.provider = provider;
        entry.reason = reason;
        if (provider !== "pi-native")
          entry.requestTarget = safeRequestTarget(
            provider === "typesafe"
              ? TYPESAFE_BASE_URL
              : session.current.baseUrl,
          );
      };
      try {
        const provider = await resolveSessionProvider(
          session,
          ctx,
          onRoute,
          () => {
            entry.attempted = true;
          },
        );
        if (provider.id === "typesafe" || provider.id === "configured")
          entry.attempted = true;
        const response = await provider.evaluate(request, options);
        entry.outcome = "success";
        return response;
      } catch (error) {
        entry.outcome = "failure";
        entry.failure =
          error instanceof PiNativeDiagnosticError
            ? error.category
            : error instanceof SystemOneHttpError
              ? "HTTP error"
              : error instanceof SystemOneTimeoutError
                ? "timeout"
                : error instanceof SystemOneTransportError
                  ? "transport error"
                  : "request failed";
        if (
          error instanceof SystemOneHttpError &&
          Number.isInteger(error.status) &&
          error.status >= 100 &&
          error.status <= 599
        )
          entry.httpStatus = error.status;
        throw error;
      } finally {
        entry.durationMs = Math.max(0, Date.now() - started);
      }
    },
  };
}
