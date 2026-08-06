import type { AIProviderName } from "@/lib/ai/types";

/**
 * عقد بوابة الذكاء الاصطناعي.
 *
 * **البوابة هي الباب الوحيد لأي مزوّد.** لا يستدعي أي جزء من المشروع
 * مزوّدًا مباشرة — الحارس في `.eslintrc` يمنع الاستيراد المباشر، ولا
 * يعتمد المنع على الانضباط وحده.
 */

export interface GatewayRequest {
  /** نوع المهمة — يحدّد التوجيه والمهلة والسياسات. */
  taskType: string;
  /** البرومبت بعد البناء. */
  prompt: string;

  projectId?: string | null;
  actorId?: string | null;
  jobId?: string | null;
  traceId?: string | null;

  /** إصدار القالب — جزء من مفتاح الذاكرة. */
  promptVersion?: number;
  promptTemplate?: string;

  /** تجاوز التوجيه الافتراضي — للاختبار والتشخيص فقط. */
  provider?: AIProviderName;
  model?: string;

  maxOutputTokens?: number;
  timeoutMs?: number;

  /** السماح بالبيانات الشخصية لهذا النوع تحديدًا — قرار موثَّق. */
  allowPii?: boolean;
  /** تخطّي الذاكرة وإجبار نداء جديد. */
  bypassCache?: boolean;

  /** ملفات وسائط — تُمرَّر للمزوّد كما هي، بلا تعقيم نصّي. */
  media?: Array<{ mimeType: string; data: string }>;
}

export type GatewayOutcome =
  | {
      status: "ok";
      output: string;
      provider: AIProviderName;
      model: string;
      cached: boolean;
      inputTokens: number | null;
      outputTokens: number | null;
      costUsd: number | null;
      latencyMs: number;
      redactedFields: number;
      resultId: string | null;
    }
  | {
      status: "circuit_open";
      provider: AIProviderName;
      retryAfterMs: number;
      reason: string;
    }
  | {
      status: "error";
      provider: AIProviderName | null;
      code: string;
      message: string;
      /** هل يستحق إعادة المحاولة؟ يحدّده الطابور لا البوابة. */
      transient: boolean;
      latencyMs: number;
    };

/**
 * قدرات المزوّد — تُعلَن لا تُفترَض.
 *
 * وجودها يخلّي إضافة مزوّد جديد لاحقًا مسألة تعريف: البوابة تسأل عن
 * القدرة قبل استخدامها بدل ما تفترض إن كل المزوّدين متشابهين.
 */
export interface ProviderCapabilities {
  streaming: boolean;
  embeddings: boolean;
  media: boolean;
  jsonMode: boolean;
  maxContextTokens: number;
}

export interface RegisteredProvider {
  name: AIProviderName;
  capabilities: ProviderCapabilities;
  /** أنماط النماذج التي يخدمها — للتوجيه والتحقّق. */
  models: string[];
}
