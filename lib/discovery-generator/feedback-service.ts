import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoveryQuestion } from "@/lib/types/database";

function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * أساس حلقة التعلّم — بعد تسليم اكتشاف نابع من قالب مُولَّد بالذكاء
 * الاصطناعي، نلتقط لكل سؤال: هل اتجاوب أم اتخطّى. البيانات دي بتتراكم
 * في discovery_generation_feedback عشان نتعلّم مع الوقت أي الأسئلة
 * مفيدة فعلًا لكل مجال. كمان بنحدّث usage_count/last_used_at للقالب.
 * فشل هذه العملية لا يؤثر على نجاح التسليم (تُستدعى في الخلفية).
 */
export async function captureGenerationFeedback(
  supabase: SupabaseClient,
  params: {
    templateId: string;
    projectId: string;
    questions: DiscoveryQuestion[];
    answers: Record<string, unknown>;
  }
): Promise<void> {
  const { data: tpl } = await supabase
    .from("discovery_form_templates")
    .select("source, industry_domain, usage_count")
    .eq("id", params.templateId)
    .maybeSingle();

  if (!tpl) return;

  // دايمًا نحدّث الاستخدام (لأي قالب) — إشارة مفيدة في المكتبة
  await supabase
    .from("discovery_form_templates")
    .update({ usage_count: ((tpl.usage_count as number | null) ?? 0) + 1, last_used_at: new Date().toISOString() })
    .eq("id", params.templateId);

  // نلتقط الـ feedback فقط للقوالب المُولَّدة (هي محور التعلّم)
  if (tpl.source !== "ai_generated") return;
  if (params.questions.length === 0) return;

  const domain = (tpl.industry_domain as string | null) ?? null;
  const rows = params.questions.map((q) => ({
    template_id: params.templateId,
    project_id: params.projectId,
    question_id: q.id,
    question_label: q.question,
    question_category: q.category,
    question_type: q.type,
    industry_domain: domain,
    was_answered: isAnswered(params.answers[q.id]),
  }));

  await supabase.from("discovery_generation_feedback").insert(rows);
}
