"use server";

import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/rbac";
import { createServiceClient } from "@/lib/supabase/service";
import { generateDiscoveryTemplate } from "@/lib/discovery-generator/generation-service";
import type {
  DiscoveryCompanySize,
  DiscoveryComplexity,
  DiscoveryDepth,
  DiscoveryGenerationInput,
  ProjectDomain,
} from "@/lib/types/database";

const DOMAINS: ProjectDomain[] = [
  "erp", "crm", "lms", "healthcare", "legal", "construction", "hospital",
  "ecommerce", "restaurant", "factory", "clinic", "school", "warehouse", "accounting", "generic",
];
const SIZES: DiscoveryCompanySize[] = ["startup", "sme", "enterprise", "government"];
const COMPLEXITIES: DiscoveryComplexity[] = ["simple", "medium", "large", "enterprise"];
const DEPTHS: DiscoveryDepth[] = ["quick", "standard", "deep", "enterprise_audit"];

export interface GenerateActionInput {
  businessDescription: string;
  clientGoals?: string;
  knownFeatures?: string;
  industryDomain: string;
  companySize: string;
  complexity: string;
  depth: string;
  templateName?: string;
  /** تعليمات تحسين/إضافة لإعادة التوليد (اختياري). */
  refinement?: string;
  /** قالب سابق نبني عليه — نجيب أسئلته كسياق للتحسين (اختياري). */
  previousTemplateId?: string;
}

/**
 * يطلق توليد فورم اكتشاف — يتحقق من الصلاحية والمُدخلات، ينشئ سجل مهمة
 * (job) ويرجّع jobId فورًا، ثم يشغّل التوليد في الخلفية عبر after()
 * (يرث maxDuration=260 من صفحة المشروع). الواجهة بتعمل Poll على الـ job.
 */
export async function generateDiscoveryFormAction(
  input: GenerateActionInput
): Promise<{ ok: boolean; jobId?: string; message?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = createServiceClient();

  const refinement = input.refinement?.trim() || null;
  const isRefine = !!(refinement && input.previousTemplateId);

  // وضع التحسين: نجيب القالب السابق — إعداداته المخزّنة (generation_input)
  // وأسئلته — عشان نقدر نعيد التوليد لأي قالب مولّد سابقًا بدون ما المستخدم
  // يعيد ملء الفورم من الصفر. الفورم الحالي (لو مليان) يطغى على المخزّن.
  let previousQuestions: string[] | null = null;
  let storedInput: DiscoveryGenerationInput | null = null;
  if (isRefine) {
    const { data: prevTpl } = await supabase
      .from("discovery_form_templates")
      .select("generation_input")
      .eq("id", input.previousTemplateId!)
      .maybeSingle();
    storedInput = (prevTpl?.generation_input as DiscoveryGenerationInput | null) ?? null;

    const { data: prevQs } = await supabase
      .from("discovery_questions")
      .select("question")
      .eq("template_id", input.previousTemplateId!)
      .order("sort_order", { ascending: true });
    previousQuestions = (prevQs ?? []).map((q) => q.question as string).filter(Boolean);
  }

  // الحقول الأساسية: الفورم الحالي أولًا، وإلا إعدادات القالب المخزّنة.
  const businessDescription =
    (input.businessDescription ?? "").trim() || (storedInput?.businessDescription ?? "").trim();
  const industryDomain = (input.industryDomain || storedInput?.industryDomain || "") as string;
  const companySize = (input.companySize || storedInput?.companySize || "") as string;
  const complexity = (input.complexity || storedInput?.complexity || "") as string;
  const depth = (input.depth || storedInput?.depth || "") as string;

  if (businessDescription.length < 15) {
    return { ok: false, message: "اكتب وصفًا كافيًا لنشاط العميل (15 حرفًا على الأقل)." };
  }
  if (!DOMAINS.includes(industryDomain as ProjectDomain)) return { ok: false, message: "المجال غير صالح." };
  if (!SIZES.includes(companySize as DiscoveryCompanySize)) return { ok: false, message: "حجم الشركة غير صالح." };
  if (!COMPLEXITIES.includes(complexity as DiscoveryComplexity)) return { ok: false, message: "درجة التعقيد غير صالحة." };
  if (!DEPTHS.includes(depth as DiscoveryDepth)) return { ok: false, message: "عمق الاكتشاف غير صالح." };

  const genInput: DiscoveryGenerationInput = {
    businessDescription,
    clientGoals: input.clientGoals?.trim() || storedInput?.clientGoals || null,
    knownFeatures: input.knownFeatures?.trim() || storedInput?.knownFeatures || null,
    industryDomain: industryDomain as ProjectDomain,
    companySize: companySize as DiscoveryCompanySize,
    complexity: complexity as DiscoveryComplexity,
    depth: depth as DiscoveryDepth,
    templateName: input.templateName?.trim() || null,
    refinement,
    previousQuestions,
  };

  const { data: job, error } = await supabase
    .from("discovery_generation_jobs")
    .insert({ status: "pending", input: genInput, created_by: auth.userId ?? null })
    .select("id")
    .single();

  if (error || !job) return { ok: false, message: error?.message ?? "تعذّر بدء التوليد." };
  const jobId = job.id as string;

  after(async () => {
    try {
      await generateDiscoveryTemplate(genInput, auth.userId ?? null, jobId);
    } catch (err) {
      await supabase
        .from("discovery_generation_jobs")
        .update({
          status: "failed",
          error_code: "UNEXPECTED",
          error_message: err instanceof Error ? err.message : "خطأ غير متوقع.",
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }
  });

  return { ok: true, jobId };
}

/** حالة مهمة التوليد — للـ polling من الواجهة. */
export async function getDiscoveryGenerationStatusAction(
  jobId: string
): Promise<{ ok: boolean; status?: string; templateId?: string | null; message?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("discovery_generation_jobs")
    .select("status, template_id, error_message")
    .eq("id", jobId)
    .maybeSingle();

  if (!data) return { ok: false, message: "المهمة غير موجودة." };
  return {
    ok: true,
    status: data.status as string,
    templateId: (data.template_id as string | null) ?? null,
    message: (data.error_message as string | null) ?? undefined,
  };
}
