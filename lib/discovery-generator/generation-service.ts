import { createServiceClient } from "@/lib/supabase/service";
import { AIService } from "@/lib/ai/service";
import { AITaskType } from "@/lib/ai/types";
import {
  buildDiscoveryFormGenerationPrompt,
  DISCOVERY_FORM_PROMPT_VERSION,
} from "@/lib/ai/prompts/discovery-form-generation";
import {
  validateDiscoveryFormGeneration,
  type ParsedGeneratedForm,
} from "@/lib/ai/validation/discovery-form-generation";
import { buildDiscoveryKnowledgeContext } from "./knowledge-context";
import type { DiscoveryGenerationInput, DiscoveryQuestionConditional } from "@/lib/types/database";

export type GenerateResult =
  | { status: "success"; templateId: string; questionCount: number }
  | { status: "error"; code: string; message: string };

function slugify(name: string): string {
  const clean = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = crypto.randomUUID().slice(0, 6);
  return clean ? `${clean}-${suffix}` : `ai-discovery-${suffix}`;
}

/**
 * مولّد فورم الاكتشاف — القلب: يستقبل مُدخلات المستخدم، يجمع سياق
 * المعرفة التنظيمية للمجال، يستدعي الـ AI، يتحقق بصرامة، ثم يكتب النتيجة
 * كـ **قالب حقيقي** (discovery_form_templates.source='ai_generated')
 * وأسئلته (مع المنطق الشرطي). القالب المُولَّد بيظهر تلقائيًا في مكتبة
 * القوالب ويشتغل مع البوابة العامة وخط التحليل بدون أي بنية موازية.
 */
export async function generateDiscoveryTemplate(
  input: DiscoveryGenerationInput,
  actorId: string | null,
  existingJobId?: string
): Promise<GenerateResult> {
  const supabase = createServiceClient();

  // 1) سجّل/حدّث مهمة (job) للتتبّع. لو الـ Action أنشأها مسبقًا (عشان
  //    الـ polling) نستخدمها؛ وإلا ننشئ واحدة جديدة.
  let jobId = existingJobId;
  if (jobId) {
    await supabase.from("discovery_generation_jobs").update({ status: "running" }).eq("id", jobId);
  } else {
    const { data: job } = await supabase
      .from("discovery_generation_jobs")
      .insert({ status: "running", input, created_by: actorId })
      .select("id")
      .single();
    jobId = job?.id as string | undefined;
  }

  async function failJob(code: string, message: string): Promise<GenerateResult> {
    if (jobId) {
      await supabase
        .from("discovery_generation_jobs")
        .update({ status: "failed", error_code: code, error_message: message, finished_at: new Date().toISOString() })
        .eq("id", jobId);
    }
    return { status: "error", code, message };
  }

  // 2) سياق المعرفة التنظيمية للمجال (اختياري — أساس التعلّم)
  let knowledgeContext: string | null = null;
  try {
    knowledgeContext = await buildDiscoveryKnowledgeContext(supabase, input.industryDomain);
  } catch {
    knowledgeContext = null;
  }

  // 3) استدعِ الـ AI
  const prompt = buildDiscoveryFormGenerationPrompt(input, knowledgeContext);
  const response = await AIService.execute(AITaskType.DISCOVERY_FORM_GENERATION, prompt, {
    actorId: actorId ?? undefined,
  });

  if (jobId) {
    await supabase
      .from("discovery_generation_jobs")
      .update({
        provider: response.provider,
        model: response.model_used,
        prompt_tokens: response.token_usage?.input_tokens ?? null,
        completion_tokens: response.token_usage?.output_tokens ?? null,
        cost_usd: response.cost ?? null,
      })
      .eq("id", jobId);
  }

  if (!response.success) {
    return failJob(response.error?.code ?? "AI_ERROR", response.error?.message ?? "فشل استدعاء نموذج الذكاء الاصطناعي.");
  }

  // 4) تحقّق صارم
  const validation = validateDiscoveryFormGeneration(response.output, input.depth);
  if (!validation.ok) {
    return failJob("VALIDATION_FAILED", validation.reason);
  }
  const form = validation.data;

  // 5) اكتب القالب + الأسئلة
  const write = await persistGeneratedForm(supabase, form, input, actorId, response.model_used);
  if (write.status === "error") {
    return failJob(write.code, write.message);
  }

  if (jobId) {
    await supabase
      .from("discovery_generation_jobs")
      .update({ status: "completed", template_id: write.templateId, output: response.output, finished_at: new Date().toISOString() })
      .eq("id", jobId);
  }

  return { status: "success", templateId: write.templateId, questionCount: write.questionCount };
}

async function persistGeneratedForm(
  supabase: ReturnType<typeof createServiceClient>,
  form: ParsedGeneratedForm,
  input: DiscoveryGenerationInput,
  actorId: string | null,
  modelUsed: string
): Promise<GenerateResult> {
  const templateName = (input.templateName?.trim() || form.name).slice(0, 160);

  const { data: maxRow } = await supabase
    .from("discovery_form_templates")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow?.sort_order as number | undefined) ?? 0) + 1;

  const { data: tpl, error: tplErr } = await supabase
    .from("discovery_form_templates")
    .insert({
      name: templateName,
      slug: slugify(templateName),
      description: form.description,
      industry: input.industryDomain,
      icon: "Sparkles",
      status: "active",
      sort_order: nextOrder,
      source: "ai_generated",
      industry_domain: input.industryDomain,
      company_size: input.companySize,
      complexity: input.complexity,
      discovery_depth: input.depth,
      ai_version: modelUsed,
      prompt_version: DISCOVERY_FORM_PROMPT_VERSION,
      tags: form.tags,
      estimated_project_size: form.estimatedProjectSize,
      estimated_question_count: form.questions.length,
      created_by: actorId,
      generation_input: input,
      version: 1,
    })
    .select("id")
    .single();

  if (tplErr || !tpl) {
    return { status: "error", code: "DB_TEMPLATE", message: tplErr?.message ?? "تعذّر إنشاء القالب." };
  }
  const templateId = tpl.id as string;

  // خريطة ref → UUID فعلي — لازم ننشئ الـ ids قبل ما نربط المنطق الشرطي
  const refToId = new Map<string, string>();
  const rows = form.questions.map((q, index) => {
    const id = crypto.randomUUID();
    refToId.set(q.ref, id);
    return { q, id, order: index + 1 };
  });

  const insertRows = rows.map(({ q, id, order }) => {
    let conditional: DiscoveryQuestionConditional | null = null;
    if (q.conditional) {
      const dependsOnId = refToId.get(q.conditional.dependsOnRef);
      // الحارس النهائي: dependsOnRef لازم يكون سؤالًا فعليًا في نفس الفورم
      if (dependsOnId) {
        conditional = {
          dependsOn: dependsOnId,
          operator: q.conditional.operator,
          ...(q.conditional.value !== undefined ? { value: q.conditional.value } : {}),
        };
      }
    }
    return {
      id,
      template_id: templateId,
      question: q.question,
      description: q.description,
      type: q.type,
      required: q.required,
      placeholder: q.placeholder,
      options: q.options,
      help_text: q.help_text,
      sort_order: order,
      ai_weight: 1,
      category: q.category,
      validation: {},
      conditional,
    };
  });

  const { error: qErr } = await supabase.from("discovery_questions").insert(insertRows);
  if (qErr) {
    // نظّف القالب اليتيم لو فشل إدخال الأسئلة
    await supabase.from("discovery_form_templates").delete().eq("id", templateId);
    return { status: "error", code: "DB_QUESTIONS", message: qErr.message };
  }

  return { status: "success", templateId, questionCount: insertRows.length };
}
