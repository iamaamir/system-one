import { SystemOneConfigurationError } from "./errors.ts";
import type {
  SystemOneCallOptions,
  SystemOneProvider,
  SystemOneRequest,
} from "./provider.ts";
import type { QuestionMap } from "./questions.ts";
import type { SystemOneResponse } from "./responses.ts";
export interface SystemOneOptions {
  provider: SystemOneProvider;
}
export class SystemOne {
  readonly provider: SystemOneProvider;
  constructor(options: SystemOneOptions) {
    if (!options?.provider)
      throw new SystemOneConfigurationError("provider is required");
    this.provider = options.provider;
  }
  async evaluate<Q extends QuestionMap>(
    request: SystemOneRequest<Q>,
    options?: SystemOneCallOptions,
  ): Promise<SystemOneResponse<Q>> {
    if (!request?.questions || Object.keys(request.questions).length === 0) {
      throw new SystemOneConfigurationError(
        "at least one question is required",
      );
    }
    return this.provider.evaluate(request, options);
  }
}
export function createSystemOne(options: SystemOneOptions): SystemOne {
  return new SystemOne(options);
}
