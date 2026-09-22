export class SystemOneError extends Error {
  readonly code: string;
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SystemOneError";
    this.code = code;
  }
}
export class SystemOneConfigurationError extends SystemOneError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "SYSTEM_ONE_CONFIGURATION", options);
    this.name = "SystemOneConfigurationError";
  }
}
export class SystemOneTransportError extends SystemOneError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "SYSTEM_ONE_TRANSPORT", options);
    this.name = "SystemOneTransportError";
  }
}
export class SystemOneTimeoutError extends SystemOneError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "SYSTEM_ONE_TIMEOUT", options);
    this.name = "SystemOneTimeoutError";
  }
}
export class SystemOneHttpError extends SystemOneError {
  readonly status: number;
  readonly provider: string;
  readonly requestId?: string;
  constructor(message: string, opts: { status: number; provider: string; requestId?: string }, options?: ErrorOptions) {
    super(message, "SYSTEM_ONE_HTTP", options);
    this.name = "SystemOneHttpError";
    this.status = opts.status;
    this.provider = opts.provider;
    this.requestId = opts.requestId;
  }
}
export class SystemOneProtocolError extends SystemOneError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "SYSTEM_ONE_PROTOCOL", options);
    this.name = "SystemOneProtocolError";
  }
}
export class SystemOneCapabilityError extends SystemOneError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "SYSTEM_ONE_CAPABILITY", options);
    this.name = "SystemOneCapabilityError";
  }
}
