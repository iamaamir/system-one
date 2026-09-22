// biome-ignore-all lint/suspicious/noExplicitAny: intentional dynamic boundary over JSON protocol values
import {
  SystemOneHttpError,
  SystemOneTimeoutError,
  SystemOneTransportError,
} from "../errors.ts";
import type {
  SystemOneCallOptions,
  SystemOneProvider,
  SystemOneRequest,
} from "../provider.ts";
import type { QuestionMap } from "../questions.ts";
import type { SystemOneResponse } from "../responses.ts";
import { validateResponse } from "../validation.ts";
// retry: reserved for v0.2; v0.1 always behaves as 0 retries (no retry loop).
export interface RetryOptions {
  maxRetries?: number;
  retryOn?: number[];
}
export interface HttpSystemOneProviderOptions {
  id?: string;
  baseUrl: string;
  path?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  defaultModel?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  maxResponseBytes?: number;
  retry?: RetryOptions;
}
const DEFAULT_PATH = "/v1/systemone";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1_000_000;
export class HttpSystemOneProvider implements SystemOneProvider {
  readonly id: string;
  private readonly opts: Required<
    Pick<
      HttpSystemOneProviderOptions,
      "baseUrl" | "path" | "timeoutMs" | "maxResponseBytes"
    >
  > &
    HttpSystemOneProviderOptions;
  constructor(options: HttpSystemOneProviderOptions) {
    if (!options?.baseUrl) throw new Error("baseUrl is required");
    this.id = options.id ?? "http";
    this.opts = {
      ...options,
      baseUrl: options.baseUrl.replace(/\/$/, ""),
      path: options.path ?? DEFAULT_PATH,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxResponseBytes: options.maxResponseBytes ?? DEFAULT_MAX_BYTES,
    };
  }
  async evaluate<Q extends QuestionMap>(
    request: SystemOneRequest<Q>,
    options?: SystemOneCallOptions,
  ): Promise<SystemOneResponse<Q>> {
    const started = Date.now();
    const fetchFn = this.opts.fetch ?? globalThis.fetch;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.opts.timeoutMs);
    (timer as any)?.unref?.();
    if (options?.signal) {
      if (options.signal.aborted) controller.abort();
      else
        options.signal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
    }
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...this.opts.headers,
      };
      if (this.opts.apiKey)
        headers.Authorization = `Bearer ${this.opts.apiKey}`;
      const model = options?.model ?? request.model ?? this.opts.defaultModel;
      let res: Response;
      try {
        res = await fetchFn(`${this.opts.baseUrl}${this.opts.path}`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            state: request.state,
            questions: request.questions,
            ...(model ? { model } : {}),
          }),
          signal: controller.signal,
        });
      } catch (e: any) {
        if (e?.name === "AbortError") {
          if (timedOut)
            throw new SystemOneTimeoutError(
              `request timed out after ${this.opts.timeoutMs}ms`,
            );
          throw new SystemOneTransportError("request aborted", { cause: e });
        }
        throw new SystemOneTransportError(e?.message ?? "transport failure", {
          cause: e,
        });
      }
      if (!res.ok) {
        throw new SystemOneHttpError(`provider error ${res.status}`, {
          status: res.status,
          provider: this.id,
          requestId:
            res.headers.get("x-request-id") ??
            res.headers.get("x-typesafe-request-id") ??
            undefined,
        });
      }
      const text = await res.text();
      if (text.length > this.opts.maxResponseBytes)
        throw new SystemOneHttpError("response too large", {
          status: 200,
          provider: this.id,
        });
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new SystemOneHttpError("invalid JSON", {
          status: 200,
          provider: this.id,
        });
      }
      const out = validateResponse(request.questions, json, this.id);
      out.requestId ??=
        res.headers.get("x-request-id") ??
        res.headers.get("x-typesafe-request-id") ??
        undefined;
      out.metadata.latencyMs = Date.now() - started;
      return out;
    } finally {
      clearTimeout(timer);
    }
  }
}
