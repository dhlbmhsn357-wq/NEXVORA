import { describe, expect, it } from "vitest";
import { getProvider, listAvailableProviders } from "./registry";
import { AIProviderName } from "./types";
import { UnknownProviderError } from "./errors";
import { GeminiProvider } from "./providers/gemini";
import { OpenAIProvider } from "./providers/openai";

describe("AI provider registry", () => {
  it("returns the Gemini provider for AIProviderName.GEMINI", () => {
    const provider = getProvider(AIProviderName.GEMINI);
    expect(provider).toBeInstanceOf(GeminiProvider);
    expect(provider.name).toBe(AIProviderName.GEMINI);
  });

  it("returns the OpenAI provider for AIProviderName.OPENAI", () => {
    const provider = getProvider(AIProviderName.OPENAI);
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.name).toBe(AIProviderName.OPENAI);
  });

  it("throws UnknownProviderError for a provider that isn't registered", () => {
    expect(() => getProvider(AIProviderName.CLAUDE)).toThrow(UnknownProviderError);
  });

  it("lists the currently implemented providers", () => {
    expect(listAvailableProviders()).toEqual([AIProviderName.GEMINI, AIProviderName.OPENAI]);
  });
});
