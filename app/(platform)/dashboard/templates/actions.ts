"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireRole } from "@/lib/auth/rbac";
import { getTemplateQuestions } from "@/lib/discovery-templates/queries";
import type {
  DiscoveryQuestionType,
  DiscoveryTemplateStatus,
  DiscoveryQuestionValidation,
} from "@/lib/types/database";

type ActionResult = { ok: boolean; message?: string; id?: string };

function slugify(name: string): string {
  // نبقّي على الحروف اللاتينية والأرقام فقط؛ أي شيء آخر (بما فيه العربية)
  // يتحوّل لفاصل. القيمة النهائية مضمونة الفرادة بلاحقة عشوائية.
  const clean = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = crypto.randomUUID().slice(0, 6);
  return clean ? `${clean}-${suffix}` : `template-${suffix}`;
}

function revalidate(templateId?: string) {
  revalidatePath("/dashboard/templates");
  if (templateId) revalidatePath(`/dashboard/templates/${templateId}`);
}

// ============================================================
// Templates
// ============================================================

export async function createTemplate(input: {
  name: string;
  industry?: string;
  icon?: string;
  description?: string;
}): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const name = input.name.trim();
  if (!name) return { ok: false, message: "اسم القالب مطلوب." };

  const supabase = await createClient();

  const { data: maxRow } = await supabase
    .from("discovery_form_templates")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("discovery_form_templates")
    .insert({
      name,
      slug: slugify(name),
      industry: input.industry?.trim() || null,
      icon: input.icon?.trim() || "Sparkles",
      description: input.description?.trim() || null,
      sort_order: nextOrder,
      status: "active",
    })
    .select("id")
    .single();

  if (error) return { ok: false, message: error.message };
  revalidate();
  return { ok: true, id: data?.id };
}

export async function updateTemplate(
  id: string,
  patch: {
    name?: string;
    industry?: string | null;
    icon?: string | null;
    description?: string | null;
  }
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) return { ok: false, message: "اسم القالب مطلوب." };
    update.name = n;
  }
  if (patch.industry !== undefined) update.industry = patch.industry?.trim() || null;
  if (patch.icon !== undefined) update.icon = patch.icon?.trim() || null;
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.from("discovery_form_templates").update(update).eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidate(id);
  return { ok: true };
}

export async function toggleTemplateFavorite(id: string, isFavorite: boolean): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("discovery_form_templates")
    .update({ is_favorite: isFavorite })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidate(id);
  return { ok: true };
}

/** تصدير قالب كـ JSON (قالب + أسئلته) — يرجّع النص لتنزيله من الواجهة. */
export async function exportTemplateJson(id: string): Promise<{ ok: boolean; json?: string; name?: string; message?: string }> {
  const auth = await requireRole(["owner", "admin", "member"]);
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const { data: template } = await supabase
    .from("discovery_form_templates")
    .select("name, description, industry, industry_domain, source, complexity, discovery_depth, tags, estimated_question_count")
    .eq("id", id)
    .maybeSingle();
  if (!template) return { ok: false, message: "القالب غير موجود." };

  const questions = await getTemplateQuestions(supabase, id);
  const payload = {
    exported_at: new Date().toISOString(),
    format: "velora.discovery_template.v1",
    template,
    questions: questions.map((q) => ({
      question: q.question,
      description: q.description,
      type: q.type,
      required: q.required,
      placeholder: q.placeholder,
      options: q.options,
      help_text: q.help_text,
      category: q.category,
      sort_order: q.sort_order,
      conditional: q.conditional,
    })),
  };
  return { ok: true, json: JSON.stringify(payload, null, 2), name: template.name as string };
}

export async function setTemplateStatus(
  id: string,
  status: DiscoveryTemplateStatus
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("discovery_form_templates")
    .update({ status })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidate(id);
  return { ok: true };
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();

  // منع حذف قالب مستخدم فعليًا في مشاريع (نفصله بدل ما نكسر مرجعية)
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("discovery_template_id", id);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      message: `القالب مستخدم في ${count} مشروع — عطّله بدل الحذف، أو غيّر قالب المشاريع أولاً.`,
    };
  }

  // الأسئلة تُحذف تلقائيًا (on delete cascade)
  const { error } = await supabase.from("discovery_form_templates").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidate();
  return { ok: true };
}

export async function duplicateTemplate(id: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();

  const { data: original } = await supabase
    .from("discovery_form_templates")
    .select("name, industry, icon, description")
    .eq("id", id)
    .maybeSingle();

  if (!original) return { ok: false, message: "القالب غير موجود." };

  const { data: maxRow } = await supabase
    .from("discovery_form_templates")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? 0) + 1;

  const newName = `${original.name} (نسخة)`;
  const { data: copy, error: copyErr } = await supabase
    .from("discovery_form_templates")
    .insert({
      name: newName,
      slug: slugify(newName),
      industry: original.industry,
      icon: original.icon,
      description: original.description,
      sort_order: nextOrder,
      status: "inactive",
      is_default: false,
    })
    .select("id")
    .single();

  if (copyErr || !copy) return { ok: false, message: copyErr?.message ?? "فشل النسخ." };

  const questions = await getTemplateQuestions(supabase, id);
  if (questions.length > 0) {
    const rows = questions.map((q) => ({
      template_id: copy.id,
      question: q.question,
      description: q.description,
      type: q.type,
      required: q.required,
      placeholder: q.placeholder,
      options: q.options,
      help_text: q.help_text,
      sort_order: q.sort_order,
      ai_weight: q.ai_weight,
      category: q.category,
      validation: q.validation,
    }));
    const { error: qErr } = await supabase.from("discovery_questions").insert(rows);
    if (qErr) return { ok: false, message: qErr.message };
  }

  revalidate();
  return { ok: true, id: copy.id };
}

// ============================================================
// Questions
// ============================================================

export interface QuestionInput {
  question: string;
  description?: string | null;
  type: DiscoveryQuestionType;
  required?: boolean;
  placeholder?: string | null;
  options?: string[];
  help_text?: string | null;
  ai_weight?: number;
  category?: string | null;
  validation?: DiscoveryQuestionValidation;
}

export async function createQuestion(
  templateId: string,
  input: QuestionInput
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const question = input.question.trim();
  if (!question) return { ok: false, message: "نص السؤال مطلوب." };

  const supabase = await createClient();

  const { data: maxRow } = await supabase
    .from("discovery_questions")
    .select("sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("discovery_questions")
    .insert({
      template_id: templateId,
      question,
      description: input.description?.trim() || null,
      type: input.type,
      required: input.required ?? false,
      placeholder: input.placeholder?.trim() || null,
      options: input.options ?? [],
      help_text: input.help_text?.trim() || null,
      sort_order: nextOrder,
      ai_weight: input.ai_weight ?? 1,
      category: input.category?.trim() || null,
      validation: input.validation ?? {},
    })
    .select("id")
    .single();

  if (error) return { ok: false, message: error.message };
  revalidate(templateId);
  return { ok: true, id: data?.id };
}

export async function updateQuestion(
  templateId: string,
  questionId: string,
  input: QuestionInput
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const question = input.question.trim();
  if (!question) return { ok: false, message: "نص السؤال مطلوب." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("discovery_questions")
    .update({
      question,
      description: input.description?.trim() || null,
      type: input.type,
      required: input.required ?? false,
      placeholder: input.placeholder?.trim() || null,
      options: input.options ?? [],
      help_text: input.help_text?.trim() || null,
      ai_weight: input.ai_weight ?? 1,
      category: input.category?.trim() || null,
      validation: input.validation ?? {},
    })
    .eq("id", questionId);

  if (error) return { ok: false, message: error.message };
  revalidate(templateId);
  return { ok: true };
}

export async function deleteQuestion(
  templateId: string,
  questionId: string
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();
  const { error } = await supabase.from("discovery_questions").delete().eq("id", questionId);
  if (error) return { ok: false, message: error.message };
  revalidate(templateId);
  return { ok: true };
}

/** إعادة ترتيب الأسئلة بالسحب — يستقبل قائمة الـ ids بالترتيب الجديد. */
export async function reorderQuestions(
  templateId: string,
  orderedIds: string[]
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  const supabase = await createClient();

  // نحدّث sort_order لكل سؤال حسب موقعه الجديد
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from("discovery_questions")
        .update({ sort_order: index + 1 })
        .eq("id", id)
        .eq("template_id", templateId)
    )
  );

  revalidate(templateId);
  return { ok: true };
}
