/**
 * Error classes موحّدة لطبقة AI — أي فشل داخل Provider أو AIService
 * لازم يترجم لواحدة من الكلاسات دي، مش throw new Error() خام.
 */

export type AIErrorCode =
  | "PROVIDER_ERROR"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "AUTHENTICATION"
  | "CONFIGURATION"
  | "UNKNOWN_PROVIDER";

export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly provider: string | undefined;
  readonly retryable: boolean;

  constructor(
    code: AIErrorCode,
    message: string,
    options: { provider?: string; retryable?: boolean } = {}
  ) {
    super(message);
    this.name = "AIError";
    this.code = code;
    this.provider = options.provider;
    this.retryable = options.retryable ?? false;
  }
}

export class ProviderError extends AIError {
  constructor(message: string, provider?: string) {
    super("PROVIDER_ERROR", message, { provider, retryable: true });
    this.name = "ProviderError";
  }
}

export class RateLimitError extends AIError {
  constructor(message: string, provider?: string) {
    super("RATE_LIMIT", message, { provider, retryable: true });
    this.name = "RateLimitError";
  }
}

export class TimeoutError extends AIError {
  constructor(message: string, provider?: string) {
    super("TIMEOUT", message, { provider, retryable: true });
    this.name = "TimeoutError";
  }
}

export class AuthenticationError extends AIError {
  constructor(message: string, provider?: string) {
    super("AUTHENTICATION", message, { provider, retryable: false });
    this.name = "AuthenticationError";
  }
}

export class ConfigurationError extends AIError {
  constructor(message: string, provider?: string) {
    super("CONFIGURATION", message, { provider, retryable: false });
    this.name = "ConfigurationError";
  }
}

export class UnknownProviderError extends AIError {
  constructor(providerName: string) {
    super("UNKNOWN_PROVIDER", `مزوّد AI غير معروف: ${providerName}`, {
      provider: providerName,
      retryable: false,
    });
    this.name = "UnknownProviderError";
  }
}
