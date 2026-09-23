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
/** Upper bound for error-body buffering on non-OK responses. */
const MAX_ERROR_BODY_BYTES = 2048;
/**
 * Read at most `maxBytes` of a response body for error diagnostics. The
 * success path enforces `maxResponseBytes`; error bodies need the same
 * bound so a misconfigured backend returning megabytes of HTML/trace on
 * 4xx/5xx is never fully buffered. Never throws: failures yield "".
 */
async function readBoundedBody(
  res: Response,
  maxBytes: number,
): Promise<string> {
  try {
    const reader = res.body?.getReader();
    if (!reader) return (await res.text()).slice(0, maxBytes);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        chunks.push(
          value.slice(0, Math.max(0, value.byteLength - (bytes - maxBytes))),
        );
        break;
      }
      chunks.push(value);
    }
    await reader.cancel();
    const merged = new Uint8Array(
      chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
    );
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(merged);
  } catch {
    // Unreadable body (e.g. aborted mid-read); status still informs.
    return "";
  }
}
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
    const onExternalAbort = () => controller.abort();
    if (options?.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener("abort", onExternalAbort);
    }
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...this.opts.headers,
      };
      // Explicit apiKey wins over an Authorization entry in opts.headers.
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
        const requestId =
          res.headers.get("x-request-id") ??
          res.headers.get("x-typesafe-request-id") ??
          undefined;
        // Backends (Reflex, Von, Laya, TypeSafe) explain 4xx rejections in
        // the response body. Forward a bounded snippet so calling agents can
        // self-correct; the status alone ("provider error 422") is not
        // actionable. Never forward credentials: the body is server-generated
        // and only its first bytes are kept.
        const snippet = (await readBoundedBody(res, MAX_ERROR_BODY_BYTES))
          .trim()
          .slice(0, 500);
        let detail = "";
        if (snippet) detail = `: ${snippet}`;
        if (controller.signal.aborted && !timedOut) {
          throw new SystemOneTransportError("request aborted");
        }
        throw new SystemOneHttpError(`provider error ${res.status}${detail}`, {
          status: res.status,
          provider: this.id,
          requestId,
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
      options?.signal?.removeEventListener("abort", onExternalAbort);
    }
  }
}
