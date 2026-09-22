import type { QuestionMap } from "../questions.ts";
import type { SystemOneCallOptions, SystemOneProvider, SystemOneRequest } from "../provider.ts";
import type { SystemOneResponse } from "../responses.ts";
export interface MockSystemOneProviderOptions {
  id?: string;
  answers: Record<string, any>;
}
export class MockSystemOneProvider implements SystemOneProvider {
  readonly id: string;
  private readonly canned: Record<string, any>;
  constructor(options: MockSystemOneProviderOptions) {
    this.id = options.id ?? "mock";
    this.canned = Object.freeze({ ...options.answers });
  }
  async evaluate<Q extends QuestionMap>(request: SystemOneRequest<Q>, _options?: SystemOneCallOptions): Promise<SystemOneResponse<Q>> {
    const answers: Record<string, any> = {};
    for (const id of Object.keys(request.questions)) {
      if (!(id in this.canned)) throw new Error(`Mock "${this.id}" has no canned answer for "${id}" (available: ${Object.keys(this.canned).join(", ") || "(none)"})`);
      answers[id] = this.canned[id];
    }
    return { answers: answers as any, metadata: { provider: this.id } };
  }
}
