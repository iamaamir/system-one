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
/** Upper bound for the model-visible error detail after extraction. */
const MAX_ERROR_DETAIL_CHARS = 500;

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Credential-shaped `key=value` fragments a backend may echo back
 * (request state, upstream errors, stack traces). Redact the value,
 * keep the key so the message stays debuggable.
 */
const SENSITIVE_VALUE_PATTERN =
  /((?:api[_-]?key|password|passwd|secret|token|authorization)\s*[:=]\s*["']?)([^"'\s,}]+)/gi;

function sanitizeErrorDetail(detail: string): string {
  return detail
    .replace(SENSITIVE_VALUE_PATTERN, "$1[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull a useful message out of known error envelopes
 * (`{"detail"}`, `{"message"}`, `{"error":{"message"}}`, bare strings).
 * Returns undefined when the body carries nothing structured, so the
 * caller can fall back to truncated raw text (4xx) or nothing (5xx).
 */
function extractStructuredDetail(body: string): string | undefined {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (typeof data === "string") return data;
  if (isJsonRecord(data)) {
    for (const key of ["detail", "message"]) {
      if (typeof data[key] === "string") return data[key] as string;
    }
    const nested = data.error;
    if (typeof nested === "string") return nested;
    if (isJsonRecord(nested) && typeof nested.message === "string") {
      return nested.message as string;
    }
  }
  return undefined;
}

/**
 * Format the model-visible detail for a non-OK response. Remote error
 * bodies are untrusted data: 5xx bodies are operational noise (stack
 * traces, upstream errors, HTML pages) with no repair value and are
 * never forwarded; 4xx details prefer structured envelopes and fall
 * back to bounded, sanitized raw text. Deterministic and dependency-free.
 */
function formatErrorDetail(status: number, body: string): string {
  if (status >= 500) return "";
  const structured = extractStructuredDetail(body);
  const raw = (structured ?? body).trim();
  if (!raw) return "";
  // An unstructured body that opens like markup is an error page, not a
  // validation message.
  if (structured === undefined && raw.startsWith("<")) return "";
  const detail = sanitizeErrorDetail(raw).slice(0, MAX_ERROR_DETAIL_CHARS);
  return detail ? `: ${detail}` : "";
}
/**
 * Stream at most `maxBytes` of a body chunk-by-chunk. Reports whether
 * the cap cut the stream short so callers can distinguish "complete" from
 * "truncated". Throws on read failures; callers decide what that means.
 */
async function readLimitedChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxBytes: number,
): Promise<{ chunks: Uint8Array[]; truncated: boolean }> {
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return { chunks, truncated: false };
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      chunks.push(
        value.slice(0, Math.max(0, value.byteLength - (bytes - maxBytes))),
      );
      return { chunks, truncated: true };
    }
    chunks.push(value);
  }
}

function decodeChunks(chunks: Uint8Array[]): string {
  const merged = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/**
 * Read at most `maxBytes` of a response body for error diagnostics, so a
 * misconfigured backend returning megabytes of HTML/trace on 4xx/5xx is
 * never fully buffered. Never throws: failures yield "".
 */
async function readBoundedBody(
  res: Response,
  maxBytes: number,
): Promise<string> {
  try {
    const reader = res.body?.getReader();
    if (!reader) return (await res.text()).slice(0, maxBytes);
    const { chunks } = await readLimitedChunks(reader, maxBytes);
    // Release the stream, but never let a cancel failure discard chunks
    // already read — the 4xx detail collected so far is still useful.
    await reader.cancel().catch(() => {});
    return decodeChunks(chunks);
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
        // the response body. Forward a bounded, sanitized snippet so calling
        // agents can self-correct; the status alone ("provider error 422")
        // is not actionable. The body read itself can stall: check
        // timeout/abort state explicitly afterwards so a timeout during the
        // read still reports as a timeout rather than an ordinary 4xx.
        const body = await readBoundedBody(res, MAX_ERROR_BODY_BYTES);
        if (timedOut) {
          throw new SystemOneTimeoutError(
            `request timed out after ${this.opts.timeoutMs}ms`,
          );
        }
        if (controller.signal.aborted) {
          throw new SystemOneTransportError("request aborted");
        }
        throw new SystemOneHttpError(
          `provider error ${res.status}${formatErrorDetail(res.status, body)}`,
          {
            status: res.status,
            provider: this.id,
            requestId,
          },
        );
      }
      // Stream with the byte bound enforced during the read: a
      // misconfigured backend returning megabytes on 200 must be cut off
      // mid-stream, never fully buffered before the size check.
      const reader = res.body?.getReader();
      let text: string;
      if (!reader) {
        text = await res.text();
        if (text.length > this.opts.maxResponseBytes)
          throw new SystemOneHttpError("response too large", {
            status: 200,
            provider: this.id,
          });
      } else {
        const { chunks, truncated } = await readLimitedChunks(
          reader,
          this.opts.maxResponseBytes,
        );
        await reader.cancel().catch(() => {});
        if (truncated)
          throw new SystemOneHttpError("response too large", {
            status: 200,
            provider: this.id,
          });
        text = decodeChunks(chunks);
      }
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
