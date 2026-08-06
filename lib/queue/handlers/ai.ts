import { defineJobHandler } from "../registry";
import type { JobPriority } from "../types";
import { execute } from "@/lib/ai-platform/gateway";
import { jobActionWhenOpen } from "@/lib/ai-platform/gateway/circuit-breaker";
import { chunkContext, mergeChunkResults, type ContextPiece } from "@/lib/ai-platform/context/manager";
import { hashInput } from "@/lib/ai-platform/cache/keys";

/**
 * أنواع مهام الذكاء الاصطناعي الإحدى عشر.
 *
 * **كلها تُسجَّل بمصنع واحد.** أحد عشر ملفًا متطابقًا يختلف كل منها في
 * سطر واحد كان سيتباعد تدريجيًا مع الوقت: يُصلَّح خطأ في واحد ويُنسى في
 * عشرة. المصنع يضمن أن السلوك واحد بالبناء لا بالانضباط.
 *
 * ## حدود المرحلة
 *
 * المعالج هنا **عام**: يستقبل برومبتًا جاهزًا وينفّذه عبر البوابة. لم
 * يُنقل أي منطق أعمال — لا Discovery ولا Brain ولا PRD ولا مركز المعرفة
 * ولا المراجعة الهندسية. المواصفة منعت ذلك صراحةً، ونقل كل وحدة يحدث
 * في مرحلتها بعد إثبات المنصة.
 */

export const AI_JOB_TYPES = {
  AI_DISCOVERY: "ai.discovery",
  AI_MEETING: "ai.meeting",
  AI_KNOWLEDGE: "ai.knowledge",
  AI_BRAIN: "ai.brain",
  AI_PRD: "ai.prd",
  AI_PROTOTYPE: "ai.prototype",
  AI_QA: "ai.qa",
  AI_PROMPT: "ai.prompt",
  AI_SUPPORT: "ai.support",
  AI_MONITORING: "ai.monitoring",
  AI_ARCHITECTURE: "ai.architecture",
} as const;

export type AIJobType = (typeof AI_JOB_TYPES)[keyof typeof AI_JOB_TYPES];

/** حمولة موحّدة لكل مهام الذكاء الاصطناعي. */
export interface AIJobPayload {
  /** نوع المهمة في `ai_task_model_config` — يحدّد التوجيه. */
  taskType: string;
  /** البرومبت الجاهز، أو قطع سياق تُجمَّع وتُقسَّم. */
  prompt?: string;
  contextPieces?: ContextPiece[];
  promptVersion?: number;
  promptTemplate?: string;

  projectId?: string | null;
  actorId?: string | null;

  /** يسمح بالبيانات الشخصية لهذا النوع — قرار موثَّق لكل استدعاء. */
  allowPii?: boolean;
  bypassCache?: boolean;
  maxOutputTokens?: number;
  /** ميزانية الرموز للمقطع الواحد عند التقسيم. */
  maxTokensPerChunk?: number;
}

interface AIJobDefaults {
  priority: JobPriority;
  timeoutMs: number;
  maxAttempts: number;
  concurrency: number;
  description: string;
}

/**
 * الافتراضات لكل نوع.
 *
 * الاختلافات حقيقية لا تجميلية: محادثة الدعم يقف أمامها مستخدم فتأخذ
 * الأولوية الحرجة ومهلة قصيرة، والمراجعة الهندسية تحليل ثقيل غير عاجل
 * فتأخذ أولوية منخفضة ومهلة طويلة.
 */
const DEFAULTS: Record<AIJobType, AIJobDefaults> = {
  [AI_JOB_TYPES.AI_SUPPORT]: {
    priority: "critical",
    timeoutMs: 60_000,
    maxAttempts: 2,
    concurrency: 3,
    description: "محادثة الدعم — المستخدم واقف مستنّي.",
  },
  [AI_JOB_TYPES.AI_DISCOVERY]: {
    priority: "high",
    timeoutMs: 150_000,
    maxAttempts: 3,
    concurrency: 2,
    description: "تحليل الاكتشاف.",
  },
  [AI_JOB_TYPES.AI_MEETING]: {
    priority: "high",
    timeoutMs: 150_000,
    maxAttempts: 3,
    concurrency: 2,
    description: "تحليل الاجتماعات واستخراج الكيانات.",
  },
  [AI_JOB_TYPES.AI_KNOWLEDGE]: {
    priority: "high",
    timeoutMs: 150_000,
    maxAttempts: 3,
    concurrency: 3,
    description: "مركز المعرفة — تصنيف وإثراء وتوليف.",
  },
  [AI_JOB_TYPES.AI_BRAIN]: {
    priority: "normal",
    timeoutMs: 180_000,
    maxAttempts: 3,
    concurrency: 1,
    description: "بناء Project Brain — مورد وحيد لكل مشروع.",
  },
  [AI_JOB_TYPES.AI_PRD]: {
    priority: "normal",
    timeoutMs: 180_000,
    maxAttempts: 3,
    concurrency: 1,
    description: "توليد PRD.",
  },
  [AI_JOB_TYPES.AI_PROTOTYPE]: {
    priority: "normal",
    timeoutMs: 180_000,
    maxAttempts: 3,
    concurrency: 2,
    description: "برومبتات النموذج الأوّلي ومراجعته.",
  },
  [AI_JOB_TYPES.AI_PROMPT]: {
    priority: "normal",
    timeoutMs: 120_000,
    maxAttempts: 2,
    concurrency: 2,
    description: "تحسين ومراجعة البرومبتات.",
  },
  [AI_JOB_TYPES.AI_ARCHITECTURE]: {
    priority: "low",
    timeoutMs: 180_000,
    maxAttempts: 3,
    concurrency: 2,
    description: "ذكاء المعمار والرسم المعرفي.",
  },
  [AI_JOB_TYPES.AI_QA]: {
    priority: "low",
    timeoutMs: 200_000,
    maxAttempts: 3,
    concurrency: 2,
    description: "المراجعة الهندسية — تحليل ثقيل غير عاجل.",
  },
  [AI_JOB_TYPES.AI_MONITORING]: {
    priority: "low",
    timeoutMs: 150_000,
    maxAttempts: 3,
    concurrency: 2,
    description: "تحليل حوادث مراقبة الإنتاج.",
  },
};

/**
 * نوع العامل لكل نوع مهمة — **عامل مستقل لكل خدمة**.
 *
 * كان عاملًا واحدًا يخدم الأحد عشر نوعًا. الفصل ضروري لأسباب تشغيلية
 * حقيقية لا تنظيمية:
 *
 * - **العزل عند العطل**: مراجعة هندسية تستهلك الذاكرة وتُسقط العملية
 *   كانت تُسقط معها محادثة الدعم التي ينتظرها مستخدم أمام الشاشة.
 * - **التوسّع المستقل**: الاجتماعات تأتي دفعات، والدعم يأتي متفرّقًا.
 *   نسخة واحدة تخدم الاثنين تعني إما إهدار أو انتظار.
 * - **حدود الموارد**: عامل التحليل الثقيل يحتاج ذاكرة أكبر ومهلة أطول
 *   من عامل يردّ على سؤال دعم.
 *
 * الجمع في عملية واحدة لسه ممكن وقت الحاجة: `WORKER_TYPE=support,prompt`.
 */
const WORKER_TYPE_BY_JOB: Record<AIJobType, string> = {
  [AI_JOB_TYPES.AI_DISCOVERY]: "discovery",
  [AI_JOB_TYPES.AI_MEETING]: "meeting",
  [AI_JOB_TYPES.AI_KNOWLEDGE]: "knowledge",
  [AI_JOB_TYPES.AI_BRAIN]: "brain",
  [AI_JOB_TYPES.AI_PRD]: "prd",
  [AI_JOB_TYPES.AI_PROTOTYPE]: "prototype",
  [AI_JOB_TYPES.AI_QA]: "qa",
  [AI_JOB_TYPES.AI_PROMPT]: "prompt",
  [AI_JOB_TYPES.AI_SUPPORT]: "support",
  [AI_JOB_TYPES.AI_MONITORING]: "monitoring",
  [AI_JOB_TYPES.AI_ARCHITECTURE]: "architecture",
};

/** خطأ يطلب من الطابور إعادة الجدولة بدل تسجيل فشل. */
export class RescheduleSignal extends Error {
  constructor(readonly delayMs: number, reason: string) {
    super(reason);
    this.name = "RescheduleSignal";
  }
}

for (const [type, defaults] of Object.entries(DEFAULTS) as Array<[AIJobType, AIJobDefaults]>) {
  defineJobHandler<AIJobPayload>({
    type,
    workerType: WORKER_TYPE_BY_JOB[type],
    concurrency: defaults.concurrency,
    timeoutMs: defaults.timeoutMs,
    maxAttempts: defaults.maxAttempts,
    defaultPriority: defaults.priority,
    description: defaults.description,

    // Brain و PRD موردان وحيدان لكل مشروع: إعادتا توليد متزامنتان
    // تكتبان فوق بعضهما. القفل بالمورد يمنع ذلك.
    lockKey:
      type === AI_JOB_TYPES.AI_BRAIN || type === AI_JOB_TYPES.AI_PRD
        ? (p) => (p.projectId ? `${type}:${p.projectId}` : null)
        : undefined,

    // بصمة الحمولة تمنع تكرار نفس الطلب أثناء تنفيذه.
    dedupeHash: (p) =>
      hashInput({ type, taskType: p.taskType, prompt: p.prompt, projectId: p.projectId }),

    handler: async (ctx) => {
      const payload = ctx.payload;

      // ---------- التقسيم ----------
      // السياق الأكبر من الميزانية يتقسّم تلقائيًا، والنتائج تُدمَج
      // بترتيب المقاطع لا بترتيب الوصول.
      const chunks =
        payload.contextPieces && payload.maxTokensPerChunk
          ? chunkContext(payload.contextPieces, payload.maxTokensPerChunk)
          : [];

      const prompts =
        chunks.length > 0
          ? chunks.map((c) => c.text)
          : [payload.prompt ?? ""];

      if (prompts.every((p) => !p.trim())) {
        throw new Error("مفيش برومبت ولا قطع سياق — الحمولة فاضية.");
      }

      // الاستئناف من آخر مقطع مكتمل، لا من الصفر.
      const startAt = typeof ctx.checkpoint?.chunkIndex === "number" ? ctx.checkpoint.chunkIndex : 0;
      const collected: Array<{ index: number; output: string }> =
        (ctx.checkpoint?.outputs as Array<{ index: number; output: string }>) ?? [];

      let totalCost = 0;
      // المزوّد والنموذج الفعليان — المحوّل بيرجّعهما للمستدعي في
      // `AIResponse` بدل ما يخمّنهما، فيفضل شكل الرد مطابقًا للقديم.
      let usedProvider: string | null = null;
      let usedModel: string | null = null;
      let cachedAll = true;

      for (let i = startAt; i < prompts.length; i++) {
        if (await ctx.isCanceled()) return;

        const outcome = await execute({
          taskType: payload.taskType,
          prompt: prompts[i],
          projectId: payload.projectId,
          actorId: payload.actorId,
          jobId: ctx.jobId,
          traceId: ctx.traceId,
          promptVersion: payload.promptVersion,
          promptTemplate: payload.promptTemplate,
          allowPii: payload.allowPii,
          bypassCache: payload.bypassCache,
          maxOutputTokens: payload.maxOutputTokens,
        });

        // الدائرة مفتوحة: إعادة جدولة لا فشل. توقّف المزوّد عشر دقائق
        // ما يجوزش يتحوّل لمئة مهمة فاشلة يراجعها المشغّل بإيده.
        if (outcome.status === "circuit_open") {
          const action = jobActionWhenOpen(outcome.retryAfterMs);
          await ctx.log("warning", outcome.reason, { retryAfterMs: action.delayMs });
          throw new RescheduleSignal(action.delayMs, outcome.reason);
        }

        if (outcome.status === "error") {
          await ctx.log("error", outcome.message, { code: outcome.code });
          throw new Error(outcome.message);
        }

        collected.push({ index: i, output: outcome.output });
        totalCost += outcome.costUsd ?? 0;
        usedProvider = outcome.provider;
        usedModel = outcome.model;
        if (!outcome.cached) cachedAll = false;

        await ctx.saveCheckpoint({ chunkIndex: i + 1, outputs: collected });
        await ctx.reportProgress(
          Math.round(((i + 1) / prompts.length) * 100),
          prompts.length > 1 ? `المقطع ${i + 1}/${prompts.length}` : undefined
        );
      }

      const merged = mergeChunkResults(collected);

      return {
        result: {
          chunks: prompts.length,
          output: prompts.length === 1 ? merged[0] : merged,
          provider: usedProvider,
          model: usedModel,
          cached: cachedAll,
        },
        costUsd: totalCost,
      };
    },
  });
}
