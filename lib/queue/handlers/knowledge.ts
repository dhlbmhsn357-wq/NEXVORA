import { defineJobHandler } from "../registry";
import { hashInput } from "@/lib/ai-platform/cache/keys";

/**
 * عمّال استيراد المعرفة.
 *
 * ## لماذا عامل لكل مجموعة لا عامل واحد
 *
 * المواصفة طلبت عاملًا لكل نوع ملف. التقسيم هنا **بالمجموعة لا
 * بالامتداد**: PDF وWord وPowerPoint بيمرّوا بنفس المسار تمامًا
 * (استخراج نصّ ← تقطيع ← تصنيف)، وعامل منفصل لكل واحد كان هيبقى
 * ثلاث نسخ من نفس الكود تتباعد مع الوقت.
 *
 * الفرق الحقيقي في **الموارد والمهلة**، وده اللي المجموعات بتعكسه:
 *
 * - `document` — نصّ، سريع، ذاكرة قليلة
 * - `structured` — جداول، تحليل مختلف، متوسّط
 * - `media` — صوت وفيديو وصور، بطيء جدًا وذاكرة عالية
 * - `archive` — فكّ ضغط ثم إدراج مهام فرعية
 * - `external` — شبكة، بطء غير متوقَّع، فشل شائع
 *
 * ## الحدود المعلومة
 *
 * المعالجة الفعلية لسه في `processNextSource` داخل الخدمة. العامل ده
 * **بيستدعيها** لا بيستبدلها — النقل التدريجي أأمن من إعادة كتابة
 * ٧٩٣ سطر مرة واحدة. اللي اتغيّر إن التنفيذ بقى في عملية العامل بدل
 * دالة Vercel، وده الغرض الأساسي.
 */

export const KNOWLEDGE_JOB_TYPES = {
  DOCUMENT: "knowledge.document",
  STRUCTURED: "knowledge.structured",
  MEDIA: "knowledge.media",
  ARCHIVE: "knowledge.archive",
  EXTERNAL: "knowledge.external",
} as const;

/** نوع مهمة معالجة ذكاء الأعمال — منفصل عن مجموعات الاستيراد. */
export const KNOWLEDGE_PROCESSING_JOB_TYPE = "knowledge.processing";

/** نوع مهمة الطبقة الاستشارية (الجزء الخامس). */
export const KNOWLEDGE_INTELLIGENCE_JOB_TYPE = "knowledge.intelligence";

export type KnowledgeJobType =
  (typeof KNOWLEDGE_JOB_TYPES)[keyof typeof KNOWLEDGE_JOB_TYPES];

export interface KnowledgeJobPayload {
  projectId: string;
  /** المصدر المستهدف — لو غاب، العامل ياخد التالي في الطابور. */
  sourceId?: string | null;
  actorId?: string | null;
  /** كام مصدر يعالج في المهمة الواحدة قبل ما يسيب المجال لغيره. */
  maxSources?: number;
}

interface GroupDefaults {
  workerType: string;
  timeoutMs: number;
  maxAttempts: number;
  concurrency: number;
  description: string;
}

/**
 * الافتراضات لكل مجموعة.
 *
 * الاختلافات حقيقية لا تجميلية: تفريغ فيديو ممكن ياخد عشر دقائق،
 * وملف نصّي بيخلص في ثواني. مهلة واحدة للاتنين معناها إما قطع الفيديو
 * أو انتظار النصّ بلا داعٍ.
 *
 * **محاولات الوسائط أقل**: فشلها في الأغلب بسبب الملف نفسه (تالف أو
 * صيغة غير مدعومة)، وإعادة المحاولة بتكرّر نفس الفشل بتكلفة أعلى.
 */
const DEFAULTS: Record<KnowledgeJobType, GroupDefaults> = {
  [KNOWLEDGE_JOB_TYPES.DOCUMENT]: {
    workerType: "knowledge_document",
    timeoutMs: 180_000,
    maxAttempts: 3,
    concurrency: 2,
    description: "مستندات نصّية — PDF وWord وPowerPoint وMarkdown.",
  },
  [KNOWLEDGE_JOB_TYPES.STRUCTURED]: {
    workerType: "knowledge_structured",
    timeoutMs: 180_000,
    maxAttempts: 3,
    concurrency: 2,
    description: "بيانات مهيكلة — Excel وCSV وJSON وتصديرات ERP.",
  },
  [KNOWLEDGE_JOB_TYPES.MEDIA]: {
    workerType: "knowledge_media",
    timeoutMs: 600_000,
    maxAttempts: 2,
    concurrency: 1,
    description: "وسائط — صوت وفيديو وصور ومستندات ممسوحة.",
  },
  [KNOWLEDGE_JOB_TYPES.ARCHIVE]: {
    workerType: "knowledge_archive",
    timeoutMs: 300_000,
    maxAttempts: 2,
    concurrency: 1,
    description: "أرشيفات — فكّ ZIP ثم إدراج مهمة لكل ملف بداخله.",
  },
  [KNOWLEDGE_JOB_TYPES.EXTERNAL]: {
    workerType: "knowledge_external",
    timeoutMs: 240_000,
    maxAttempts: 3,
    concurrency: 2,
    description: "مصادر خارجية — روابط ومستودعات وتصديرات Notion.",
  },
};

for (const [type, defaults] of Object.entries(DEFAULTS) as Array<
  [KnowledgeJobType, GroupDefaults]
>) {
  defineJobHandler<KnowledgeJobPayload>({
    type,
    workerType: defaults.workerType,
    concurrency: defaults.concurrency,
    timeoutMs: defaults.timeoutMs,
    maxAttempts: defaults.maxAttempts,
    defaultPriority: type === KNOWLEDGE_JOB_TYPES.MEDIA ? "low" : "normal",
    description: defaults.description,

    // المشروع مورد وحيد أثناء الاستيراد: مهمتان متزامنتان على نفس
    // المشروع بتتنافسا على نفس المصادر، وواحدة بتلاقي التانية سبقتها.
    lockKey: (p) => (p.projectId ? `knowledge:${p.projectId}` : null),

    dedupeHash: (p) => hashInput({ type, projectId: p.projectId, sourceId: p.sourceId }),

    handler: async (ctx) => {
      const payload = ctx.payload;
      if (!payload.projectId) throw new Error("المشروع مطلوب في حمولة المهمة.");

      // الاستيراد داخل المعالج لا في أول الملف: تحميل الخدمة بيجرّ
      // مزوّد الذكاء الاصطناعي، وتحميله وقت التسجيل بيثقل بدء كل عامل
      // حتى اللي مالوش علاقة بالمعرفة.
      const { processNextSource } = await import("@/lib/knowledge-hub/service");

      const budget = Math.max(1, Math.min(payload.maxSources ?? 5, 25));
      let processed = 0;
      let failed = 0;

      for (let i = 0; i < budget; i++) {
        // الإلغاء يُفحص بين المصادر لا داخلها: قطع مصدر في النص بيسيب
        // مقاطع نصف مكتملة، والفحص بين المصادر بيدّي نقطة توقّف نظيفة.
        if (await ctx.isCanceled()) break;

        const outcome = await processNextSource(payload.projectId, payload.actorId ?? null);

        if (outcome.status === "idle") break;
        if (outcome.status === "failed") failed += 1;
        else processed += 1;

        await ctx.saveCheckpoint({ processed, failed, index: i + 1 });
        await ctx.reportProgress(
          Math.round(((i + 1) / budget) * 100),
          `عولج ${processed} مصدر${failed ? ` · فشل ${failed}` : ""}`
        );
      }

      return { result: { processed, failed, group: type } };
    },
  });
}

/**
 * عامل معالجة ذكاء الأعمال.
 *
 * منفصل عن مجموعات الاستيراد لأن مورده مختلف: مش بيقرأ ملفات ولا يفكّ
 * ضغطًا، بيقرأ المعرفة المتراكمة ويستدعي النموذج لكل مجال. بيمشي على
 * المجالات مجالًا مجالًا لحد ما `processNextDomain` يرجّع `idle`.
 *
 * نفس القفل على المشروع: معالجتان متزامنتان على نفس المشروع بتكتبا
 * كيانات متضاربة على نفس المفتاح المطبَّع.
 */
defineJobHandler<KnowledgeJobPayload>({
  type: KNOWLEDGE_PROCESSING_JOB_TYPE,
  workerType: "knowledge_processing",
  concurrency: 1,
  timeoutMs: 300_000,
  maxAttempts: 2,
  defaultPriority: "low",
  lockKey: (p) => (p.projectId ? `knowledge:${p.projectId}` : null),
  dedupeHash: (p) => hashInput({ type: KNOWLEDGE_PROCESSING_JOB_TYPE, projectId: p.projectId }),

  handler: async (ctx) => {
    const payload = ctx.payload;
    if (!payload.projectId) throw new Error("المشروع مطلوب في حمولة المهمة.");

    const { processNextDomain } = await import("@/lib/knowledge-hub/processing-service");

    const budget = Math.max(1, Math.min(payload.maxSources ?? 8, 25));
    let processed = 0;
    let failed = 0;

    for (let i = 0; i < budget; i++) {
      if (await ctx.isCanceled()) break;

      const outcome = await processNextDomain(payload.projectId, payload.actorId ?? null);
      if (outcome.status === "idle") break;
      if (outcome.status === "failed") failed += 1;
      else processed += 1;

      await ctx.saveCheckpoint({ processed, failed, index: i + 1 });
      await ctx.reportProgress(
        Math.round(((i + 1) / budget) * 100),
        `عولج ${processed} مجال${failed ? ` · فشل ${failed}` : ""}`
      );
    }

    // التحليل المستمر: بعد ما المعالجة تنتج معرفة مهيكلة، أطلق جولة ذكاء
    // تلقائيًا — «لا تنتظر المستخدم». فشل التحليل لا يفشل المعالجة.
    if (processed > 0) {
      try {
        const { triggerIntelligence } = await import("@/lib/knowledge-hub/intelligence-trigger");
        const { runIntelligence } = await import("@/lib/knowledge-hub/intelligence-service");
        await triggerIntelligence(
          payload.projectId,
          () => runIntelligence(payload.projectId, payload.actorId ?? null),
          payload.actorId ?? null
        );
      } catch (err) {
        console.error("[knowledge.processing] تعذّر إطلاق التحليل المستمر:", err);
      }
    }

    return { result: { processed, failed, kind: "knowledge_processing" } };
  },
});

/**
 * عامل الطبقة الاستشارية.
 *
 * جولة واحدة لكل نداء: يجمع المعرفة المهيكلة، يحسب القدرات الناقصة
 * والدرجات حتميًا، يستشير النموذج للرؤى التحليلية، يكتب. نفس القفل على
 * المشروع عشان جولتين متزامنتين مايكتبوش رؤى متضاربة.
 */
defineJobHandler<KnowledgeJobPayload>({
  type: KNOWLEDGE_INTELLIGENCE_JOB_TYPE,
  workerType: "knowledge_intelligence",
  concurrency: 1,
  timeoutMs: 180_000,
  maxAttempts: 2,
  defaultPriority: "low",
  lockKey: (p) => (p.projectId ? `knowledge:${p.projectId}` : null),
  dedupeHash: (p) => hashInput({ type: KNOWLEDGE_INTELLIGENCE_JOB_TYPE, projectId: p.projectId }),

  handler: async (ctx) => {
    const payload = ctx.payload;
    if (!payload.projectId) throw new Error("المشروع مطلوب في حمولة المهمة.");

    const { runIntelligence } = await import("@/lib/knowledge-hub/intelligence-service");
    await ctx.reportProgress(20, "جمع المعرفة وحساب الدرجات");
    const outcome = await runIntelligence(payload.projectId, payload.actorId ?? null);
    await ctx.reportProgress(100, outcome.status === "ok" ? `${outcome.insightsWritten ?? 0} رأي` : outcome.status);

    return { result: { status: outcome.status, insights: outcome.insightsWritten ?? 0 } };
  },
});

/**
 * المجموعة ← نوع المهمة.
 *
 * الربط هنا لا في `model.ts`: النموذج وحدة نقية مالهاش علاقة بالطابور،
 * وحطّ أسماء المهام فيه كان هيربطه ببنية تشغيل مش من مسؤوليته.
 */
const JOB_TYPE_BY_GROUP: Record<string, KnowledgeJobType> = {
  document: KNOWLEDGE_JOB_TYPES.DOCUMENT,
  internal: KNOWLEDGE_JOB_TYPES.DOCUMENT,
  structured: KNOWLEDGE_JOB_TYPES.STRUCTURED,
  media: KNOWLEDGE_JOB_TYPES.MEDIA,
  external: KNOWLEDGE_JOB_TYPES.EXTERNAL,
};

export function jobTypeForGroup(group: string): KnowledgeJobType {
  return JOB_TYPE_BY_GROUP[group] ?? KNOWLEDGE_JOB_TYPES.DOCUMENT;
}

/** كل أنواع عمّال المعرفة — لتشغيلها مجمّعة على بيئة صغيرة. */
export const KNOWLEDGE_WORKER_TYPES = [
  ...Object.values(DEFAULTS).map((d) => d.workerType),
  "knowledge_processing",
  "knowledge_intelligence",
];
