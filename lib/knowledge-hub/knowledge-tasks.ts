import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { createTaskFromSource } from "@/lib/work/source-service";

/**
 * جسر المعرفة → المهام (الجزء السابع).
 *
 * ## البناء فوق الموجود
 *
 * طبقة المهام الموحّدة (`createTaskFromSource`) موجودة و idempotent. ده
 * **بيوصّلها بالمعرفة**: الفجوة أو الرأي الحرج بيتحوّل لمهمة موكَلة بدل
 * ما يفضل رقمًا في لوحة. الـ idempotency (source_type + reference)
 * بيمنع تكرار نفس المهمة كل جولة تحليل.
 *
 * التحويل **لا يُنشئ مهامًا عشوائيًا**: الفجوات عالية الأولوية والرؤى
 * الحرجة فقط — الباقي يفضل للمراجعة اليدوية.
 */

const UNDEFINED_TABLE = "42P01";

export interface KnowledgeTaskOutcome {
  created: number;
  duplicates: number;
}

/**
 * يحوّل الفجوات عالية الأولوية والرؤى الحرجة المفتوحة لمهام.
 */
export async function syncKnowledgeTasks(
  projectId: string,
  actorId?: string | null,
  client?: SupabaseClient
): Promise<KnowledgeTaskOutcome> {
  const db = client ?? createServiceClient();
  let created = 0;
  let duplicates = 0;

  // --- الفجوات عالية الأولوية ---
  const gaps = await db
    .from("knowledge_gaps")
    .select("id, description, why_it_matters, priority")
    .eq("project_id", projectId)
    .eq("status", "open")
    .eq("priority", "high")
    .limit(50);

  if (!gaps.error) {
    for (const g of (gaps.data ?? []) as Array<Record<string, string>>) {
      const r = await createTaskFromSource({
        projectId,
        title: `سدّ فجوة معرفية: ${truncate(g.description)}`,
        description: g.why_it_matters ?? null,
        sourceType: "knowledge_gap",
        sourceReference: g.id,
        priority: "high",
        createdBy: actorId ?? null,
      });
      if (r.ok && !r.duplicate) created += 1;
      else if (r.duplicate) duplicates += 1;
    }
  } else if (gaps.error.code !== UNDEFINED_TABLE) {
    console.error(`[KnowledgeTasks] تعذّر قراءة الفجوات: ${gaps.error.message}`);
  }

  // --- الرؤى الحرجة المفتوحة (الطبقة الاستشارية) ---
  const insights = await db
    .from("knowledge_insights")
    .select("id, title, detail, severity")
    .eq("project_id", projectId)
    .eq("status", "open")
    .eq("severity", "critical")
    .limit(50);

  if (!insights.error) {
    for (const i of (insights.data ?? []) as Array<Record<string, string>>) {
      const r = await createTaskFromSource({
        projectId,
        title: `معالجة رأي حرج: ${truncate(i.title)}`,
        description: i.detail ?? null,
        sourceType: "knowledge_insight",
        sourceReference: i.id,
        priority: "high",
        createdBy: actorId ?? null,
      });
      if (r.ok && !r.duplicate) created += 1;
      else if (r.duplicate) duplicates += 1;
    }
  } else if (insights.error.code !== UNDEFINED_TABLE) {
    console.error(`[KnowledgeTasks] تعذّر قراءة الرؤى: ${insights.error.message}`);
  }

  return { created, duplicates };
}

function truncate(text: string, max = 80): string {
  const t = (text ?? "").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}
