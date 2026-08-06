import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { enqueue } from "@/lib/queue/service";
import { jobTypeForGroup } from "@/lib/queue/handlers/knowledge";
import { sourceGroup, type KnowledgeSourceType } from "./model";

/**
 * موجّه الاستيراد — **يقرّر: طابور ولا معالجة مباشرة**.
 *
 * ## نفس نمط المرحلة الرابعة، ونفس السبب
 *
 * المعالجة كانت بتشتغل داخل دالة Vercel من Server Action. النقل
 * للطابور بيشيلها لعامل بلا حد زمني — وده الغرض.
 *
 * لكن **لو مفيش عامل حيّ، الطابور بيبقى حفرة**: المهمة تدخل ومحدش
 * يسحبها، والمستخدم يستنّى بلا نتيجة. الدرس ده اتدفع تمنه في المرحلة
 * الرابعة، فالحارس هنا موجود من أول يوم لا بعد أول عطل.
 *
 * الرجوع للمعالجة المباشرة **مش تراجعًا** — هو المسار اللي شغّال
 * النهارده، وبيفضل صالحًا لحد ما العمّال تستقرّ.
 */

const WORKER_ALIVE_WINDOW_MS = 180_000;
const WORKER_CACHE_TTL_MS = 15_000;

let workerCache: { types: Set<string>; at: number } | null = null;

export function invalidateKnowledgeWorkerCache(): void {
  workerCache = null;
}

async function liveWorkerTypes(db: SupabaseClient): Promise<Set<string>> {
  if (workerCache && Date.now() - workerCache.at < WORKER_CACHE_TTL_MS) {
    return workerCache.types;
  }

  const since = new Date(Date.now() - WORKER_ALIVE_WINDOW_MS).toISOString();
  const types = new Set<string>();

  try {
    const { data } = await db
      .from("queue_workers")
      .select("handled_types")
      .neq("status", "stopped")
      .gte("heartbeat_at", since);

    for (const row of (data ?? []) as Array<{ handled_types: string[] }>) {
      for (const type of row.handled_types ?? []) types.add(type);
    }
  } catch (err) {
    // تعذّر الفحص = نفترض عدم وجود عامل. الافتراض المتفائل بيعلّق
    // الاستيراد، والمتشائم بيكلّف مسارًا مباشرًا يعمل أصلًا.
    console.error("[knowledge-hub] تعذّر فحص العمال:", err);
  }

  workerCache = { types, at: Date.now() };
  return types;
}

export type IngestRoute =
  | { path: "queue"; jobId: string; jobType: string; reason: string }
  | { path: "inline"; reason: string };

/**
 * يقرّر مسار استيراد مصدر ويُدرج المهمة لو الطابور متاح.
 *
 * @returns `inline` معناها إن المستدعي لازم يشغّل `processNextSource`
 *          بنفسه — الموجّه ما بيعملش المعالجة، هو بيوجّه بس.
 */
export async function routeIngest(
  input: {
    projectId: string;
    sourceType: KnowledgeSourceType;
    sourceId?: string | null;
    actorId?: string | null;
    maxSources?: number;
  },
  client?: SupabaseClient
): Promise<IngestRoute> {
  const db = client ?? createServiceClient();

  const jobType = jobTypeForGroup(sourceGroup(input.sourceType));

  const live = await liveWorkerTypes(db);

  if (!live.has(jobType)) {
    return {
      path: "inline",
      reason: `مفيش عامل حيّ لنوع «${jobType}» — معالجة مباشرة.`,
    };
  }

  const enqueued = await enqueue(
    {
      type: jobType,
      priority: "normal",
      projectId: input.projectId,
      createdBy: input.actorId ?? null,
      payload: {
        projectId: input.projectId,
        sourceId: input.sourceId ?? null,
        actorId: input.actorId ?? null,
        maxSources: input.maxSources ?? 5,
      },
    },
    db
  );

  if (enqueued.status === "rejected") {
    // الرفض في الأغلب ضغط عكسي. المعالجة المباشرة أبطأ لكنها بتوصل
    // لنتيجة — والبديل إن المستخدم يرفع ملفًا ومايحصلّهوش حاجة.
    return { path: "inline", reason: `الطابور رفض الإدراج: ${enqueued.reason}` };
  }

  return {
    path: "queue",
    jobId: enqueued.job.id,
    jobType,
    reason:
      enqueued.status === "deduplicated"
        ? "مهمة مطابقة شغّالة بالفعل — ما اتضافتش مهمة تانية."
        : "اتدرجت في الطابور.",
  };
}
