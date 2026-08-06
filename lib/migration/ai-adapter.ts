// الاستيراد لأثره الجانبي: تسجيل أنواع المهام.
//
// **درس من أول تشغيل حقيقي:** الطابور بيرفض إدراج نوع غير مسجَّل، وده
// حارس صحيح. لكن التسجيل كان بيحصل في عملية العامل وحدها، والمُدرِج
// (تطبيق Next.js) ما كانش يعرف الأنواع — فكل محاولة نقل كانت بترجع
// للمسار القديم برسالة «نوع مهمة غير مسجّل».
//
// المُنتِج والمستهلك لازم يشوفوا نفس السجل. الاستيراد هنا بيضمن ده في
// أي مكان يمرّ منه المحوّل.
import "@/lib/queue/handlers";
import { getJobHandler } from "@/lib/queue/registry";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { AIProviderName, type AIRequestContext, type AIResponse, type AITaskType } from "@/lib/ai/types";
import { enqueue, getJob } from "@/lib/queue/service";
import { hashInput } from "@/lib/ai-platform/cache/keys";
import { decideRoute, killSwitchEngaged, stableSample, type MigratableService } from "./flags";
import { loadFlags } from "./flag-store";
import { recordComparison } from "./comparison";

/**
 * محوّل الترحيل — نمط شجرة التين الخانقة (Strangler Fig).
 *
 * يوضَع **داخل** `AIService.execute`، فتنتقل الواحد والثلاثون موضع
 * استدعاء دفعةً واحدة بلا تعديل أي منها. الواجهة لا تتغيّر: نفس
 * المدخلات، ونفس شكل المخرَج، ونفس السلوك عند الخطأ.
 *
 * ## الخاصية الأهم: الفشل إلى المسار القديم
 *
 * المسار الجديد يعتمد على وجود عامل حيّ. لو مفيش عامل — لأنه لم يُنشر
 * بعد، أو سقط، أو أُعيد تشغيله — فالمهمة تدخل الطابور ولا يسحبها أحد،
 * والمنصة كلها تتجمّد.
 *
 * لذلك المحوّل **يفحص وجود عامل حيّ قبل الإدراج**، ويرجع للمسار القديم
 * فورًا لو مفيش. والانتظار نفسه محدود بمهلة، وانتهاؤها يرجع للقديم
 * كذلك. النتيجة: أسوأ حالة في المسار الجديد = بطء بسيط، لا توقّف.
 */

/**
 * أقصى انتظار لنتيجة المهمة قبل الرجوع للمسار القديم.
 *
 * **يُشتقّ من مهلة النوع نفسه، لا رقم ثابت.** الرقم الثابت (١٨٠ ثانية)
 * كان أقصر من مهلة المراجعة الهندسية (٢٠٠ ثانية)، فالنتيجة كانت
 * هتبقى: المستخدم يستنّى ثلاث دقايق، المحوّل يعلن التأخّر ويرجع
 * للقديم، فيستنّى ثلاث دقايق تانية. ضِعف الانتظار بلا أي فايدة.
 *
 * الهامش يغطّي زمن الإدراج والسحب وكتابة النتيجة.
 */
const WAIT_MARGIN_MS = 30_000;
const FALLBACK_WAIT_MS = 180_000;
/** سقف مطلق: انتظار أطول من كده يقتل صبر المستخدم مهما كانت المهمة. */
const MAX_WAIT_CEILING_MS = 300_000;

export function waitBudgetFor(jobType: string): number {
  const handler = getJobHandler(jobType);
  const base = handler?.timeoutMs ?? FALLBACK_WAIT_MS;
  return Math.min(base + WAIT_MARGIN_MS, MAX_WAIT_CEILING_MS);
}

const POLL_INTERVAL_MS = 1_000;

/**
 * مهلة السحب: لو المهمة فضلت في الطابور بلا ما يسحبها عامل خلال المدة
 * دي، يبقى مافيش عامل فعلًا — نرجع للقديم فورًا بدل انتظار الميزانية.
 *
 * **الحالة اللي بيعالجها:** العامل وقع لسه. نبضته الأخيرة لسه داخل
 * نافذة الثلاث دقائق، فالمحوّل بيفتكره حيًّا ويُدرج. بدون المهلة دي،
 * كل طلب في الدقائق التلاتة دول كان بيستنّى ميزانيته كاملة ثم يرجع —
 * أي دقيقة زيادة على كل مستخدم مقابل معلومة كنا نقدر نعرفها في عشرين
 * ثانية.
 *
 * عشرون ثانية أطول بكتير من زمن السحب الطبيعي (فاصل السحب ثانيتان).
 */
const CLAIM_GRACE_MS = 20_000;
/** عامل بلا نبضة أحدث من دي يُعتبر ميتًا. */
const WORKER_ALIVE_WINDOW_MS = 180_000;

/** ذاكرة قصيرة لحالة العمال — الفحص يحدث مع كل نداء. */
let workerCache: { types: Set<string>; at: number } | null = null;
const WORKER_CACHE_TTL_MS = 15_000;

export function invalidateWorkerCache(): void {
  workerCache = null;
}

/** أنواع المهام التي يوجد لها عامل حيّ الآن. */
async function liveWorkerTypes(db: SupabaseClient): Promise<Set<string>> {
  if (workerCache && Date.now() - workerCache.at < WORKER_CACHE_TTL_MS) {
    return workerCache.types;
  }

  const since = new Date(Date.now() - WORKER_ALIVE_WINDOW_MS).toISOString();
  const types = new Set<string>();

  try {
    const { data } = await db
      .from("queue_workers")
      .select("handled_types, status, heartbeat_at")
      .neq("status", "stopped")
      .gte("heartbeat_at", since);

    for (const row of (data ?? []) as Array<{ handled_types: string[] }>) {
      for (const type of row.handled_types ?? []) types.add(type);
    }
  } catch (err) {
    // تعذّر الفحص = نفترض عدم وجود عامل. الافتراض المتفائل هنا يعلّق
    // كل نداء لدقائق؛ والمتشائم يكلّف مسارًا قديمًا يعمل أصلًا.
    console.error("[migration] تعذّر فحص العمال — المسار القديم:", err);
  }

  workerCache = { types, at: Date.now() };
  return types;
}

export interface RouteInput {
  taskType: AITaskType;
  input: string;
  context?: AIRequestContext;
}

/**
 * الخدمة ← نوع مهمة الطابور.
 *
 * التوصيات ليس لها عامل مستقل: مصدرها استخراج المعرفة، فتمرّ من
 * `ai.knowledge` — نفس المعالج ونفس النموذج.
 */
const JOB_TYPE_BY_SERVICE: Record<MigratableService, string> = {
  meeting: "ai.meeting",
  discovery: "ai.discovery",
  brain: "ai.brain",
  prd: "ai.prd",
  prototype: "ai.prototype",
  qa: "ai.qa",
  prompt: "ai.prompt",
  monitoring: "ai.monitoring",
  recommendations: "ai.knowledge",
  architecture: "ai.architecture",
  support: "ai.support",
  knowledge: "ai.knowledge",
};

export function jobTypeForService(service: MigratableService): string {
  return JOB_TYPE_BY_SERVICE[service];
}

export type LegacyExecutor = () => Promise<AIResponse>;

/**
 * ينفّذ عبر المسار الجديد أو القديم حسب العلم وحالة العمال.
 *
 * يرجّع دائمًا `AIResponse` — لا يرمي. أي عطل في المسار الجديد يتحوّل
 * لرجوع صامت للقديم مع تسجيل السبب.
 */
export async function routeExecution(
  route: RouteInput,
  legacy: LegacyExecutor,
  client?: SupabaseClient
): Promise<AIResponse> {
  const startedAt = Date.now();

  // مفتاح الإيقاف العام يغلب كل شيء ولا يحتاج قاعدة بيانات.
  if (killSwitchEngaged()) {
    return runLegacy(route, legacy, startedAt, null, "مفتاح الإيقاف العام مفعّل", client);
  }

  const db = client ?? createServiceClient();

  let decision;
  try {
    const flags = await loadFlags(db);
    decision = decideRoute({
      taskType: route.taskType,
      flags,
      sample: stableSample(`${route.taskType}:${hashInput(route.input)}`),
    });
  } catch (err) {
    return runLegacy(
      route,
      legacy,
      startedAt,
      null,
      `تعذّر قراءة الأعلام: ${err instanceof Error ? err.message : "خطأ"}`,
      db
    );
  }

  if (decision.path === "legacy") {
    return runLegacy(route, legacy, startedAt, decision.service, decision.reason, db);
  }

  // الوسائط (صوت/صورة) تُمرَّر كمرجع في الذاكرة، والحمولة في الطابور
  // نص مُسلسَل. نقل الوسائط يحتاج رفعها لمخزن ثم تمرير رابط موقَّع —
  // وده شغل نقل الملفات، مش شغل المحوّل. لحد ما يتعمل، مهام الوسائط
  // تفضل على المسار القديم.
  if (route.context?.media) {
    return runLegacy(
      route,
      legacy,
      startedAt,
      decision.service,
      "الطلب يحمل وسائط — المسار القديم حتى نقل الملفات",
      db
    );
  }

  const jobType = jobTypeForService(decision.service);

  // الحارس الأهم: لا نُدرج مهمة لن يسحبها أحد.
  const live = await liveWorkerTypes(db);
  if (!live.has(jobType)) {
    return runLegacy(
      route,
      legacy,
      startedAt,
      decision.service,
      `مفيش عامل حيّ لنوع «${jobType}» — رجوع آمن للمسار القديم`,
      db
    );
  }

  try {
    const result = await runViaQueue(route, jobType, db);
    if (result) {
      await recordComparison(
        {
          service: decision.service,
          taskType: route.taskType,
          path: "new",
          latencyMs: Date.now() - startedAt,
          success: result.success,
          fellBack: false,
        },
        db
      );
      return result;
    }
    return runLegacy(
      route,
      legacy,
      startedAt,
      decision.service,
      "المهمة ما خلّصتش في المهلة — رجوع للمسار القديم",
      db,
      true
    );
  } catch (err) {
    return runLegacy(
      route,
      legacy,
      startedAt,
      decision.service,
      `عطل في المسار الجديد: ${err instanceof Error ? err.message : "خطأ"}`,
      db,
      true
    );
  }
}

async function runLegacy(
  route: RouteInput,
  legacy: LegacyExecutor,
  startedAt: number,
  service: MigratableService | null,
  reason: string,
  client?: SupabaseClient | null,
  fellBack = false
): Promise<AIResponse> {
  const response = await legacy();

  if (service && client) {
    await recordComparison(
      {
        service,
        taskType: route.taskType,
        path: "legacy",
        latencyMs: Date.now() - startedAt,
        success: response.success,
        fellBack,
        reason,
      },
      client
    ).catch(() => {});
  }

  return response;
}

/**
 * يدرج المهمة وينتظر نتيجتها.
 *
 * `null` تعني «لم تنتهِ في المهلة» — والمستدعي يرجع للمسار القديم.
 * المهمة نفسها **تبقى في الطابور وتكمل**؛ نتيجتها تُحفظ في مخزن
 * النتائج ولا تضيع، لكن هذا النداء لا ينتظرها أكثر.
 */
async function runViaQueue(
  route: RouteInput,
  jobType: string,
  db: SupabaseClient
): Promise<AIResponse | null> {
  const enqueued = await enqueue(
    {
      type: jobType,
      priority: "high",
      projectId: route.context?.projectId ?? null,
      createdBy: route.context?.actorId ?? null,
      payload: {
        taskType: route.taskType,
        prompt: route.input,
        projectId: route.context?.projectId ?? null,
        actorId: route.context?.actorId ?? null,
      },
    },
    db
  );

  if (enqueued.status === "rejected") return null;
  const jobId = enqueued.job.id;

  const startedAt = Date.now();
  const deadline = startedAt + waitBudgetFor(jobType);
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const job = await getJob(jobId, db);
    if (!job) return null;

    // مافيش عامل سحبها؟ خلاص، مافيش عامل. الرجوع دلوقتي أرخص من
    // انتظار ميزانية كاملة لنتيجة مش جاية.
    if (
      Date.now() - startedAt > CLAIM_GRACE_MS &&
      (job.status === "pending" || job.status === "queued")
    ) {
      return null;
    }

    if (job.status === "completed") {
      const output = extractOutput(job.result);
      if (output === null) return null;
      return {
        success: true,
        output,
        // المعالج بيكتب المزوّد والنموذج الفعليين في النتيجة، فالرد
        // هنا مطابق لرد المسار القديم لا تخمينًا عنه.
        model_used: String(job.result?.model ?? "unknown"),
        provider: (job.result?.provider as AIProviderName) ?? AIProviderName.GEMINI,
        latency_ms: job.execution_time_ms ?? 0,
        token_usage: null,
        cost: job.estimated_cost_usd ?? null,
        error: null,
        warnings: [],
        request_id: jobId,
      };
    }

    if (
      job.status === "failed" ||
      job.status === "dead_letter" ||
      job.status === "canceled" ||
      job.status === "timeout"
    ) {
      return null;
    }
  }

  return null;
}

function extractOutput(result: Record<string, unknown> | null): string | null {
  if (!result) return null;
  const output = result.output;
  if (typeof output === "string") return output;
  // المهام المقسَّمة ترجّع مصفوفة مقاطع مدموجة بالترتيب.
  if (Array.isArray(output)) return output.filter((p) => typeof p === "string").join("\n\n");
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
