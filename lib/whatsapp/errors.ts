/**
 * Error classes موحّدة لطبقة WhatsApp — أي فشل داخل Provider أو Service
 * لازم يترجم لواحدة من الكلاسات دي، مش throw new Error() خام.
 */

export type WhatsAppErrorCode =
  | "PROVIDER_ERROR"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "AUTHENTICATION"
  | "CONFIGURATION"
  | "INVALID_PHONE"
  | "UNKNOWN_PROVIDER";

export class WhatsAppError extends Error {
  readonly code: WhatsAppErrorCode;
  readonly provider: string | undefined;
  readonly retryable: boolean;

  constructor(
    code: WhatsAppErrorCode,
    message: string,
    options: { provider?: string; retryable?: boolean } = {}
  ) {
    super(message);
    this.name = "WhatsAppError";
    this.code = code;
    this.provider = options.provider;
    this.retryable = options.retryable ?? false;
  }
}

export class WhatsAppProviderError extends WhatsAppError {
  constructor(message: string, provider?: string) {
    super("PROVIDER_ERROR", message, { provider, retryable: true });
    this.name = "WhatsAppProviderError";
  }
}

export class WhatsAppRateLimitError extends WhatsAppError {
  constructor(message: string, provider?: string) {
    super("RATE_LIMIT", message, { provider, retryable: true });
    this.name = "WhatsAppRateLimitError";
  }
}

export class WhatsAppTimeoutError extends WhatsAppError {
  constructor(message: string, provider?: string) {
    super("TIMEOUT", message, { provider, retryable: true });
    this.name = "WhatsAppTimeoutError";
  }
}

export class WhatsAppAuthError extends WhatsAppError {
  constructor(message: string, provider?: string) {
    super("AUTHENTICATION", message, { provider, retryable: false });
    this.name = "WhatsAppAuthError";
  }
}

export class WhatsAppConfigError extends WhatsAppError {
  constructor(message: string, provider?: string) {
    super("CONFIGURATION", message, { provider, retryable: false });
    this.name = "WhatsAppConfigError";
  }
}

export class WhatsAppInvalidPhoneError extends WhatsAppError {
  constructor(message = "رقم الهاتف غير صالح.") {
    super("INVALID_PHONE", message, { retryable: false });
    this.name = "WhatsAppInvalidPhoneError";
  }
}

export class UnknownWhatsAppProviderError extends WhatsAppError {
  constructor(providerName: string) {
    super("UNKNOWN_PROVIDER", `مزوّد WhatsApp غير معروف: ${providerName}`, {
      provider: providerName,
      retryable: false,
    });
    this.name = "UnknownWhatsAppProviderError";
  }
}
