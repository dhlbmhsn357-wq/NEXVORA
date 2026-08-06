import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { Lesson } from "./verification-types";

/**
 * تكامل الذاكرة المؤسسية — بعد اعتماد المشروع، يحفظ الدروس المستفادة
 * (المشاكل/الحلول/أفضل الممارسات/التوصيات) كمرشّحات خبرة (حاجز مراجعة
 * المدير) لتحسين مشاريع الترحيل المستقبلية. **مشتقّات معقّمة فقط.**
 */

const TYPE_MAP: Record<Lesson["category"], string> = {
  problem: "failure_pattern",
  solution: "lesson_learned",
  best_practice: "best_practice",
  recommendation: "lesson_learned",
};

export async function promoteGoLiveToOrgMemory(verificationId: string, lessons: Lesson[], projectId: string | null, domain: string, actorId: string | null, client?: SupabaseClient): Promise<{ ok: boolean; count?: number; message?: string }> {
  const db = client ?? createServiceClient();
  if (!lessons.length) return { ok: true, count: 0, message: "لا دروس للترقية." };

  const rows = lessons.slice(0, 20).map((l) => ({
    project_id: projectId,
    experience_type: TYPE_MAP[l.category] ?? "lesson_learned",
    domain,
    title: l.title,
    content: l.detail,
    detail: { source: "go_live_certification", verification_id: verificationId, category: l.category },
    sanitized: true,
    suggested_confidence: 80,
    status: "pending",
  }));

  try {
    const ins = await db.from("org_experience_candidates").insert(rows);
    if (ins.error) return { ok: false, message: ins.error.message };
  } catch {
    return { ok: false, message: "تعذّر حفظ المرشّحات (جدول الذاكرة المؤسسية غير متاح)." };
  }
  await db.from("go_live_verifications").update({ promoted_to_org_memory: true }).eq("id", verificationId);
  void actorId;
  return { ok: true, count: rows.length, message: `رُقّي ${rows.length} درسًا (بانتظار مراجعة المدير).` };
}
