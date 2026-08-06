import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DiscoveryFormTemplate,
  DiscoveryQuestion,
} from "@/lib/types/database";

const TEMPLATE_COLUMNS =
  "id, name, slug, description, industry, icon, is_default, status, sort_order, created_at, updated_at, source, industry_domain, company_size, complexity, discovery_depth, ai_version, prompt_version, tags, estimated_project_size, estimated_question_count, created_by, usage_count, last_used_at, is_favorite, generation_input, version";

const QUESTION_COLUMNS =
  "id, template_id, question, description, type, required, placeholder, options, help_text, sort_order, ai_weight, category, validation, conditional, created_at, updated_at";

/** كل القوالب المفعّلة، مرتّبة (للـ Lead form واختيار القالب). */
export async function getActiveTemplates(
  supabase: SupabaseClient
): Promise<DiscoveryFormTemplate[]> {
  const { data } = await supabase
    .from("discovery_form_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("status", "active")
    .order("sort_order", { ascending: true });
  return (data ?? []) as DiscoveryFormTemplate[];
}

/** كل القوالب (للأدمن — بما فيها غير المفعّلة). */
export async function getAllTemplates(
  supabase: SupabaseClient
): Promise<DiscoveryFormTemplate[]> {
  const { data } = await supabase
    .from("discovery_form_templates")
    .select(TEMPLATE_COLUMNS)
    .order("sort_order", { ascending: true });
  return (data ?? []) as DiscoveryFormTemplate[];
}

export async function getTemplateById(
  supabase: SupabaseClient,
  id: string
): Promise<DiscoveryFormTemplate | null> {
  const { data } = await supabase
    .from("discovery_form_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as DiscoveryFormTemplate) ?? null;
}

/** أسئلة قالب واحد مرتّبة بالترتيب. */
export async function getTemplateQuestions(
  supabase: SupabaseClient,
  templateId: string
): Promise<DiscoveryQuestion[]> {
  const { data } = await supabase
    .from("discovery_questions")
    .select(QUESTION_COLUMNS)
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });
  return (data ?? []) as DiscoveryQuestion[];
}

/** عدد الأسئلة لكل قالب (للعرض في قائمة الأدمن) — map: template_id -> count. */
export async function getQuestionCounts(
  supabase: SupabaseClient
): Promise<Record<string, number>> {
  const { data } = await supabase.from("discovery_questions").select("template_id");
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { template_id: string }[]) {
    counts[row.template_id] = (counts[row.template_id] ?? 0) + 1;
  }
  return counts;
}

/** القالب الافتراضي (is_default) — يُستخدم كخيار fallback عند إنشاء مشروع بلا قالب. */
export async function getDefaultTemplate(
  supabase: SupabaseClient
): Promise<DiscoveryFormTemplate | null> {
  const { data } = await supabase
    .from("discovery_form_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("is_default", true)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as DiscoveryFormTemplate) ?? null;
}
