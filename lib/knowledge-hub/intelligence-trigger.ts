import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { enqueue } from "@/lib/queue/service";
import { KNOWLEDGE_INTELLIGENCE_JOB_TYPE } from "@/lib/queue/handlers/knowledge";

/**
 * مُشغّل التحليل المستمر — **بعد أي تغيير، لا تنتظر المستخدم**.
 *
 * ## الفلسفة (من المواصفة)
 *
 * «النظام لا ينتظر سؤال المستخدم، بل يحلل المعرفة باستمرار.» بعد ما
 * المعالجة تنتهي، ده بيطلق جولة ذكاء تلقائيًا.
 *
 * ## الحارس: عامل حيّ وإلا مباشر
 *
 * نفس درس المرحلة الرابعة: **لو مفيش عامل حيّ، الطابور حفرة**. فبنفحص
 * أولًا؛ لو فيه عامل `knowledge_intelligence` حيّ نُدرج المهمة، وإلا
 * نشغّل التحليل مباشرةً (المسار اللي شغّال النهارده).
 *
 * التشغيل المباشر بيتحصل عبر `after()` من المستدعي لو كان Server Action
 * — عشان مايأخّرش رد المستخدم.
 */

const WORKER_ALIVE_WINDOW_MS = 180_000;

async function hasLiveIntelligenceWorker(db: SupabaseClient): Promise<boolean> {
  const since = new Date(Date.now() - WORKER_ALIVE_WINDOW_MS).toISOString();
  try {
    const { data } = await db
      .from("queue_workers")
      .select("handled_types")
      .neq("status", "stopped")
      .gte("heartbeat_at", since);
    for (const row of (data ?? []) as Array<{ handled_types: string[] }>) {
      if ((row.handled_types ?? []).includes("knowledge_intelligence")) return true;
    }
  } catch (err) {
    // تعذّر الفحص = نفترض عدم وجود عامل، فنرجع للمسار المباشر.
    console.error("[KnowledgeIntel] تعذّر فحص العمال:", err);
  }
  return false;
}

export type IntelligenceTrigger =
  | { path: "queue"; jobId?: string }
  | { path: "inline" }
  | { path: "skipped"; reason: string };

/**
 * يطلق جولة ذكاء للمشروع: طابور لو فيه عامل، وإلا مباشر.
 *
 * @param runInline دالة التشغيل المباشر — يمرّرها المستدعي (عادةً
 *        `() => runIntelligence(projectId, actorId)`) عشان نتجنّب دورة
 *        استيراد مع الخدمة.
 */
export async function triggerIntelligence(
  projectId: string,
  runInline: () => Promise<unknown>,
  actorId?: string | null,
  client?: SupabaseClient
): Promise<IntelligenceTrigger> {
  if (!projectId) return { path: "skipped", reason: "لا يوجد مشروع." };
  const db = client ?? createServiceClient();

  if (await hasLiveIntelligenceWorker(db)) {
    const result = await enqueue(
      {
        type: KNOWLEDGE_INTELLIGENCE_JOB_TYPE,
        projectId,
        createdBy: actorId ?? null,
        payload: { projectId, actorId: actorId ?? null },
        // قفل المشروع — جولتان متزامنتان مايكتبوش رؤى متضاربة.
        lockKey: `knowledge:${projectId}`,
      },
      db
    );
    if (result.status === "created" || result.status === "deduplicated" || result.status === "idempotent_replay") {
      return { path: "queue", jobId: result.job.id };
    }
    // الطابور رفض (ضغط عكسي مثلًا) → نرجع للمباشر بدل ما نضيع التحليل.
  }

  await runInline();
  return { path: "inline" };
}
