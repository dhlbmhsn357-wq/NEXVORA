import { describe, expect, it, vi } from "vitest";
import { withRetry, withTimeout } from "./retry";
import { ProviderError, AuthenticationError, TimeoutError } from "./errors";

describe("withRetry", () => {
  it("returns the result immediately on success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, 3);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a retryable error until it succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ProviderError("temporary failure"))
      .mockRejectedValueOnce(new ProviderError("temporary failure again"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, 3);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops after the max number of attempts and throws the last error", async () => {
    const fn = vi.fn().mockRejectedValue(new ProviderError("always fails"));

    await expect(withRetry(fn, 3)).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-retryable error", async () => {
    const fn = vi.fn().mockRejectedValue(new AuthenticationError("bad api key"));

    await expect(withRetry(fn, 3)).rejects.toThrow("bad api key");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("withTimeout", () => {
  it("resolves normally when the promise finishes before the timeout", async () => {
    const fast = new Promise((resolve) => setTimeout(() => resolve("done"), 10));
    const result = await withTimeout(fast, 200);
    expect(result).toBe("done");
  });

  it("rejects with TimeoutError when the promise is too slow", async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve("too late"), 200));
    await expect(withTimeout(slow, 20)).rejects.toBeInstanceOf(TimeoutError);
  });
});
