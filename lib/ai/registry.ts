import { AIProvider, AIProviderName } from "./types";
import { UnknownProviderError } from "./errors";
import { GeminiProvider } from "./providers/gemini";
import { OpenAIProvider } from "./providers/openai";

/**
 * المكان الوحيد المسموح فيه بربط اسم Provider بتطبيقه الفعلي.
 * لإضافة مزوّد جديد (Claude, ...): أنشئ ملفه في providers/
 * وسجّله هنا بس — من غير أي تعديل في AIService أو أي مكان تاني.
 */
const providers: Partial<Record<AIProviderName, AIProvider>> = {
  [AIProviderName.GEMINI]: new GeminiProvider(),
  [AIProviderName.OPENAI]: new OpenAIProvider(),
};

export function getProvider(name: AIProviderName): AIProvider {
  const provider = providers[name];
  if (!provider) {
    throw new UnknownProviderError(name);
  }
  return provider;
}

export function listAvailableProviders(): AIProviderName[] {
  return Object.keys(providers) as AIProviderName[];
}
