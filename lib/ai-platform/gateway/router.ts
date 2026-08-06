import type { AIProviderName } from "@/lib/ai/types";
import type { ProviderCapabilities, RegisteredProvider } from "./types";

/**
 * توجيه المهام إلى المزوّدين — وحدة نقية.
 *
 * الهدف المعماري: إضافة مزوّد جديد (GPT · Claude · DeepSeek · OpenRouter ·
 * Azure · نموذج محلّي) تكون **تسجيلًا وقاعدة توجيه**، بلا لمس أي منطق
 * أعمال. الطبقة دي بتقرّر «مين ينفّذ» ومابتعرفش «إيه اللي بيتنفّذ».
 *
 * **حاليًا Gemini فقط** — المواصفة منعت إضافة مزوّدين في المرحلة دي.
 */

export const GEMINI_CAPABILITIES: ProviderCapabilities = {
  streaming: true,
  embeddings: true,
  media: true,
  jsonMode: true,
  maxContextTokens: 1_000_000,
};

/** سجل المزوّدين المتاحين — قابل للتوسيع بالتسجيل لا بالتعديل. */
const providers = new Map<AIProviderName, RegisteredProvider>();

export function registerProvider(entry: RegisteredProvider): void {
  providers.set(entry.name, entry);
}

export function listProviders(): RegisteredProvider[] {
  return [...providers.values()];
}

export function getProviderInfo(name: AIProviderName): RegisteredProvider | undefined {
  return providers.get(name);
}

export interface RoutingRule {
  taskType: string;
  provider: AIProviderName;
  model: string;
  /** المزوّد الاحتياطي — `null` يعني لا احتياطي **عن قصد**. */
  fallbackProvider: AIProviderName | null;
  fallbackModel: string | null;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface RoutingDecision {
  provider: AIProviderName;
  model: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  /** هل هذا هو الاحتياطي؟ يُسجَّل مع النتيجة. */
  isFallback: boolean;
}

export class NoRouteError extends Error {
  constructor(taskType: string) {
    super(`مفيش قاعدة توجيه لنوع المهمة: ${taskType}`);
    this.name = "NoRouteError";
  }
}

/**
 * أنواع المهام التي **يُمنع** لها الاحتياطي.
 *
 * الأشعة (Embeddings) على رأسها: أشعة نموذجين مختلفين **غير قابلة
 * للمقارنة رياضيًا**. الاحتياطي هنا يلوّث فهرس البحث بأشعة من فضاء
 * آخر ويعطي نتائج خاطئة بصمت — وهو أسوأ من الفشل الصريح.
 */
export const NO_FALLBACK_TASKS = new Set<string>(["embedding"]);

/** يختار المزوّد والنموذج لمهمة. */
export function route(
  rules: RoutingRule[],
  taskType: string,
  options: { preferFallback?: boolean } = {}
): RoutingDecision {
  const rule = rules.find((r) => r.taskType === taskType);
  if (!rule) throw new NoRouteError(taskType);

  if (options.preferFallback) {
    if (NO_FALLBACK_TASKS.has(taskType)) {
      throw new Error(
        `النوع «${taskType}» ممنوع له الاحتياطي: أشعة نماذج مختلفة غير قابلة للمقارنة.`
      );
    }
    if (!rule.fallbackProvider || !rule.fallbackModel) {
      throw new Error(`مفيش مزوّد احتياطي معرَّف للنوع «${taskType}».`);
    }
    return {
      provider: rule.fallbackProvider,
      model: rule.fallbackModel,
      maxOutputTokens: rule.maxOutputTokens,
      timeoutMs: rule.timeoutMs,
      isFallback: true,
    };
  }

  return {
    provider: rule.provider,
    model: rule.model,
    maxOutputTokens: rule.maxOutputTokens,
    timeoutMs: rule.timeoutMs,
    isFallback: false,
  };
}

/** هل يوجد احتياطي صالح لهذا النوع؟ */
export function hasFallback(rules: RoutingRule[], taskType: string): boolean {
  if (NO_FALLBACK_TASKS.has(taskType)) return false;
  const rule = rules.find((r) => r.taskType === taskType);
  return !!(rule?.fallbackProvider && rule.fallbackModel);
}

/**
 * يتحقّق أن المزوّد يدعم ما تطلبه المهمة.
 *
 * الفحص قبل الإرسال لا بعده: مهمة تطلب وسائط من مزوّد لا يدعمها تفشل
 * برسالة غامضة من الطرف الآخر، والفحص هنا يعطي سببًا مفهومًا فورًا.
 */
export function validateCapabilities(
  provider: RegisteredProvider | undefined,
  needs: { media?: boolean; streaming?: boolean; embeddings?: boolean }
): { ok: true } | { ok: false; reason: string } {
  if (!provider) return { ok: false, reason: "المزوّد غير مسجّل." };

  if (needs.media && !provider.capabilities.media) {
    return { ok: false, reason: `المزوّد ${provider.name} لا يدعم الوسائط.` };
  }
  if (needs.streaming && !provider.capabilities.streaming) {
    return { ok: false, reason: `المزوّد ${provider.name} لا يدعم البث.` };
  }
  if (needs.embeddings && !provider.capabilities.embeddings) {
    return { ok: false, reason: `المزوّد ${provider.name} لا يدعم الأشعة.` };
  }
  return { ok: true };
}

/** للاختبارات فقط. */
export function __resetProvidersForTests(): void {
  providers.clear();
}
