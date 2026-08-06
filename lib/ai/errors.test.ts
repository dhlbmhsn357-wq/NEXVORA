import { describe, expect, it } from "vitest";
import {
  AIError,
  AuthenticationError,
  ConfigurationError,
  ProviderError,
  RateLimitError,
  TimeoutError,
  UnknownProviderError,
} from "./errors";

describe("AI error classes", () => {
  it("ProviderError is retryable and carries its code", () => {
    const err = new ProviderError("boom", "gemini");
    expect(err).toBeInstanceOf(AIError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.retryable).toBe(true);
    expect(err.provider).toBe("gemini");
  });

  it("RateLimitError is retryable", () => {
    const err = new RateLimitError("too many requests", "gemini");
    expect(err.code).toBe("RATE_LIMIT");
    expect(err.retryable).toBe(true);
  });

  it("TimeoutError is retryable", () => {
    const err = new TimeoutError("timed out", "gemini");
    expect(err.code).toBe("TIMEOUT");
    expect(err.retryable).toBe(true);
  });

  it("AuthenticationError is NOT retryable", () => {
    const err = new AuthenticationError("bad key", "gemini");
    expect(err.code).toBe("AUTHENTICATION");
    expect(err.retryable).toBe(false);
  });

  it("ConfigurationError is NOT retryable", () => {
    const err = new ConfigurationError("missing env var");
    expect(err.code).toBe("CONFIGURATION");
    expect(err.retryable).toBe(false);
  });

  it("UnknownProviderError carries the offending provider name", () => {
    const err = new UnknownProviderError("mystery-ai");
    expect(err.code).toBe("UNKNOWN_PROVIDER");
    expect(err.retryable).toBe(false);
    expect(err.provider).toBe("mystery-ai");
  });
});
